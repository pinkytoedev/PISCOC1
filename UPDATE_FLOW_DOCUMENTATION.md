# Update Flow Documentation

## Overview

This document explains why some changes in the PISCOC1 CMS get instantly updated on the website while others don't. Understanding these mechanisms is crucial for managing content effectively.

## Important Context

**PISCOC1 is a Content Management System (CMS)**, not the actual website. The website is a separate system that pulls data from this CMS. Therefore, there are different layers of updates:

1. Updates within the CMS itself (always instant)
2. Updates to external systems (Airtable, Instagram, etc.)
3. Updates to the website (triggered by webhooks for published articles)

---

## Update Mechanisms

### 1. Local CMS Updates (INSTANT) ⚡

**What:** Changes to the CMS database and UI  
**Speed:** Immediate (milliseconds)  
**Applies to:** All changes (articles, team members, carousel quotes, etc.)

**How it works:**
- When you create/edit/delete any content in the CMS, it immediately updates the PostgreSQL database
- React Query automatically invalidates the cache and refetches data
- The CMS UI updates instantly to reflect changes

**Code locations:**
- Database operations: `server/storage.ts`
- Cache invalidation: Throughout `client/src/` components using `queryClient.invalidateQueries()`
- React Query config: `client/src/lib/queryClient.ts`

**Example flow:**
```
User clicks "Save Article"
  → API request to server
  → Database updated
  → Response sent back
  → React Query invalidates cache
  → UI refetches data
  → UI updates (< 1 second total)
```

---

### 2. Webhook Notifications to Website (INSTANT for Published Articles) ⚡

**What:** Notifications sent to the website when published articles change  
**Speed:** Immediate (within seconds)  
**Applies to:** ONLY published articles (not drafts or pending)

**How it works:**
- When a published article is created, edited, or deleted, the CMS sends a webhook notification
- The webhook URL is configured via the `ARTICLE_WEBHOOK_URL` environment variable
- The website receives the notification and can immediately refresh its cache/data

**Code location:** `server/utils/webhookNotifier.ts`

**Triggered by:**
- ✅ Publishing an article (status changes to "published")
- ✅ Editing an already published article
- ✅ Deleting a published article
- ❌ NOT triggered for draft articles
- ❌ NOT triggered for pending articles
- ❌ NOT triggered for unpublished changes

**Configuration:**
```bash
# Environment variable - example value shown
ARTICLE_WEBHOOK_URL=https://www.pinkytoepaper.com/api/webhooks/article-published
```
> Replace with your actual website webhook URL

**Webhook payload:**
```json
{
  "action": "published" | "edited" | "deleted",
  "articleId": 123,
  "timestamp": "2025-11-23T21:00:00.000Z"
}
```

**Example flow for publishing an article:**
```
User changes article status to "published"
  → Article updated in database
  → Webhook notification sent to website
  → Website receives notification
  → Website refreshes its cache/data
  → Website shows updated content (< 5 seconds total)
```

**Timeout and error handling:**
- 10-second timeout for webhook requests
- Errors are logged but don't block the article update
- Check server logs for webhook delivery issues

---

### 3. Airtable Synchronization (DELAYED - every 60 seconds) ⏱️

**What:** Periodic sync of articles with Airtable  
**Speed:** Delayed (runs every 60 seconds)  
**Applies to:** Articles scheduled for publication

**How it works:**
- A scheduler runs every 60 seconds checking for articles ready to publish
- It syncs article data to Airtable (if configured)
- Then marks the article as published and triggers webhooks

**Code location:** `server/scheduler.ts`

**Triggered for:**
- Articles in "draft" or "pending" status with a scheduled publication date that has passed
- Scheduled publication dates are checked every minute

**Configuration:**
Airtable settings must be configured in the CMS:
- API Key
- Base ID
- Articles Table Name

**Scheduler initialization:**
The scheduler is automatically started when the server boots with a 60-second interval:
```javascript
// In server/scheduler.ts
// This is how the scheduler is initialized in the codebase
// The interval is hardcoded but can be changed programmatically in the code
startPublishScheduler(60000); // 60000ms = 60 seconds
```

**Example flow for scheduled article:**
```
User sets article to publish at 2:30 PM
  → Article saved with Scheduled date
  → Scheduler checks every minute
  → At 2:31 PM, scheduler finds the article
  → Article synced to Airtable
  → Article marked as published
  → Webhook sent to website
  → Website updates (60-120 seconds after scheduled time)
```

---

### 4. Manual Airtable Sync (ON DEMAND) 🔄

**What:** Manual synchronization with Airtable  
**Speed:** Immediate when triggered  
**Applies to:** Articles, team members, and carousel quotes

**How it works:**
- Admin users can manually trigger sync from the Airtable integration page
- Syncs all data or specific items to Airtable
- Does not affect the website directly (website pulls from CMS, not Airtable)

**Code location:** `server/integrations/airtable.ts`

**Available sync operations:**
- Sync all articles from Airtable to CMS
- Sync all team members from Airtable to CMS
- Sync carousel quotes
- Push individual article to Airtable
- Upload images to Airtable

---

### 5. Instagram Posting (ON PUBLISH) 📱

**What:** Automatic Instagram post when article is published  
**Speed:** Immediate (when article status changes to published)  
**Applies to:** Articles with Instagram images

