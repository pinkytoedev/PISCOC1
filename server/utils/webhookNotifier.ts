import { log } from "../vite";

/**
 * Webhook URL for notifying the website of article updates
 */
const ARTICLE_WEBHOOK_URL = "https://www.pinkytoepaper.com/api/webhooks/article-published";

/**
 * Sends a webhook notification to refresh website content
 * @param action - The action that triggered the webhook (published, edited, deleted)
 * @param articleId - The ID of the article that was affected
 * @param articleTitle - The title of the article (optional, for logging)
 */
export async function notifyArticleWebhook(
    action: "published" | "edited" | "deleted",
    articleId: number,
    articleTitle?: string
): Promise<void> {
    const payload = {
        action,
        articleId,
        timestamp: new Date().toISOString(),
    };

    log(
        `🔔 Attempting to send webhook notification for article ${articleId} (${action})${articleTitle ? `: ${articleTitle}` : ""}`,
        "webhook"
    );
    log(`📤 Webhook URL: ${ARTICLE_WEBHOOK_URL}`, "webhook");
    log(`📦 Webhook payload: ${JSON.stringify(payload, null, 2)}`, "webhook");

    try {
        const startTime = Date.now();

        const response = await fetch(ARTICLE_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "PISCOC1-Webhook/1.0",
            },
            body: JSON.stringify(payload),
        });

        const duration = Date.now() - startTime;
        const responseText = await response.text();

        log(
            `📡 Webhook response received in ${duration}ms - Status: ${response.status} ${response.statusText}`,
            "webhook"
        );
        log(`📄 Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`, "webhook");
        log(`📝 Response body: ${responseText || '(empty)'}`, "webhook");

        if (response.ok) {
            log(
                `✅ Webhook notification sent successfully for article ${articleId} (${action})${articleTitle ? `: ${articleTitle}` : ""}`,
                "webhook"
            );
        } else {
            log(
                `❌ Webhook notification failed for article ${articleId} (${action}): ${response.status} ${response.statusText}`,
                "webhook"
            );
            log(`💡 This may indicate an issue with the webhook endpoint or network connectivity`, "webhook");
        }
    } catch (error) {
        log(
            `🚨 Error sending webhook notification for article ${articleId} (${action}): ${String(error)}`,
            "webhook"
        );

        // Log more detailed error information
        if (error instanceof Error) {
            log(`🔍 Error name: ${error.name}`, "webhook");
            log(`🔍 Error message: ${error.message}`, "webhook");
            if (error.stack) {
                log(`🔍 Error stack: ${error.stack}`, "webhook");
            }
        }

        // Check for common network issues
        if (String(error).includes('ENOTFOUND')) {
            log(`🌐 DNS resolution failed - check if ${ARTICLE_WEBHOOK_URL} is accessible`, "webhook");
        } else if (String(error).includes('ECONNREFUSED')) {
            log(`🔌 Connection refused - the webhook endpoint may be down`, "webhook");
        } else if (String(error).includes('timeout')) {
            log(`⏱️ Request timed out - the webhook endpoint may be slow to respond`, "webhook");
        }
    }
}

/**
 * Convenience function for when an article is published
 */
export async function notifyArticlePublished(articleId: number, articleTitle?: string): Promise<void> {
    return notifyArticleWebhook("published", articleId, articleTitle);
}

/**
 * Convenience function for when a published article is edited
 */
export async function notifyArticleEdited(articleId: number, articleTitle?: string): Promise<void> {
    return notifyArticleWebhook("edited", articleId, articleTitle);
}

/**
 * Convenience function for when a published article is deleted
 */
export async function notifyArticleDeleted(articleId: number, articleTitle?: string): Promise<void> {
    return notifyArticleWebhook("deleted", articleId, articleTitle);
}
