# Deployment Guide

This document provides comprehensive instructions for deploying the Multi-Platform Integration Ecosystem to various environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Deployment Options](#deployment-options)
  - [Standard Deployment](#standard-deployment)
  - [Docker Deployment](#docker-deployment)
  - [Cloud Platform Deployment](#cloud-platform-deployment)
- [Post-Deployment Tasks](#post-deployment-tasks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

- Node.js 20.x or later
- PostgreSQL 16.x or later
- All required API keys and secrets for integrations
- Git installed (for deployment from a repository)
- Docker and Docker Compose (for containerized deployment)

## Environment Configuration

1. Clone the repository:
   ```bash
   git clone https://github.com/your-organization/multi-platform-integration.git
   cd multi-platform-integration
   ```

2. Create a `.env` file with all required environment variables:
   ```
   # Database
   DATABASE_URL=postgresql://username:password@hostname:5432/database_name

   # Discord Integration
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id

   # Airtable Integration
   AIRTABLE_API_KEY=your_airtable_api_key

   # Instagram Integration (via Facebook)
   FACEBOOK_APP_ID=your_facebook_app_id
   FACEBOOK_APP_SECRET=your_facebook_app_secret

   # Imgur Integration
   IMGUR_CLIENT_ID=your_imgur_client_id
   IMGUR_CLIENT_SECRET=your_imgur_client_secret

   # Session Secret (generate a random string)
   SESSION_SECRET=your_secure_random_string

   # Frontend variables
   VITE_FACEBOOK_APP_ID=${FACEBOOK_APP_ID}
   ```

## Database Setup

1. Create a PostgreSQL database:
   ```bash
   createdb multi_platform_integration
   ```

2. Run database migration:
   ```bash
   npm run db:push
   ```

## Deployment Options

### Standard Deployment

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the application:
   ```bash
   npm run build
   ```

3. Start the production server:
   ```bash
   npm run start
   ```

### Docker Deployment

1. Build and start containers:
   ```bash
   docker-compose up -d
   ```

2. For manual builds:
   ```bash
   docker build -t multi-platform-integration .
   docker run -p 5000:5000 --env-file .env multi-platform-integration
   ```

### Cloud Platform Deployment

#### Heroku

1. Install Heroku CLI and login:
   ```bash
   heroku login
   ```

2. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```

3. Add PostgreSQL add-on:
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

4. Set environment variables:
   ```bash
   heroku config:set DISCORD_BOT_TOKEN=your_token
   heroku config:set DISCORD_CLIENT_ID=your_client_id
   # Set all other environment variables
   ```

5. Deploy:
   ```bash
   git push heroku main
   ```

#### AWS Elastic Beanstalk

1. Install EB CLI:
   ```bash
   pip install awsebcli
   ```

2. Initialize EB application:
   ```bash
   eb init
   ```

3. Create environment:
   ```bash
   eb create production
   ```

4. Set environment variables:
   ```bash
   eb setenv DISCORD_BOT_TOKEN=your_token DISCORD_CLIENT_ID=your_client_id
   # Set all other environment variables
   ```

5. Deploy:
   ```bash
   eb deploy
   ```

## Post-Deployment Tasks

1. Verify application is running:
   ```bash
   curl https://your-deployment-url/api/health
   ```

2. Set up initial administrator account:
   ```bash
   node createAdmin.js
   ```

3. Configure integration settings in the application dashboard

4. Set up webhooks for external services

## Troubleshooting

### Database Connection Issues

If you experience database connection problems:

1. Verify database credentials in your `.env` file
2. Ensure the database server is accessible from your deployment environment
3. Check for firewall rules blocking PostgreSQL port (5432)

### Integration Failures

If integrations aren't working:

1. Verify all API keys and tokens are correctly set in environment variables
2. Check integration settings in the application dashboard
3. Inspect application logs for specific error messages
4. Verify webhook URLs are correctly configured in external services

### Performance Issues

If experiencing performance problems:

1. Scale database resources if needed
2. Consider using connection pooling
3. Implement caching for frequently accessed data
4. Monitor memory usage and increase if necessary

For additional assistance, please file an issue in the GitHub repository.