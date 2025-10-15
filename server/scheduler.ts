import { storage } from "./storage";
import { log } from "./vite";
import { postArticleToInstagram } from "./integrations/instagram";
import type { Article } from "@shared/schema";
// Import the comprehensive Airtable conversion function
import { convertToAirtableFormat } from "./integrations/airtable";
// Import webhook notification function
import { notifyArticlePublished } from "./utils/webhookNotifier";

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

function parseScheduledDate(article: Article): Date | null {
    try {
        if (article.Scheduled) {
            const d = new Date(article.Scheduled as unknown as string);
            if (!isNaN(d.getTime())) return d;
        }
    } catch { }
    try {
        if (article.publishedAt) {
            const d = new Date(article.publishedAt as unknown as string);
            if (!isNaN(d.getTime())) return d;
        }
    } catch { }
    return null;
}

async function ensureArticleOnAirtable(article: Article): Promise<Article> {
    try {
        // Check Airtable settings
        const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
        const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
        const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");

        if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
            log("Airtable not configured; skipping sync for article " + article.id, "scheduler");
            return article;
        }

        // Use the comprehensive conversion function that the manual sync uses
        const fields = await convertToAirtableFormat(article);

        const url = `https://api.airtable.com/v0/${baseIdSetting.value}/${encodeURIComponent(tableNameSetting.value)}`;

        let res: Response;
        let airtableId: string;

        if (article.externalId) {
            // Article already exists in Airtable - UPDATE it
            log(`Updating existing Airtable record ${article.externalId} for article ${article.id}`, "scheduler");

            const body = JSON.stringify({
                records: [{
                    id: article.externalId,
                    fields
                }]
            });

            res = await fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${apiKeySetting.value}`,
                    "Content-Type": "application/json",
                },
                body,
            });

            airtableId = article.externalId;
        } else {
            // Article doesn't exist in Airtable - CREATE it
            log(`Creating new Airtable record for article ${article.id}`, "scheduler");

            const body = JSON.stringify({ records: [{ fields }] });

            res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKeySetting.value}`,
                    "Content-Type": "application/json",
                },
                body,
            });
        }

        const text = await res.text();
        if (!res.ok) {
            log(`Airtable sync failed (${res.status}): ${text}`, "scheduler");
            return article;
        }

        // For POST requests, extract the new Airtable ID
        if (!article.externalId) {
            const data = JSON.parse(text) as { records?: Array<{ id: string }> };
            const newAirtableId = data.records && data.records[0]?.id;
            if (!newAirtableId) {
                log("Airtable creation returned no record id", "scheduler");
                return article;
            }
            airtableId = newAirtableId;

            // Update the article with the new Airtable ID
            const updated = await storage.updateArticle(article.id, {
                externalId: airtableId,
                source: "airtable",
            } as any);

            if (updated) {
                log(`Article ${article.id} created in Airtable with id ${airtableId}`, "scheduler");
                return updated as Article;
            }
        } else {
            // For PATCH requests, the article already has the externalId
            log(`Article ${article.id} updated in Airtable (id: ${airtableId})`, "scheduler");
        }

    } catch (err) {
        log(`Error syncing article ${article.id} with Airtable: ${String(err)}`, "scheduler");
    }
    return article;
}

async function moveImageLinksToAirtable(article: Article): Promise<void> {
    try {
        // Require an existing Airtable record
        if (!article.externalId) {
            return;
        }

        // Gather link fields from the local article
        const fieldsToUpdate: Record<string, string> = {};
        if (article.imageUrl) {
            fieldsToUpdate["MainImageLink"] = article.imageUrl;
        }
        if (article.instagramImageUrl) {
            fieldsToUpdate["InstaPhotoLink"] = article.instagramImageUrl;
        }

        // Nothing to move
        if (Object.keys(fieldsToUpdate).length === 0) {
            return;
        }

        // Read Airtable config
        const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
        const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
        const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");

        if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
            log("Airtable not configured; skipping moving links for article " + article.id, "scheduler");
            return;
        }

        const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${encodeURIComponent(tableNameSetting.value)}/${article.externalId}`;
        const body = JSON.stringify({ fields: fieldsToUpdate });

        const res = await fetch(airtableUrl, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${apiKeySetting.value}`,
                "Content-Type": "application/json",
            },
            body,
        });

        const text = await res.text();
        if (!res.ok) {
            // Common error when a field does not exist in Airtable
            log(`Failed to move links to Airtable for article ${article.id} (${res.status}): ${text}`, "scheduler");
            return;
        }

        log(`Moved image links to Airtable for article ${article.id}`, "scheduler");
    } catch (err) {
        log(`Error moving links to Airtable for article ${article.id}: ${String(err)}`, "scheduler");
    }
}

async function publishArticle(article: Article): Promise<void> {
    // Mark as published in DB
    const now = new Date();
    const updated = await storage.updateArticle(article.id, {
        status: "published",
        finished: true,
        publishedAt: article.publishedAt || now,
    } as any);

    if (!updated) {
        log(`Failed to update article ${article.id} to published`, "scheduler");
        return;
    }

    log(`Published article ${article.id}: ${article.title}`, "scheduler");

    // Send webhook notification for published article
    await notifyArticlePublished(article.id, article.title);

    // Move image links over to Airtable record (if present)
    await moveImageLinksToAirtable(updated as unknown as Article);

    // Try Instagram post (best-effort)
    try {
        const result = await postArticleToInstagram(updated as unknown as Article);
        if (result.success) {
            log(`Instagram post succeeded for article ${article.id}`, "scheduler");
        } else {
            log(`Instagram post failed for article ${article.id}: ${result.error}`, "scheduler");
        }
    } catch (e) {
        log(`Instagram post error for article ${article.id}: ${String(e)}`, "scheduler");
    }
}

async function checkAndPublishDueArticles(): Promise<void> {
    if (isRunning) return;
    isRunning = true;
    const startedAt = new Date();
    try {
        // Get drafts and pending articles to minimize scan size
        const drafts = await storage.getArticlesByStatus("draft");
        const pending = await storage.getArticlesByStatus("pending");
        const candidates = [...drafts, ...pending];

        if (candidates.length === 0) return;

        const now = new Date();
        const due = candidates.filter(a => {
            const when = parseScheduledDate(a);
            return when !== null && when <= now;
        });

        if (due.length === 0) return;

        // Process sequentially to avoid rate limits
        for (const article of due) {
            try {
                log(`Auto-publish candidate ${article.id}: ${article.title}`, "scheduler");
                const ensured = await ensureArticleOnAirtable(article);
                await publishArticle(ensured);
            } catch (err) {
                log(`Error auto-publishing article ${article.id}: ${String(err)}`, "scheduler");
            }
        }
    } catch (err) {
        log(`Scheduler error: ${String(err)}`, "scheduler");
    } finally {
        isRunning = false;
        const ms = Date.now() - startedAt.getTime();
        log(`Scheduler cycle completed in ${ms}ms`, "scheduler");
    }
}

export function startPublishScheduler(intervalMs: number = 60000) {
    if (intervalHandle) return; // already started
    log(`Starting publish scheduler (interval ${intervalMs}ms)`, "scheduler");
    // Kick off soon after boot
    setTimeout(() => void checkAndPublishDueArticles(), 5000);
    intervalHandle = setInterval(() => {
        void checkAndPublishDueArticles();
    }, intervalMs);
}

export function stopPublishScheduler() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}


