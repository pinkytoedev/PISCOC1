#!/bin/bash

# Quick environment check script for PISCOC.
#
# NOT wired to any npm script, and macOS/Linux only (it uses lsof).
# `npm run test:setup` is the maintained equivalent.
#
# Stale behaviour, left as-is: it creates uploads/, uploads/instagram/ and
# temp/. Uploads now go to the OS temp directory (see server/middleware/upload.ts
# and .gitignore), and there is no Instagram integration in this codebase.

echo "🚀 PISCOC Quick Environment Check"
echo "================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Node.js
echo -e "\n📦 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found"
fi

# Check npm
echo -e "\n📦 Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} npm installed: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm not found"
fi

# Check PostgreSQL
echo -e "\n🐘 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    echo -e "${GREEN}✓${NC} PostgreSQL client: $PSQL_VERSION"
else
    echo -e "${YELLOW}⚠${NC} PostgreSQL client not found (you can use Docker instead)"
fi

# Check .env file
echo -e "\n🔐 Checking .env file..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    # Count configured variables
    ENV_COUNT=$(grep -c "=" .env 2>/dev/null || echo "0")
    echo -e "   Found $ENV_COUNT environment variables"
else
    echo -e "${RED}✗${NC} .env file not found"
    if [ -f ".env.example" ]; then
        echo -e "   Run: cp .env.example .env"
    fi
fi

# Check node_modules
echo -e "\n📚 Checking dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules directory exists"
else
    echo -e "${RED}✗${NC} node_modules not found"
    echo -e "   Run: npm install"
fi

# Check required directories
echo -e "\n📁 Checking required directories..."
DIRS=("uploads" "temp" "certs" "uploads/instagram")
for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $dir exists"
    else
        echo -e "${YELLOW}⚠${NC} $dir missing (will be created)"
        mkdir -p "$dir"
    fi
done

# Check ports
echo -e "\n🔌 Checking default ports..."
for port in 3000 3001 5432; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠${NC} Port $port is in use"
    else
        echo -e "${GREEN}✓${NC} Port $port is available"
    fi
done

echo -e "\n✨ Quick check complete!"
echo -e "Run ${GREEN}npm run test:setup${NC} for a comprehensive test."