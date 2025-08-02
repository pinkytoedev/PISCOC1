#!/bin/bash

# Script to push environment variables to Vercel with production values
# This script reads from .env but applies production-specific overrides

echo "🚀 Pushing environment variables to Vercel (Production)..."
echo ""

# Use npx if vercel is not globally installed
VERCEL_CMD="vercel"
if ! command -v vercel &> /dev/null; then
    VERCEL_CMD="npx vercel"
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

echo "📋 Reading variables from .env file and applying production overrides..."
echo ""

# Function to add env var to Vercel
add_to_vercel() {
    local key=$1
    local value=$2
    
    if [ -z "$value" ] || [[ "$value" == *"your_"*"_here"* ]]; then
        echo "⚠️  Skipping $key - placeholder value detected"
        return
    fi
    
    echo "Adding $key..."
    echo "$value" | $VERCEL_CMD env add "$key" production --force --yes 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ $key added successfully"
    else
        echo "❌ Failed to add $key (might already exist)"
    fi
}

# Source the .env file
export $(cat .env | grep -v '^#' | xargs)

# Add variables with production overrides
add_to_vercel "DATABASE_URL" "$DATABASE_URL"
add_to_vercel "SESSION_SECRET" "$SESSION_SECRET"
add_to_vercel "DISCORD_BOT_TOKEN" "$DISCORD_BOT_TOKEN"
add_to_vercel "DISCORD_CLIENT_ID" "$DISCORD_CLIENT_ID"
add_to_vercel "DISCORD_CLIENT_SECRET" "$DISCORD_CLIENT_SECRET"
add_to_vercel "AIRTABLE_API_KEY" "$AIRTABLE_API_KEY"
add_to_vercel "AIRTABLE_BASE_ID" "$AIRTABLE_BASE_ID"
add_to_vercel "FACEBOOK_APP_ID" "$FACEBOOK_APP_ID"
add_to_vercel "FACEBOOK_APP_SECRET" "$FACEBOOK_APP_SECRET"
add_to_vercel "INSTAGRAM_APP_ID" "$INSTAGRAM_APP_ID"
add_to_vercel "INSTAGRAM_APP_SECRET" "$INSTAGRAM_APP_SECRET"
add_to_vercel "IMGBB_API_KEY" "$IMGBB_API_KEY"

# Production-specific overrides
add_to_vercel "NODE_ENV" "production"
add_to_vercel "FRONTEND_URL" "https://piscoc-1.vercel.app"

# Optional variables
[ ! -z "$BASE_URL" ] && add_to_vercel "BASE_URL" "$BASE_URL"
[ ! -z "$WEBHOOK_URL" ] && add_to_vercel "WEBHOOK_URL" "$WEBHOOK_URL"
[ ! -z "$WEBHOOK_VERIFY_TOKEN" ] && add_to_vercel "WEBHOOK_VERIFY_TOKEN" "$WEBHOOK_VERIFY_TOKEN"

echo ""
echo "✅ Environment variables have been pushed to Vercel!"
echo ""
echo "📝 Note: Production overrides applied:"
echo "   - NODE_ENV → production"
echo "   - FRONTEND_URL → https://piscoc-1.vercel.app"
echo ""
echo "🔗 View your environment variables at:"
echo "   https://vercel.com/jawednurs-projects/piscoc-1/settings/environment-variables"
echo ""
echo "🚀 Deploy your project with: vercel --prod"