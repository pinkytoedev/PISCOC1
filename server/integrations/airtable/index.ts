/**
 * Public surface of the Airtable integration.
 *
 * Importers keep using `./integrations/airtable`; the module behind it is now a
 * directory split by direction of travel — `sync` pulls, `push` writes,
 * `images` handles uploads, `client` talks to the API, `mappers` translates
 * field names.
 */

export { setupAirtableRoutes } from './routes';
export { deleteAirtableRecord } from './client';
export { convertToAirtableFormat, convertCarouselQuoteToAirtableFormat, mapRoleToAirtable, convertTeamMemberToAirtableFormat } from './mappers';
export { syncArticlesFromAirtable } from './sync';
export { pushArticleToAirtable } from './push';
export type { AirtableAttachment, AirtableAttachment as Attachment } from './types';
