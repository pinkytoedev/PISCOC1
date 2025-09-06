#!/bin/bash

# N8N Setup Script for PISCOC Integration
# This script helps set up N8N with the necessary configuration

echo "🚀 Setting up N8N for PISCOC Integration"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p n8n-workflows
mkdir -p ~/.n8n

# Generate secure passwords and keys
echo "🔐 Generating secure credentials..."

# Generate 32-character encryption key
ENCRYPTION_KEY=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-32)

# Generate API key for PISCOC integration
PISCOC_API_KEY=$(openssl rand -hex 32)

# Generate N8N admin password
N8N_PASSWORD=$(openssl rand -base64 12 | tr -d "=+/")

echo "✅ Generated secure credentials"

# Create environment file for N8N
echo "📝 Creating N8N environment configuration..."

cat > .env.n8n << EOF
# N8N Configuration
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}

# PISCOC Integration
PISCOC_API_KEY=${PISCOC_API_KEY}
PISCOC_BASE_URL=http://localhost:5000

# Email Configuration (Update these with your values)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=admin@yourdomain.com
EOF

echo "✅ Created .env.n8n file"

# Update docker-compose file with generated credentials
echo "🔧 Updating Docker Compose configuration..."

# Create a temporary file with the updated configuration
cat > docker-compose.n8n.yml.tmp << EOF
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: piscoc-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      # Basic authentication
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      
      # Database (using SQLite for simplicity)
      - DB_TYPE=sqlite
      - DB_SQLITE_DATABASE=/home/node/.n8n/database.sqlite
      
      # Webhook configuration
      - WEBHOOK_URL=http://localhost:5678/
      
      # Execution settings
      - EXECUTIONS_PROCESS=main
      - EXECUTIONS_MODE=regular
      
      # Security
      - N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
      
      # Custom environment variables for PISCOC integration
      - PISCOC_API_KEY=${PISCOC_API_KEY}
      - PISCOC_BASE_URL=http://localhost:5000
      
      # Email configuration (Update these in .env.n8n)
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USER=your-email@gmail.com
      - SMTP_PASS=your-app-password
      - ADMIN_EMAIL=admin@yourdomain.com
      
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n-workflows:/home/node/.n8n/workflows
      
    networks:
      - piscoc-network

volumes:
  n8n_data:
    driver: local

networks:
  piscoc-network:
    driver: bridge
EOF

# Replace the original file
mv docker-compose.n8n.yml.tmp docker-compose.n8n.yml

echo "✅ Updated docker-compose.n8n.yml with secure credentials"

# Add N8N API key to PISCOC environment
echo "🔑 Adding N8N API key to PISCOC environment..."

# Check if .env file exists
if [ -f .env ]; then
    # Add N8N API key if not already present
    if ! grep -q "N8N_API_KEY" .env; then
        echo "" >> .env
        echo "# N8N Integration" >> .env
        echo "N8N_API_KEY=${PISCOC_API_KEY}" >> .env
        echo "✅ Added N8N_API_KEY to .env file"
    else
        echo "ℹ️  N8N_API_KEY already exists in .env file"
    fi
else
    echo "⚠️  .env file not found. Please add the following to your .env file:"
    echo "N8N_API_KEY=${PISCOC_API_KEY}"
fi

echo ""
echo "🎉 N8N Setup Complete!"
echo "======================"
echo ""
echo "📋 Next Steps:"
echo "1. Update email settings in .env.n8n file"
echo "2. Start N8N: docker-compose -f docker-compose.n8n.yml up -d"
echo "3. Access N8N at: http://localhost:5678"
echo "4. Login with: admin / ${N8N_PASSWORD}"
echo ""
echo "🔧 Configuration Details:"
echo "- N8N Admin Password: ${N8N_PASSWORD}"
echo "- PISCOC API Key: ${PISCOC_API_KEY}"
echo "- N8N Encryption Key: ${ENCRYPTION_KEY}"
echo ""
echo "📚 Documentation:"
echo "- N8N Analysis: N8N_INTEGRATION_ANALYSIS.md"
echo "- Implementation Guide: N8N_IMPLEMENTATION_GUIDE.md"
echo ""
echo "⚠️  Important: Update the email settings in .env.n8n before starting N8N!" 