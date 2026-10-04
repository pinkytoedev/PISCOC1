/**
 * Roles a team member can be assigned, shared between the admin and public
 * team-member forms.
 *
 * Airtable's `Role` field is a multi-select (see `server/integrations/airtable/mappers.ts`),
 * so a value entered here that isn't already one of its options depends on
 * `typecast` to be accepted on push rather than rejecting the whole batch.
 * Keeping both forms restricted to this single list avoids near-duplicate
 * options (e.g. "writer" vs "Writer") reaching Airtable in the first place.
 */
export const TEAM_MEMBER_ROLES = [
  'Special Projects',
  'Photo',
  'Dev',
  'E-Board',
  'Writer',
] as const;

export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];
