/**
 * In-process TTL guard against the publish/sync race condition.
 *
 * Window being closed: after the scheduler writes status=published to the local
 * DB but before it finishes PATCHing Airtable's Finished field, an Airtable sync
 * could read Finished=false and revert the article to draft.
 *
 * When the scheduler successfully pushes Finished=true for an article, it calls
 * markRecentlyPublished(externalId). syncArticlesFromAirtable then skips any
 * draft-revert for records whose externalId appears within the TTL window.
 */

const RECENTLY_PUBLISHED_TTL_MS = 5 * 60 * 1000; // 5 minutes

const recentlyPublishedAt = new Map<string, number>(); // externalId → Date.now()

export function markRecentlyPublished(externalId: string): void {
    recentlyPublishedAt.set(externalId, Date.now());
}

export function isRecentlyPublished(externalId: string): boolean {
    const ts = recentlyPublishedAt.get(externalId);
    if (ts === undefined) return false;
    return Date.now() - ts < RECENTLY_PUBLISHED_TTL_MS;
}
