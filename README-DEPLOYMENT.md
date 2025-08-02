# Deployment Guide for Vercel

## Prerequisites

1. A Vercel account
2. All required environment variables configured
3. A PostgreSQL database (recommended: Vercel Postgres or Neon)

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/YOUR_REPO)

## Manual Deployment Steps

### 1. Prepare Your Repository

Ensure your code is pushed to GitHub, GitLab, or Bitbucket.

### 2. Import to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your repository
4. Vercel will automatically detect the configuration from `vercel.json`

### 3. Configure Environment Variables

In your Vercel project dashboard, go to Settings > Environment Variables and add:

```
DATABASE_URL=your_postgres_database_url
SESSION_SECRET=your_session_secret_here
IMGBB_API_KEY=your_imgbb_api_key
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
NODE_ENV=production
```

### 4. Database Setup

If using Vercel Postgres:
1. Go to Storage tab in Vercel dashboard
2. Create a new Postgres database
3. Copy the connection string to `DATABASE_URL`

Run database migrations after deployment:
```bash
npm run db:push
```

### 5. Deploy

Vercel will automatically deploy when you push to your main branch.

## Local Development vs Production

- **Local**: Uses SQLite database in development
- **Production**: Uses PostgreSQL database
- **Build**: Optimized for serverless functions

## Troubleshooting

### Build Failures
- Check that all dependencies are properly listed in `package.json`
- Ensure environment variables are set
- Check build logs in Vercel dashboard

### Runtime Issues
- Check function logs in Vercel dashboard
- Ensure database is accessible
- Verify all API keys are valid

### Large Bundle Size Warning
The build shows a warning about large chunks (>500KB). This is mainly due to:
- React and UI components
- Chart libraries
- Date/time libraries

For better performance, consider:
1. Implementing code splitting with dynamic imports
2. Using manual chunks configuration
3. Lazy loading non-critical components

## File Upload Considerations

Note that Vercel's serverless functions have limitations:
- 50MB maximum payload size
- 10-second execution timeout for Hobby plan
- Temporary file storage only

For production file uploads, consider:
1. Direct uploads to cloud storage (AWS S3, Cloudinary)
2. Using Vercel Blob for file storage
3. Implementing chunked uploads for large files