**How it works:**
- When an article status changes to "published", the system attempts to post to Instagram
- Uses the `instagramImageUrl` field for the post image
- Uses article title and hashtags for the caption

**Code locations:**
- Trigger: `server/routes.ts` (article PUT endpoint)
- Implementation: `server/integrations/instagram.ts`

**Requirements:**
- Instagram must be configured (access token, user ID)
- Article must have an `instagramImageUrl`
- Article must have a title (used as caption)

---

## Summary Table

| Update Type | Speed | Triggers | Affects Website |
|-------------|-------|----------|-----------------|
| CMS UI Updates | ⚡ Instant (< 1 second) | All changes | No (CMS only) |
| Webhook to Website | ⚡ Instant (< 5 seconds) | Published articles only | ✅ Yes |
| Airtable Sync (Scheduled) | ⏱️ Delayed (60 seconds) | Scheduled articles | No (unless website uses Airtable) |
| Manual Airtable Sync | 🔄 On demand | Admin trigger | No (unless website uses Airtable) |
| Instagram Post | ⚡ Instant | Article published | No (separate platform) |

---

## Why Some Changes Don't Update the Website Instantly

### Draft/Pending Articles
**Problem:** Changes to draft or pending articles don't appear on the website  
**Reason:** Webhooks are only sent for published articles  
**Solution:** Publish the article to trigger the webhook

### Scheduled Articles
**Problem:** Articles don't publish exactly at the scheduled time  
**Reason:** Scheduler only checks every 60 seconds  
**Solution:** Expect 0-60 second delay after scheduled time

### Airtable-Only Changes
**Problem:** Changes in Airtable don't immediately appear on the website  
**Reason:** The website pulls from the CMS database, not directly from Airtable  
**Solution:** 
1. Sync from Airtable to CMS (manual sync in CMS)
2. Publish the article in CMS to trigger webhook

### Webhook Configuration Issues
**Problem:** Published article changes don't appear on website  
**Reason:** Webhook may not be configured or delivering successfully  
**Solution:**
1. Verify `ARTICLE_WEBHOOK_URL` environment variable is set
2. Check server logs for webhook delivery attempts
3. Verify the webhook endpoint URL is correct and accessible
4. Test webhook manually by publishing an article and checking logs

---

## Troubleshooting

### Webhook Not Working

1. **Check environment variable:**
   ```bash
   echo $ARTICLE_WEBHOOK_URL
   ```

2. **Check server logs:**
   - Look for "Webhook notification sent" messages
   - Look for webhook errors with 🚨 emoji

3. **Test manually:**
   - Publish an article
   - Check server logs for webhook attempt
   - Verify website received the notification

### Scheduled Articles Not Publishing

1. **Verify scheduler is running:**
   - Check server logs for "Starting publish scheduler" message
   - Check for "Scheduler cycle completed" messages every minute

2. **Check article scheduled date:**
   - Ensure the `Scheduled` field is set
   - Ensure the date/time is in the past
   - Check article status is "draft" or "pending"

3. **Verify Airtable configuration:**
   - API Key must be set
   - Base ID must be set
   - Articles Table Name must be set

### Airtable Sync Issues

1. **Check Airtable credentials:**
   - Go to `/integrations/airtable` in CMS
   - Test connection

2. **Check for API errors:**
   - Look in server logs for "Airtable API error" messages

3. **Verify field mappings:**
   - Ensure Airtable table has all required fields
   - Check field names match expected values

---

## Best Practices

### For Instant Website Updates
1. Always publish articles (don't leave in draft)
2. Ensure `ARTICLE_WEBHOOK_URL` is configured correctly
3. Monitor webhook logs for delivery issues

### For Scheduled Publishing
1. Set the `Scheduled` field with future date/time
2. Keep article in "draft" or "pending" status
3. Expect up to 60-second delay after scheduled time

### For Airtable Integration
1. Sync from Airtable to CMS regularly
2. Publish articles in CMS to trigger website updates
3. Don't rely on Airtable as the direct website data source

---

## Configuration Checklist

- [ ] `DATABASE_URL` - PostgreSQL connection (required)
- [ ] `SESSION_SECRET` - Session encryption (required)
- [ ] `ARTICLE_WEBHOOK_URL` - Website webhook endpoint (recommended for instant updates)
- [ ] `AIRTABLE_API_KEY` - Airtable integration (optional)
- [ ] `AIRTABLE_BASE_ID` - Airtable base (optional)
- [ ] `FACEBOOK_APP_ID` - Instagram integration (optional)
- [ ] `FACEBOOK_APP_SECRET` - Instagram integration (optional)

> **Note:** For security best practices including strong secrets and production configuration, see the main README.md and deployment documentation.

---

## Related Files

### Server-side
- `server/routes.ts` - API endpoints and webhook triggers
- `server/scheduler.ts` - Scheduled article publication
- `server/utils/webhookNotifier.ts` - Webhook notification system
- `server/integrations/airtable.ts` - Airtable sync
- `server/integrations/instagram.ts` - Instagram posting
- `server/storage.ts` - Database operations

### Client-side
- `client/src/lib/queryClient.ts` - React Query configuration
- `client/src/pages/articles-page.tsx` - Article management UI
- `client/src/components/dashboard/article-table.tsx` - Article table with mutations

---

## Questions?

If you have questions about the update flow or need help troubleshooting, check the server logs or contact the development team.
