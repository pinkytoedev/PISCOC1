/**
 * Renders the documentation markdown that ships in `docs/`.
 *
 * The same files are what GitHub shows, so there is exactly one copy of the
 * prose: `/docs` in the app and the repository read the identical source rather
 * than drifting apart.
 *
 * Output is sanitized even though the input is our own repository content —
 * `marked` passes raw HTML through by default, and the cost of running it
 * through DOMPurify is nil next to the cost of being wrong about that.
 */

import { marked } from "marked";
import DOMPurify from "dompurify";

export interface DocHeading {
  /** `id` of the rendered heading, used as the anchor target. */
  id: string;
  text: string;
  /** 2 or 3 — h1 is the page title and is not listed. */
  level: number;
}

export interface RenderedDoc {
  html: string;
  headings: DocHeading[];
}

/** `Article lifecycle` -> `article-lifecycle`, stable across renders. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Turns a markdown document into sanitized HTML plus its heading outline.
 *
 * Headings get deterministic ids so the table of contents can link to them and
 * so a `/docs#some-section` URL survives a reload.
 */
export function renderDoc(markdown: string): RenderedDoc {
  const headings: DocHeading[] = [];
  const used = new Map<string, number>();

  const renderer = new marked.Renderer();

  renderer.heading = ({ text, depth }) => {
    // `text` still contains inline markdown; render it, then strip tags for the
    // plain-text form the table of contents shows.
    const inline = marked.parseInline(text) as string;
    const plain = inline.replace(/<[^>]*>/g, "");

    const base = slugify(plain);
    // Two sections with the same name would otherwise fight over one anchor.
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;

    if (depth === 2 || depth === 3) {
      headings.push({ id, text: plain, level: depth });
    }

    return `<h${depth} id="${id}">${inline}</h${depth}>`;
  };

  // Long tables are the main horizontal-overflow risk on a phone, so each one
  // gets its own scroll container rather than widening the page.
  renderer.table = ({ header, rows }) => {
    const head = header.map((cell) => `<th>${marked.parseInline(cell.text)}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${marked.parseInline(cell.text)}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="doc-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  };

  const raw = marked.parse(markdown, { renderer, async: false }) as string;

  return {
    html: DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel"] }),
    headings,
  };
}
