import { storage } from "./storage";
import { log } from "./vite";
import { postArticleToInstagram } from "./integrations/instagram";
import type { Article } from "@shared/schema";

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

function parseScheduledDate(article: Article): Date | null {
    try {
        if (article.Scheduled) {
            const d = new Date(article.Scheduled as unknown as string);
            if (!isNaN(d.getTime())) return d;
        }
    } catch { }
    // Removed fallback to publishedAt to prevent auto-publishing of drafts that were previously published
    return null;
}

async function ensureArticleOnAirtable(article: Article): Promise<Article> {
    try {
        // Check Airtable settings
        const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
        const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
        const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");

        if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
            log("Airtable not configured; skipping push for article " + article.id, "scheduler");
            return article;
        }

        const fields: any = {
            Name: article.title,
            Description: article.description || "",
            Body: article.content || "",
            Featured: article.featured === "yes",
            Finished: article.status === "published" || article.finished === true,
            Hashtags: article.hashtags || "",
        };

        // Include image link URL fields if available so the Airtable draft has them immediately
        if (article.imageUrl) {
            (fields as any).MainImageLink = article.imageUrl;
        }
        if (article.instagramImageUrl) {
            (fields as any).InstaPhotoLink = article.instagramImageUrl;
        }

        // Dates
        const scheduledDate = parseScheduledDate(article) || new Date();
        fields.Scheduled = scheduledDate.toISOString();
        fields.Date = article.date || new Date().toISOString();

        let res: Response;
        let airtableId = article.externalId;

        if (article.externalId) {
            // Update existing record
            const url = `https://api.airtable.com/v0/${baseIdSetting.value}/${encodeURIComponent(tableNameSetting.value)}/${article.externalId}`;
            const body = JSON.stringify({ fields });

            res = await fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${apiKeySetting.value}`,
                    "Content-Type": "application/json",
                },
                body,
            });
        } else {
            // Create new record
            const url = `https://api.airtable.com/v0/${baseIdSetting.value}/${encodeURIComponent(tableNameSetting.value)}`;
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

        if (!article.externalId) {
            const data = JSON.parse(text) as { records?: Array<{ id: string }> };
            airtableId = data.records && data.records[0]?.id || null;
            if (!airtableId) {
                log("Airtable push returned no record id", "scheduler");
                return article;
            }

            const updated = await storage.updateArticle(article.id, {
                externalId: airtableId,
                source: "airtable",
            } as any);

            if (updated) {
                log(`Article ${article.id} pushed to Airtable with id ${airtableId}`, "scheduler");
                return updated as Article;
            }
        } else {
            log(`Article ${article.id} updated in Airtable with id ${article.externalId}`, "scheduler");
            return article;
        }
    } catch (err) {
        log(`Error ensuring Airtable push for article ${article.id}: ${String(err)}`, "scheduler");
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
        // Get drafts to minimize scan size
        const drafts = await storage.getArticlesByStatus("draft");
        const candidates = [...drafts];

        if (candidates.length === 0) return;

        const now = new Date();
        // Limit auto-publish to articles scheduled within the last 2 hours
        // This prevents old drafts from being accidentally republished
        // while allowing for a small window of system delay catch-up.
        const cutoffTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        const due = candidates.filter(a => {
        // Skip if the Republished flag is set; these are explicitly held as drafts
        if (a.republished) return false;

            const when = parseScheduledDate(a);
            // Rule 1: Scheduled time must be in the past (<= now)
            // Rule 2: Scheduled time must be recent (>= cutoffTime)
            return when !== null && when <= now && when >= cutoffTime;
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


