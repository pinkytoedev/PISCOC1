# API Documentation

This document lists all available API endpoints implemented by the server.

## Table of Contents

- [Health & Config](#health--config)
- [Authentication & Users](#authentication--users)
- [Team Members](#team-members)
- [Articles](#articles)
- [Carousel Quotes](#carousel-quotes)
- [Admin Requests](#admin-requests)
- [Image Assets](#image-assets)
- [Uploads](#uploads)
  - [Direct Upload (authenticated)](#direct-upload-authenticated)
  - [Public Upload (token-based)](#public-upload-token-based)
- [Airtable Integration](#airtable-integration)
- [ImgBB Integration](#imgbb-integration)
- [Discord Integration](#discord-integration)
- [Discord Bot](#discord-bot)
- [Instagram Integration](#instagram-integration)
- [GitHub Integration](#github-integration)
- [Integration Settings (generic)](#integration-settings-generic)
- [Activity Logs](#activity-logs)
- [Metrics](#metrics)
- [Migration Progress](#migration-progress)
- [API Status](#api-status)

## Health & Config

- GET `/api/health`
  - Returns server health info and environment flags
- GET `/api/config/facebook`
  - Returns Facebook configuration status or 503 if not configured

## Authentication & Users

- POST `/api/login`
  - Body:
    ```json
    {
      "username": "string",
      "password": "string"
    }
    ```
  - Creates a session (cookie-based)
- POST `/api/logout`
  - Ends current session
- GET `/api/user`
  - Auth required: Yes
  - Returns the authenticated user
- POST `/api/register`
  - Auth required: Yes (admin only)
  - Body:
    ```json
    {
      "username": "string",
      "password": "string",
      "isAdmin": false
    }
    ```
- GET `/api/users`
  - Auth required: Yes (admin only)
- PUT `/api/users/:id`
  - Auth required: Yes (admin only)
- DELETE `/api/users/:id`
  - Auth required: Yes (admin only)

## Team Members

- GET `/api/team-members`
- GET `/api/team-members/:id`
- POST `/api/team-members`
  - Auth required: Yes
- PUT `/api/team-members/:id`
  - Auth required: Yes
- DELETE `/api/team-members/:id`
  - Auth required: Yes

## Articles

- GET `/api/articles`
- GET `/api/articles/:id`
- POST `/api/articles`
  - Auth required: Yes
  - Body: `InsertArticle` shape (see `shared/schema.ts`); `publishedAt` can be ISO string or Date
- PUT `/api/articles/:id`
  - Auth required: Yes
  - Special behavior: when status changes to `published`, server may attempt an Instagram post
- DELETE `/api/articles/:id`
  - Auth required: Yes
  - If article has Airtable `externalId`, it is deleted there first when configured
- GET `/api/articles/status/:status`
- GET `/api/articles/featured`

## Carousel Quotes

- GET `/api/carousel-quotes`
- GET `/api/carousel-quotes/:id`
- POST `/api/carousel-quotes`
  - Auth required: Yes
- PUT `/api/carousel-quotes/:id`
  - Auth required: Yes
- DELETE `/api/carousel-quotes/:id`
  - Auth required: Yes
- GET `/api/carousel-quotes/by-carousel/:carousel`

## Admin Requests

- GET `/api/admin-requests`
  - Optional query params: `status`, `category`, `urgency`
- GET `/api/admin-requests/:id`
- POST `/api/admin-requests`
  - Auth required: Yes
  - Body:
    ```json
    {
      "title": "string",
      "description": "string",
      "category": "Pinkytoe|PISCOC|Misc",
      "urgency": "low|medium|high|critical"
    }
    ```
- PATCH `/api/admin-requests/:id`
  - Auth required: Yes
  - Body: any subset of the above plus `status`
- DELETE `/api/admin-requests/:id`
  - Auth required: Yes

## Image Assets

- GET `/api/image-assets`
- GET `/api/image-assets/:id`
- POST `/api/image-assets`
  - Auth required: Yes
- DELETE `/api/image-assets/:id`
  - Auth required: Yes

## Uploads

### Direct Upload (authenticated)

All endpoints require an authenticated session. Use `multipart/form-data` body.

- POST `/api/direct-upload/image`
  - Form fields:
    - `file`: image file (<= 10MB)
    - `articleId`: number
  - Stores image via ImgBB and updates article `imageUrl`
- POST `/api/direct-upload/instagram-image`
  - Form fields:
    - `file`: image file (<= 10MB)
    - `articleId`: number
  - Updates article `instagramImageUrl`
- POST `/api/direct-upload/html-zip`
  - Form fields:
    - `file`: zip file (<= 50MB)
    - `articleId`: number
  - Processes HTML ZIP content for the article

### Public Upload (token-based)

Management (auth required):
- POST `/api/public-upload/generate-token`
  - Body:
    ```json
    {
      "articleId": 123,
      "uploadType": "image|instagram-image|html-zip",
      "expirationDays": 7,
      "maxUses": 1,
      "name": "optional",
      "notes": "optional"
    }
    ```
- GET `/api/public-upload/tokens/:articleId`
- DELETE `/api/public-upload/tokens/:id`

Public endpoints (no auth; require valid token):
- POST `/api/public-upload/image/:token` (form-data: `file`)
- POST `/api/public-upload/instagram-image/:token` (form-data: `file`)
- POST `/api/public-upload/html-zip/:token` (form-data: `file`)
- GET `/api/public-upload/info/:token`

## Airtable Integration

- GET `/api/airtable/test-connection` (auth)
- GET `/api/airtable/settings` (auth)
- POST `/api/airtable/settings` (auth)
- POST `/api/airtable/update-api-key` (auth)
- POST `/api/airtable/sync/articles` (auth)
- POST `/api/airtable/sync/team-members` (auth)
- POST `/api/airtable/update/article/:id` (auth)
- POST `/api/airtable/update-quote/:id` (auth)
- POST `/api/airtable/sync/carousel-quotes` (auth)
- POST `/api/airtable/push/carousel-quotes` (auth)
- POST `/api/airtable/push/article/:id` (auth)
- POST `/api/airtable/upload-image/:articleId/:fieldName` (auth)
  - Form-data: `image` file; `fieldName` one of `MainImage|instaPhoto|MainImageLink|InstaPhotoLink`
- POST `/api/airtable/upload-image-url/:articleId/:fieldName` (auth)
  - Body:
    ```json
    {
      "imageUrl": "https://...",
      "filename": "name.ext"
    }
    ```

Dev/test utilities (intended for development):
- GET `/api/airtable/direct-test`
- POST `/api/airtable/test-link/:articleId` (auth)
- POST `/api/airtable/test-migration/:articleId` (auth)
- POST `/api/airtable/migrate-to-link-fields/:articleId` (auth)
- POST `/api/airtable/test-batch-migration` (auth)

## ImgBB Integration

- GET `/api/imgbb/settings` (auth)
- POST `/api/imgbb/settings/:key` (auth)
- POST `/api/imgbb/upload-to-airtable/:articleId/:fieldName` (auth)
  - Form-data: `image` file
- POST `/api/imgbb/upload-url-to-airtable/:articleId/:fieldName` (auth)
  - Body: `{ "imageUrl": "https://..." }`

## Discord Integration

- GET `/api/discord/settings` (auth)
- POST `/api/discord/settings` (auth)

## Discord Bot

- POST `/api/discord/bot/initialize`
  - Body: `{ "token": "string", "clientId": "string" }`
- POST `/api/discord/bot/start`
- POST `/api/discord/bot/stop`
- GET `/api/discord/bot/status`
- GET `/api/discord/bot/servers`
- GET `/api/discord/bot/invite-url`
- POST `/api/discord/bot/send-channel-message` (auth)
  - Body: `{ "guildId": "string", "channelId": "string", "message": "string" }`
- POST `/api/discord/bot/webhook`
  - Body: `{ "serverId": "string", "channelId": "string", "name": "string", "avatarUrl": "string" }`
- POST `/api/discord/articles`
  - Body:
    ```json
    {
      "title": "string",
      "description": "string",
      "content": "string",
      "author": "string",
      "featured": false
    }
    ```
  - Creates an article with `status: "draft"`

## Instagram Integration

Webhooks:
- GET `/api/instagram/webhooks/callback` (verification)
- POST `/api/instagram/webhooks/callback` (events)
- POST `/api/instagram/webhooks/subscribe`
- GET `/api/instagram/webhooks/subscriptions`
- DELETE `/api/instagram/webhooks/subscriptions/:id`
- GET `/api/instagram/webhooks/field-groups`
- GET `/api/instagram/webhooks/test`
- GET `/api/instagram/webhooks/logs`

Auth/config:
- POST `/api/instagram/auth/token`
  - Body: `{ "accessToken": "string", "userId": "string" }`

Graph helpers:
- GET `/api/instagram/account`
- GET `/api/instagram/media` (optional `?limit=`)
- GET `/api/instagram/media/:id`
- POST `/api/instagram/media`
  - Body: `{ "imageUrl": "https://...", "caption": "string" }`

## GitHub Integration

- GET `/api/github/settings` (auth)
- POST `/api/github/settings/:key` (auth)
- GET `/api/github/repository` (auth)

## Integration Settings (generic)

- GET `/api/integration-settings/:service` (auth)
- GET `/api/integration-settings/:service/:key` (auth)
- POST `/api/integration-settings` (auth)
- PUT `/api/integration-settings/:id` (auth)
- DELETE `/api/integration-settings/:id` (auth)

## Activity Logs

- GET `/api/activity-logs` (auth)

## Metrics

- GET `/api/metrics` (auth)

## Migration Progress

- GET `/api/migration-progress`

## API Status

- GET `/api/status`
- GET `/api/integration-status` (auth)