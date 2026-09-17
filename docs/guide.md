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
credentials, see the API Keys page, and flip the two public-upload switches
(the team-profile link and the public article upload link). The difference is
about *configuration and accounts*, not about content.

A wrinkle worth knowing: both public-upload switches are *rendered* on pages
every signed-in user can reach — the article one on Articles, the team one on
Team Members — but the endpoints behind them require admin. If you are not an
admin the switch is visible and flipping it simply fails.

Two rules protect you from locking everyone out: you cannot remove your own admin
flag, and you cannot delete your own account. Both are enforced by the server;
the admin switch on your own row in the Users screen is not disabled, so it
looks available and is refused on save.

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
| **Documentation** (`/docs`) | anyone | This guide and the API reference, rendered in the app. No sign-in required. |
| **Sign in** (`/auth`) | anyone | Login. There is no self-registration; an admin creates your account. |
| **Public article upload** (`/public-upload`) | anyone with the link | The token-free submission page, when its switch is on. See below. |
| **Public team profiles** (`/team-upload`) | anyone with the link | The token-free profile page, when its switch is on. See below. |
| **Contributor upload** (`/upload/:token`) | anyone with the link | A per-article submission page; the token in the URL is the credential. |

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
| **Publication date** (`Scheduled`) | When you want it to go live. This is the only *date* the auto-publisher reads; it checks the flags below too. |
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
job on the server checks every minute and publishes anything that has come due.

It will publish an article when **all** of these hold:

- it is a draft;
- *Republished* is not set;
- it has never been published before (*Published at* is empty);
- it is not in a re-upload session;
- its publication date is in the past **and no more than 24 hours ago**.

That last condition is the one that surprises people. A draft whose date slipped
by more than a day is **not** picked up — it is treated as forgotten rather than
overdue, so an old draft cannot be dragged onto the site by accident. Publish it
by hand, or give it a new date.

> **There is a second publisher, and it does not follow the same rules.** The
> dashboard runs its own catch-up loop in the browser while a tab is open. Its
> window is **2 hours**, not 24, and it does not check *Published at* — so an
> article the server would deliberately leave alone can be published by
> whichever dashboard happens to be open. If scheduling behaves in a way this
> section does not explain, that is the likely cause.

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

Most images you upload — from the dashboard, from a contributor link, or inside
a ZIP — take the same path. The file is checked to be genuinely an image by
reading its leading bytes rather than trusting its name, converted to JPEG if it
is HEIC or AVIF, uploaded to ImgBB for hosting, recorded against the article,
and finally written into the matching Airtable link column.

Two exceptions to "the same path":

- **ImgBB is optional, and without it the routes disagree.** With
  `IMGBB_API_KEY` unset the article screens show an "ImgBB Integration
  Disabled" notice. The Airtable image routes then write a real Airtable
  attachment instead of a hosted link — but the contributor links, the
  token-free public pages and the dashboard's own direct uploads simply fail
  with "Image hosting is unavailable". In practice, uploads need ImgBB.
- **Images inside a ZIP are checked less strictly.** Their type is taken from
  the file extension rather than their leading bytes, and SVG is accepted there
  even though every other route refuses it.

Accepted: JPEG, PNG, GIF, WebP, HEIC, HEIF, AVIF, up to 10 MB. (Two of the
upload pages list a shorter set than this; the server's list is the one above.)
**SVG is refused** on every direct upload — it can carry scripts, and these
images are served back to readers — but see the ZIP caveat.

ZIP archives may contain the article's HTML plus its images: up to 50 MB
compressed, 500 files, and 60 images. The HTML is sanitized before it is stored —
scripts, iframes and event handlers are stripped — and the page tells you when
something was removed. Bundled images are re-hosted and the HTML is rewritten to
point at the new URLs.

## The two token-free public links

These are separate from the per-article contributor links above. Both take **no
credential at all** — anyone with the URL can use them while the switch is on —
so open them for a submission window and close them again.

**Team profiles, at `/team-upload`.** Team members correct their own name, role,
bio and photo without an account. One link for everybody: while it is on, anyone
holding it can edit **any** member's profile. The switch, the link and a copy
button are on the Team Members page.

**Article submissions, at `/public-upload`.** Anyone with the link picks an
article from a list and replaces its main image, its Instagram image or its HTML
content. The list offers every article that is not published, plus any article
currently in a re-upload session; published articles are never listed and are
refused if named directly. The switch is on the Articles page.

Both switches are admin-only on the server, though they are shown to every
signed-in user.

## Things that catch people out

- **"Republished" means held back**, not re-published. It is the flag that keeps
  an unpublished article down.
- **A draft's publication date is cleared when you save it.** That is on
  purpose — but only on the main article form. Editing from the Article Planner
  calendar uses a different modal that skips that rule, so the same edit can
  behave differently depending on where you started it.
- **Scheduling more than 24 hours late does nothing** on the server. The
  catch-up window is deliberate; publish by hand instead. The dashboard's own
  in-browser publisher uses a 2-hour window and slightly different rules, so
  the two do not always agree.
- **A pull from Airtable overwrites local edits.** Push first, or lose them.
- **Editing a draft never reaches Airtable.** Only publishing does.
- **The API Keys page shows Session Secret as configured no matter what.** It is
  a static checklist entry, not a live probe. `GET /api/health` is the honest
  check.
- **Cancelling a re-upload does not restore the old content**, only the old
  status.
