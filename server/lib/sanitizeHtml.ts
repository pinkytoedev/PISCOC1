/**
 * HTML sanitization for contributor-supplied article bodies.
 *
 * Article content arrives as raw HTML inside an uploaded ZIP and is later
 * rendered with `dangerouslySetInnerHTML` in an authenticated editor session.
 * Without this step a contributor could execute script in that session, which
 * is a full account takeover. Sanitizing on write keeps the stored value
 * trustworthy; the client sanitizes again on render so rows written before this
 * existed are covered too.
 *
 * `sanitize-html` is used rather than DOMPurify because it parses with
 * htmlparser2 and needs no DOM implementation — pulling jsdom into the server
 * bundle for this would be both heavy and, on current Node, broken.
 */

import sanitize from 'sanitize-html';

/**
 * Tags an article body legitimately needs. Anything that can execute script or
 * pull in a remote document (`script`, `iframe`, `object`, `form`, `style`) is
 * deliberately absent.
 */
const ALLOWED_TAGS = [
  'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
  'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'section',
  'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'wbr',
];

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['class', 'id', 'lang', 'dir', 'title', 'style'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    time: ['datetime'],
  },
  // Only these schemes may appear in a URL attribute. Excluding `javascript:`
  // and `data:` closes the two routes that survive tag filtering.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],
  allowProtocolRelative: false,
  // Drop the text inside removed elements, so a stripped <script> does not
  // leave its source visible as body copy.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  // Inline styles are permitted but restricted to presentational properties;
  // `position`/`behavior`/`expression` have all been used for injection.
  allowedStyles: {
    '*': {
      color: [/^.*$/],
      'background-color': [/^.*$/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      'font-weight': [/^(normal|bold|lighter|bolder|[1-9]00)$/],
      'font-style': [/^(normal|italic|oblique)$/],
      'text-decoration': [/^(none|underline|line-through|overline)$/],
      margin: [/^[\d.\s]+(?:px|em|rem|%)?$/],
      padding: [/^[\d.\s]+(?:px|em|rem|%)?$/],
      width: [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      'max-width': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      height: [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
    },
  },
  transformTags: {
    // A link opened in a new tab hands `window.opener` to the destination
    // unless it is explicitly severed.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
};

export interface SanitizeResult {
  html: string;
  /** True when sanitization actually removed something — worth surfacing. */
  modified: boolean;
}

export function sanitizeArticleHtml(dirty: string): SanitizeResult {
  const clean = sanitize(dirty, SANITIZE_OPTIONS);

  // Compare on normalized whitespace so a document is not reported as modified
  // purely because the parser reformatted it.
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

  return { html: clean, modified: normalize(clean) !== normalize(dirty) };
}
