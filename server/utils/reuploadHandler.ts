
import { storage } from '../storage';
import { log } from '../vite';
import { convertToAirtableFormat } from '../integrations/airtable';
import type { Article } from '../../shared/schema';

/**
 * Handles the completion logic for article re-uploads.
 * If an article is in re-upload mode, it marks it as published/finished
 * and syncs the status to Airtable.
 */
export async function handleReuploadCompletion(article: Article): Promise<void> {
  if (!article.isReuploading) {
    return;
  }

  log(`Completing re-upload for article ${article.id}: ${article.title}`, "reupload");

  try {
    // 1. Update local state: Published, Finished, isReuploading=false
    const updatedArticle = await storage.updateArticle(article.id, {
      status: "published",
      finished: true,
      isReuploading: false
    } as any);

    if (!updatedArticle) {
      log(`Failed to update article ${article.id} completion state`, "reupload");
      return;
    }

    // 2. Sync to Airtable (Finished = true)
    if (updatedArticle.externalId && updatedArticle.source === 'airtable') {
      const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
      const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
      const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");

      if (apiKeySetting?.value && baseIdSetting?.value && tableNameSetting?.value) {
        // We explicitly want to check "Finished"
        const url = `https://api.airtable.com/v0/${baseIdSetting.value}/${encodeURIComponent(tableNameSetting.value)}/${updatedArticle.externalId}`;

        await fetch(url, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${apiKeySetting.value}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields: { Finished: true } }),
        });

        log(`Synced completion status to Airtable for article ${article.id}`, "reupload");
      }
    }

    // Log activity
    await storage.createActivityLog({
      action: "update",
      resourceType: "article",
      resourceId: article.id.toString(),
      details: {
        action: "complete_reupload",
        status: "published"
      }
    });

  } catch (err) {
    log(`Error completing re-upload for article ${article.id}: ${String(err)}`, "reupload");
  }
}
