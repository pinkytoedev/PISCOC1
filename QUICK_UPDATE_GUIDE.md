# Quick Update Guide

**Quick reference for content editors: When will my changes appear on the website?**

---

## 🚀 Instant Updates (< 5 seconds)

### ✅ Published Articles
When you **publish** an article (set status to "published"), it appears on the website almost immediately.

**Steps for instant update:**
1. Create or edit your article in the CMS
2. Change status to **"published"**
3. Click **Save**
4. ⚡ Website updates within seconds

**What gets sent to the website:**
- New published articles
- Changes to already published articles
- Deleted published articles

---

## ⏱️ Delayed Updates (0-60 seconds)

### 📅 Scheduled Articles
Articles scheduled for future publication will automatically publish within 60 seconds of their scheduled time.

**Steps for scheduled publishing:**
1. Create your article in the CMS
2. Set the **"Scheduled"** field to your desired publication date/time
3. Keep status as **"draft"** or **"pending"**
4. Click **Save**
5. ⏱️ Article will auto-publish 0-60 seconds after the scheduled time

**Example:**
- Scheduled for: 2:30 PM
- Will publish: Between 2:30 PM and 2:31 PM
- Website updates: A few seconds after publication

---

## ❌ Changes That Don't Update the Website

### Draft Articles
Changes to **draft** or **pending** articles do NOT appear on the website until published.

**Why?**
The website only shows published content. Draft articles are works-in-progress.

**How to make them visible:**
Change the status to **"published"** and save.

### Team Members, Carousel Quotes, etc.
These changes update in the CMS immediately but may not reflect on the website unless the website is configured to pull this data.

---

## 🎯 Common Scenarios

### Scenario 1: "I want to publish an article right now"
1. Set status to **"published"**
2. Click **Save**
3. ✅ Done! Website updates in seconds

### Scenario 2: "I want to schedule an article for later"
1. Set the **"Scheduled"** field to future date/time
2. Keep status as **"draft"** or **"pending"**
3. Click **Save**
4. ✅ Done! Article will auto-publish at scheduled time

### Scenario 3: "I need to edit a published article"
1. Make your changes
2. Click **Save**
3. ✅ Done! Website updates in seconds

### Scenario 4: "I'm working on a draft and want to save progress"
1. Keep status as **"draft"**
2. Click **Save**
3. ✅ Progress saved in CMS
4. ℹ️ Not visible on website yet (by design)

---

## 🔍 Troubleshooting

### "My published article isn't showing on the website"

**Check 1:** Is the status really "published"?
- Look at the article in the CMS
- Verify the status field shows "published"

**Check 2:** Wait 10 seconds
- Sometimes it takes a few seconds for the website to refresh

**Check 3:** Check with an admin
- There might be a configuration issue with webhooks
- Admins can check server logs for errors

### "My scheduled article didn't publish"

**Check 1:** Is the scheduled date in the past?
- The scheduler only checks for dates that have already passed
- If scheduled for 3:00 PM, it won't publish until 3:00 PM

**Check 2:** Is the status "draft" or "pending"?
- Scheduled publishing only works for draft/pending articles
- If already published, it won't schedule

**Check 3:** Wait up to 60 seconds
- The scheduler checks every minute
- Your article will publish within 60 seconds of the scheduled time

### "I want to unpublish an article"

Change the status back to "draft" and save. The website should remove it from public view.

---

## 📊 Quick Reference Table

| What I Want | What I Do | How Fast |
|-------------|-----------|----------|
| Publish now | Status → "published" → Save | ⚡ < 5 seconds |
| Publish later | Set "Scheduled" → Status "draft" → Save | ⏱️ 0-60s after scheduled time |
| Save draft | Status "draft" → Save | Instant in CMS, not on website |
| Edit published | Make changes → Save | ⚡ < 5 seconds |
| Remove from website | Status → "draft" → Save | ⚡ < 5 seconds |

---

## 💡 Pro Tips

1. **Use draft status while working**
   - Keep articles as "draft" while you're still editing
   - Only publish when ready to go live

2. **Schedule ahead of time**
   - Prepare articles in advance
   - Set scheduled dates for consistent publishing

3. **Preview before publishing**
   - Check your article in the CMS preview
   - Make sure everything looks good
   - Then publish

4. **Publish to multiple platforms at once**
   - When you publish, the article can automatically post to Instagram (if configured)
   - One click, multiple platforms!

---

## 🆘 Need Help?

If something isn't working as expected:

1. **First:** Check this guide again
2. **Second:** Try waiting 60 seconds (for scheduled articles)
3. **Third:** Contact an administrator
   - They can check server logs
   - They can verify webhook configuration
   - They can troubleshoot further

---

## 📱 Mobile/Discord Integration

If you're uploading images or content via Discord or other tools:

1. Upload completes → Notified in Discord
2. Go to CMS → Find your article
3. Review and **publish**
4. ⚡ Website updates instantly

**Remember:** Uploads create draft articles. You still need to publish them!

---

## Summary

**The Golden Rule:** 
> 📌 **Publish your articles to make them visible on the website!**

- ✅ Published articles → Instant website updates
- 📅 Scheduled articles → Auto-publish on schedule
- ⏳ Draft articles → Not on website (working copy only)

That's it! Keep it simple: **Publish to go live, Draft to work on it.**
