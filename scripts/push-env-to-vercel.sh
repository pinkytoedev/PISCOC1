#!/bin/bash

# Script to push environment variables from .env to Vercel
# Usage: ./scripts/push-env-to-vercel.sh

echo "🚀 Pushing environment variables to Vercel..."
echo ""

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null && ! command -v npx &> /dev/null; then
    echo "❌ Vercel CLI not available. Please install it first."
    exit 1
fi

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

echo "📋 Reading variables from .env file..."
echo ""

# Function to add env var to Vercel
add_to_vercel() {
    local key=$1
    local value=$2
    
    if [ -z "$value" ] || [ "$value" = "your_${key,,}_here" ]; then
        echo "⚠️  Skipping $key - placeholder value detected"
        return
    fi
    
    echo "Adding $key..."
    echo "$value" | $VERCEL_CMD env add "$key" production --force 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ $key added successfully"
    else
        echo "❌ Failed to add $key (might already exist)"
    fi
    echo ""
}

# Read .env file and process each line
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Remove quotes from value
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    
    # Add to Vercel
    add_to_vercel "$key" "$value"
    
done < .env

echo ""
echo "✅ Environment variables push complete!"
echo ""
echo "🔍 Next steps:"
echo "   1. Go to your Vercel dashboard to verify"
echo "   2. Update any placeholder values"
echo "   3. Redeploy your project"
echo ""
echo "📝 Note: DISCORD_CLIENT_SECRET needs to be updated with your actual secret!"