# Using PISCOC

PISCOC is the content management system behind Pinkytoe. It holds the articles,
the team roster and the carousel quotes, keeps all three in step with Airtable,
and publishes articles on a schedule.

This guide is for the people who use it. If you are setting the project up, read
the [README](https://github.com/pinkytoedev/PISCOC1#readme) instead; if you are
calling it from code, see the **API reference** tab.

## Accounts and roles

There is no sign-up. An admin creates your account for you, and there are only
two kinds of account.

**Everyone signed in** can write, publish, schedule and delete articles, manage
the team roster and carousel quotes, run an Airtable sync in either direction,
and issue contributor upload links.

**Admins** can additionally create and edit user accounts, enter the Airtable
credentials, and switch the public team-profile link on and off. Those are
the only extra powers — the difference is about *configuration and accounts*, not
about content.

Two rules protect you from locking everyone out: you cannot remove your own admin
flag, and you cannot delete your own account.

## The screens

| Screen | Who | What it is for |
|---|---|---|
| **Dashboard** (`/`) | everyone | Counts of total, draft and published-today articles, plus your most recent publications and drafts. |
| **Articles** (`/articles`) | everyone | The main working surface. Every article, with search, sort, status filter and all the per-row actions. |
| **Article Planner** (`/articles/planner`) | everyone | The same articles on a calendar, coloured by status. Click any entry to edit it. |
| **Team Members** (`/team-members`) | everyone | The roster, with photo upload, Airtable pull/push, and the public profile link. |
| **Carousel Quotes** (`/carousel-quotes`) | everyone | Quotes grouped by carousel, with Airtable pull/push. |
| **Users & Permissions** (`/users`) | admin | Create accounts, reset passwords, grant or remove admin. |
| **API Keys** (`/keys`) | admin | A read-only checklist of which credentials are configured, and how to obtain each one. It does not edit anything. |
| **Airtable** (`/integrations/airtable`) | admin | Credentials, table names, connection test, and the three sync buttons. |

There is no ImgBB screen. Its API key is the `IMGBB_API_KEY` environment
variable on the server and cannot be set from in here; the **API Keys** page
shows whether it is present.

## The article lifecycle

This is the part worth reading properly. Most confusion with PISCOC comes from
these five fields.

### The fields that decide what is live

| Field | What it actually means |
|---|---|
| **Status** | `draft` or `published`. The local source of truth for whether an article is live. |
| **Publication date** (`Scheduled`) | When you want it to go live. This is the **only** field the auto-publisher reads. |
| **Finished** | Airtable's copy of Status. Pushing sets it from Status; pulling sets Status from it. Think of it as the same switch seen from the other side. |
| **Published at** | "This has been live at some point." It is kept even after you unpublish, which is how the system knows not to quietly publish it again. |
| **Republished** | Reads backwards, so read it twice: it means **deliberately held back as a draft**. It is set for you when you unpublish something that had been live, and while it is set the article will never auto-publish. |

### Writing and publishing

Create an article with **New Article** on the Articles page. A new article is
saved locally only — it does **not** appear in Airtable until you publish it or
press *Push to Airtable*.

When you save:

- Set **Status: Published** with a publication date in the past, and it goes
  live immediately.
- Set **Status: Published** with no date, and the date is set to now for you.
- Set **Status: Draft**, and the publication date is deliberately cleared —
  otherwise a past date would make the auto-publisher push it straight back out.
- Unpublish something that was live and it becomes a draft with *Republished*
  set, so it stays down until you say otherwise.

A **Republish** button appears when you are editing a draft that was previously
live. It restores the article with its original publication date rather than
today's.

> **Editing a draft does not touch Airtable or the live site.** Only publishing,
> unpublishing, or an explicit push does. That is deliberate — it keeps
> work-in-progress out of the base — but it does mean a draft you have been
> editing for a week exists only in PISCOC until you publish it.

### Scheduling

Give an article a future publication date and leave it as a draft. A background
job checks every minute and publishes anything that has come due.

It will publish an article when **all** of these hold:

- it is a draft;
- *Republished* is not set;
- it has never been published before;
- it is not in a re-upload session;
- its publication date is in the past **and no more than 24 hours ago**.

That last condition is the one that surprises people. A draft whose date slipped
by more than a day is **not** picked up — it is treated as forgotten rather than
overdue, so an old draft cannot be dragged onto the site by accident. Publish it
by hand, or give it a new date.

Publishing — by hand or on schedule — writes the article to Airtable and then
tells the live site to drop its cached copy.

## Airtable

Airtable is the shared source of record. Syncing is not continuous, and the two
directions behave very differently.

**Pulling** (the *Sync* buttons, or the publish webhook) is a **full overwrite**.
Every field Airtable maps wins, unconditionally. If you edited an article's title
in PISCOC and did not push it, the next pull discards that edit. There are only
three exceptions: a *Republished* tick beats *Finished*; an article the scheduler
published in the last five minutes is not dragged back to draft by a snapshot
that predates it; and team-member photos are never overwritten.

**Pushing** happens automatically whenever you publish or unpublish, and can be
triggered by hand from the article row or the section buttons.

The columns line up like this:

| Airtable | PISCOC |
|---|---|
| `Name` | Title |
| `Body` | Content |
| `Description` | Description |
| `MainImageLink`, else `MainImage` | Cover image |
| `InstaPhotoLink`, else `instaPhoto` | Instagram image |
| `Finished` | Status / Finished |
| `Scheduled` | Publication date |
| `Date` | Created date |
| `Featured` | Featured |
| `Hashtags` | Hashtags |
| `Name (from Author)` | Author |
| `Name (from Photo)` | Photographer |

Images are always written into the **link** columns, never the attachment
columns. Airtable rewrites attachment URLs to expiring ones, so a link field is
the only thing that stays valid.

Missing values get sensible fallbacks rather than failing a sync — an untitled
record becomes *Untitled Article (ID: rec…)*, a missing author becomes *Unknown
Author*, a missing image becomes a placeholder.

## Contributor upload links

A contributor upload link lets someone outside PISCOC submit an article's
content without an account. The link **is** the credential: anyone holding it can
upload to that one article, and nothing else.

Each link is tied to a single article, accepts only the file types it was created
for, and expires after 14 days by default. It stops working when the re-upload
session it belongs to is finished or cancelled.

A contributor opens the link, sees the article title and which slots are already
filled, and drags files in. A `.zip` is treated as the article body; images fill
the cover and Instagram slots. They press Upload, and each file reports its own
result.

Uploading never publishes anything.

## Re-upload sessions

Use this when an article is **already live** and its content needs replacing.

Editing a live article in place would show readers a half-updated version.
A re-upload session takes it down, holds it down while any number of files are
replaced in any order, and puts it back only when you say so.

1. **Start** — from the article row. The article drops to draft, comes off the
   live site, and you get an upload link copied to your clipboard. Send it on.
2. **Replace** — the contributor (or you) uploads as many assets as needed. The
   auto-publisher leaves the article alone throughout.
3. **Finish** — either of you presses finish. The article republishes, keeping
   its **original** publication date, and the link stops working.

You can **cancel** instead, which restores the previous status. Note that cancel
does not undo uploads that already happened — it restores the article's status,
not its content.

An article must be published or finished to start a session; drafts are edited
directly.

## Images

Any image you upload — from the dashboard, from a contributor link, or inside a
ZIP — takes the same path. It is checked to be genuinely an image by reading its
leading bytes rather than trusting its name, converted to JPEG if it is HEIC or
AVIF, uploaded to ImgBB for hosting, recorded against the article, and finally
written into the matching Airtable link column.

Accepted: JPEG, PNG, GIF, WebP, HEIC, HEIF, AVIF, up to 10 MB.
**SVG is refused** — it can carry scripts, and these images are served back to
readers.

ZIP archives may contain the article's HTML plus its images: up to 50 MB
compressed, 500 files, and 60 images. The HTML is sanitized before it is stored —
scripts, iframes and event handlers are stripped — and the page tells you when
something was removed. Bundled images are re-hosted and the HTML is rewritten to
point at the new URLs.

## The public team-profile link

An admin can switch on a shared page at `/team-upload` where team members correct
their own name, role, bio and photo without an account.

It is one link for everybody, and while it is on, anyone holding it can edit
**any** member's profile. Switch it off when you are not actively collecting
updates. The switch, the link and a copy button are on the Team Members page.

## Things that catch people out

- **"Republished" means held back**, not re-published. It is the flag that keeps
  an unpublished article down.
- **A draft's publication date is cleared when you save it.** That is on purpose.
- **Scheduling more than 24 hours late does nothing.** The catch-up window is
  deliberate; publish by hand instead.
- **A pull from Airtable overwrites local edits.** Push first, or lose them.
- **Editing a draft never reaches Airtable.** Only publishing does.
- **The API Keys page shows Session Secret as configured no matter what.** It is
  a static checklist entry, not a live probe. `GET /api/health` is the honest
  check.
- **Cancelling a re-upload does not restore the old content**, only the old
  status.
