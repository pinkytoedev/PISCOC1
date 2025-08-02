# Vercel Environment Variables Setup Guide

## Understanding the Difference

### Local Development (.env file)
- Your `.env` file contains all your secrets and configuration
- `npm run test:setup` reads from this file
- Works great for local development

### Vercel Production (Environment Variables)
- Vercel DOES NOT automatically read `.env` files
- You must manually add each variable in Vercel's dashboard
- These are stored securely in Vercel's infrastructure

## Quick Setup Steps

### 1. Verify your .env file has all values
```bash
npm run vercel:check -- --local
```

### 2. Check what's currently in your shell (what Vercel sees)
```bash
npm run vercel:check
```

### 3. Add variables to Vercel

#### Option A: Via Dashboard (Recommended)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click "Settings" tab
4. Click "Environment Variables" in sidebar
5. For each variable in your .env file:
   - Click "Add New"
   - Enter the key (e.g., `DATABASE_URL`)
   - Paste the value from your .env file
   - Select environments (Production, Preview, Development)
   - Click "Save"

#### Option B: Via Vercel CLI
```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Link your project
vercel link

# Add each variable
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production
# ... repeat for each variable
```

## Required Environment Variables

These MUST be set in Vercel for your app to work:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Random string for sessions | Any long random string |
| `DISCORD_BOT_TOKEN` | Discord bot token | From Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Discord app ID | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | Discord app secret | From Discord Developer Portal |
| `AIRTABLE_API_KEY` | Airtable personal access token | From Airtable account |
| `AIRTABLE_BASE_ID` | Your Airtable base ID | Starts with `app...` |
| `FACEBOOK_APP_ID` | Facebook app ID | From Meta Developer Portal |
| `FACEBOOK_APP_SECRET` | Facebook app secret | From Meta Developer Portal |
| `INSTAGRAM_APP_ID` | Instagram app ID | Same as Facebook usually |
| `INSTAGRAM_APP_SECRET` | Instagram app secret | Same as Facebook usually |
| `IMGBB_API_KEY` | ImgBB API key | From ImgBB account |
| `NODE_ENV` | Environment setting | `production` |
| `FRONTEND_URL` | Your frontend URL | `https://your-app.vercel.app` |

## Common Issues

### "Missing environment variables" error in Vercel
- You haven't added the variables to Vercel's dashboard
- Solution: Follow the setup steps above

### Variables work locally but not in Vercel
- Vercel doesn't read .env files
- Solution: Manually add each variable to Vercel

### Database connection fails in Vercel
- Your DATABASE_URL might be using localhost
- Solution: Use a cloud database (Neon, Supabase, etc.)

## Pro Tips

1. **Use different values for production**
   - Don't use the same API keys for dev and production
   - Create separate Discord bots, Airtable bases, etc.

2. **Sensitive variables**
   - Mark sensitive variables as "Sensitive" in Vercel
   - This hides them from logs

3. **Environment-specific variables**
   - You can set different values for Production/Preview/Development
   - Useful for testing

## Verification

After adding all variables to Vercel:

1. Trigger a new deployment
2. Check the Function logs in Vercel dashboard
3. Look for any "undefined" errors related to env vars

## Need Help?

If you're still having issues:
1. Double-check variable names (they're case-sensitive!)
2. Make sure there are no extra spaces in values
3. Check Vercel's Function logs for specific errors