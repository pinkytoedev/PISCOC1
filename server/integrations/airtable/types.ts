/**
 * Airtable record shapes.
 *
 * Read and write shapes are kept separate because they genuinely differ:
 * Airtable returns attachments as objects carrying ids, sizes and thumbnails
 * but accepts them as `{url, filename}`, and a write may send `null` to clear a
 * cell — something that never appears in a response. The previous single
 * `AirtableArticle` alias covered both, which is why reading `MainImageLink`
 * only type-checked by casting the response to the *request* interface.
 */

export interface AirtableThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface AirtableAttachment {
  id?: string;
  url?: string;
  filename?: string;
  size?: number;
  type?: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small?: AirtableThumbnail;
    large?: AirtableThumbnail;
    full?: AirtableThumbnail;
  };
}

export interface AirtableRecord<TFields> {
  id: string;
  fields: TFields;
  createdTime?: string;
}

export interface AirtableListResponse<TFields> {
  records: AirtableRecord<TFields>[];
  /** Cursor for the next page; absent on the last one. */
  offset?: string;
}

/** A record in a create (no id) or update (id required) batch. */
export interface AirtableWriteRecord {
  id?: string;
  fields: Record<string, unknown>;
}

/**
 * Articles table as read.
 *
 * The index signature is deliberate: bases in the wild carry field names that
 * differ in case or trailing whitespace ("Republished " vs "republished"), and
 * the sync matches those by scanning keys rather than by literal access.
 */
export interface AirtableArticleFields {
  Name?: string;
  Body?: string;
  Description?: string;
  Date?: string;
  Scheduled?: string;
  Featured?: boolean;
  Finished?: boolean;
  Hashtags?: string;
  message_sent?: boolean;
  MainImage?: AirtableAttachment[];
  instaPhoto?: AirtableAttachment[];
  MainImageLink?: string;
  InstaPhotoLink?: string;
  Author?: string[];
  Photo?: string[];
  'Name (from Author)'?: string[];
  'Name (from Photo)'?: string[];
  [field: string]: unknown;
}

/** Articles table as written. */
export interface AirtableArticleFieldsWrite {
  Name: string;
  Body: string;
  Description?: string;
  Date?: string;
  /** `null` clears the cell — a draft must not keep a stale schedule. */
  Scheduled?: string | null;
  Featured?: boolean;
  Finished?: boolean;
  Hashtags?: string;
  message_sent?: boolean;
  MainImageLink?: string;
  InstaPhotoLink?: string;
  Author?: string[];
  Photo?: string[];
  _updatedTime?: string;
}

/** Teams table as read. `Role` is a multi-select, but older rows hold a string. */
export interface AirtableTeamMemberFields {
  Name?: string;
  Bio?: string;
  Role?: string[] | string;
  /** Link to a record in the photos table; not resolvable without a second call. */
  PhotoSub?: string[];
  DiscordID?: string;
  Slug?: string;
  [field: string]: unknown;
}

export interface AirtableTeamMemberFieldsWrite {
  Name: string;
  Role: string[];
  Bio?: string;
}

/** Carousel quotes table; the same two columns in both directions. */
export interface AirtableCarouselQuoteFields {
  main?: string;
  philo?: string;
}

/** Outcome shared by every sync and push routine. */
export interface SyncResults {
  created: number;
  updated: number;
  errors: number;
  details: string[];
}

export function emptyResults(): SyncResults {
  return { created: 0, updated: 0, errors: 0, details: [] };
}
