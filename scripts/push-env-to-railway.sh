#!/bin/bash

# Script to push environment variables to Railway
echo "🚀 Pushing environment variables to Railway..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Function to add env var to Railway
add_to_railway() {
    local key=$1
    local value=$2
    
    if [ -z "$value" ] || [[ "$value" == *"your_"*"_here"* ]]; then
        echo "⚠️  Skipping $key - placeholder value detected"
        return
    fi
    
    echo "Adding $key..."
    railway variables --set "$key=$value"
    
    if [ $? -eq 0 ]; then
        echo "✅ $key added successfully"
    else
        echo "❌ Failed to add $key"
    fi
}

# Source the .env file
export $(cat .env | grep -v '^#' | xargs)

# Add all required variables
echo "Adding database and core variables..."
add_to_railway "DATABASE_URL" "$DATABASE_URL"
add_to_railway "SESSION_SECRET" "$SESSION_SECRET"

echo ""
echo "Adding Discord variables..."
add_to_railway "DISCORD_BOT_TOKEN" "$DISCORD_BOT_TOKEN"
add_to_railway "DISCORD_CLIENT_ID" "$DISCORD_CLIENT_ID"
add_to_railway "DISCORD_CLIENT_SECRET" "$DISCORD_CLIENT_SECRET"

echo ""
echo "Adding integration variables..."
add_to_railway "AIRTABLE_API_KEY" "$AIRTABLE_API_KEY"
add_to_railway "AIRTABLE_BASE_ID" "$AIRTABLE_BASE_ID"
add_to_railway "FACEBOOK_APP_ID" "$FACEBOOK_APP_ID"
add_to_railway "FACEBOOK_APP_SECRET" "$FACEBOOK_APP_SECRET"
add_to_railway "INSTAGRAM_APP_ID" "$INSTAGRAM_APP_ID"
add_to_railway "INSTAGRAM_APP_SECRET" "$INSTAGRAM_APP_SECRET"
add_to_railway "IMGBB_API_KEY" "$IMGBB_API_KEY"

# Add production-specific variables
echo ""
echo "Adding production-specific variables..."
railway variables --set "NODE_ENV=production"
railway variables --set "PORT=3001"

# Optional variables
echo ""
echo "Adding optional variables..."
[ ! -z "$BASE_URL" ] && add_to_railway "BASE_URL" "$BASE_URL"
[ ! -z "$WEBHOOK_URL" ] && add_to_railway "WEBHOOK_URL" "$WEBHOOK_URL"
[ ! -z "$WEBHOOK_VERIFY_TOKEN" ] && add_to_railway "WEBHOOK_VERIFY_TOKEN" "$WEBHOOK_VERIFY_TOKEN"

echo ""
echo "✅ Environment variables have been pushed to Railway!"
echo ""
echo "📝 Note: FRONTEND_URL will be set after deployment when we know the Railway URL"
echo ""
echo "🚀 Next step: Deploy with 'railway up'"