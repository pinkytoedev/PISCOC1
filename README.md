# Multi-Platform Integration Ecosystem

A comprehensive multi-platform integration ecosystem that connects Discord, Airtable, Instagram, and Imgur with robust content management and synchronization capabilities.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Database Setup](#database-setup)
- [Development](#development)
- [API Documentation](#api-documentation)
- [External Services Integration](#external-services-integration)
  - [Discord](#discord)
  - [Airtable](#airtable)
  - [Instagram](#instagram)
  - [Imgur](#imgur)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)

## Overview

This application serves as a hub for managing content across multiple platforms. It provides a unified interface to connect services like Discord, Airtable, Instagram, and Imgur, enabling seamless content synchronization and management.

## Features

- **Cross-Platform Integration**: Connect and manage content across Discord, Airtable, Instagram, and Imgur
- **Content Synchronization**: Bidirectional content sync between connected platforms
- **User Management**: Secure authentication and user management
- **Webhook Support**: Receive and process events from integrated platforms
- **Interactive Dashboard**: Visualize integration status and activity
- **Image Management**: Upload, store, and distribute images across platforms
- **Comprehensive Logging**: Track all integration activities and system events

## Tech Stack

- **Frontend**: React with TypeScript, ShadCN UI components, Tailwind CSS
- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Drizzle ORM
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod validation
- **Authentication**: Passport.js
- **Integrations**: Platform-specific SDKs and APIs

## Architecture

The application follows a modular architecture with the following key components:

- **Frontend**: React SPA with modular components and pages
- **API Layer**: Express routes handling data requests
- **Storage Layer**: PostgreSQL database with Drizzle ORM
- **Integration Layer**: Platform-specific connectors for external services
- **Authentication**: Secure login and permission system

## Getting Started

### Prerequisites

- Node.js 20.x or later
- PostgreSQL 16.x or later
- npm or yarn package manager

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/multi-platform-integration.git
   cd multi-platform-integration
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory (see Environment Setup section below)

4. Set up the database (see Database Setup section below)

5. Start the development server:
   ```bash
   npm run dev
   ```

### Environment Setup

Create a `.env` file in the root directory with the following variables:

```
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# Discord Integration
# Get these from the Discord Developer Portal: https://discord.com/developers/applications
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=

# Airtable Integration
# Get this from your Airtable account: https://airtable.com/account
AIRTABLE_API_KEY=

# Instagram Integration (via Facebook)
# Get these from the Facebook Developer Portal: https://developers.facebook.com/apps
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# Imgur Integration
# Get these from the Imgur Developer Portal: https://api.imgur.com/oauth2/addclient
IMGUR_CLIENT_ID=
IMGUR_CLIENT_SECRET=

# Session Secret (generate a random string)
SESSION_SECRET=your_secure_random_string
```

**Important:** Never commit your `.env` file to version control. Add it to your `.gitignore` file.

### Database Setup

1. Create a PostgreSQL database:
   ```bash
   createdb multi_platform_integration
   ```

2. Push the schema to the database:
   ```bash
   npm run db:push
   ```

## Development

The application structure follows a specific pattern:

- `client/`: Frontend React application
  - `src/`: Source code
    - `components/`: Reusable UI components
    - `pages/`: Application pages and routes
    - `hooks/`: Custom React hooks
    - `lib/`: Utility functions and services
- `server/`: Backend Express application
  - `integrations/`: External service integrations
  - `routes.ts`: API route definitions
  - `storage.ts`: Database access layer
  - `auth.ts`: Authentication configuration
- `shared/`: Code shared between frontend and backend
  - `schema.ts`: Database schema and type definitions

To start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:5000

## API Documentation

The application provides a comprehensive set of RESTful API endpoints for managing various aspects of the system. For detailed API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

The API is divided into several categories:

- **Authentication**: User authentication and session management
- **Team Members**: Team member profiles management
- **Articles**: Content article management
- **Carousel Quotes**: Management of quotes displayed in carousels
- **Admin Requests**: Administrative request tracking and management
- **Image Assets**: Image file management
- **Integration Settings**: Configuration for external service integrations
- **Activity Logs**: System activity tracking
- **Metrics**: System performance and usage metrics
- **API Status**: Health and status of integrated services

All API endpoints follow RESTful conventions and support JSON data format.

## External Services Integration

### Discord

1. Create a Discord application at https://discord.com/developers/applications
2. Add a bot to your application
3. Set the bot permissions (requires at minimum: Read Messages, Send Messages, Manage Webhooks)
4. Copy the Bot Token and Client ID to your `.env` file
5. Configure webhooks in the application dashboard

### Airtable

1. Get your API key from https://airtable.com/account
2. Add the key to your `.env` file
3. Configure the Airtable base and table settings in the application dashboard

### Instagram

1. Create a Facebook app at https://developers.facebook.com/apps/
2. Set up Instagram Basic Display or Instagram Graph API
3. Configure the app settings and permissions
4. Add App ID and App Secret to your `.env` file
5. Configure webhooks in the application dashboard

### Imgur

1. Register an application at https://api.imgur.com/oauth2/addclient
2. Set callback URL to your application URL + `/api/imgur/auth/callback`
3. Add Client ID and Client Secret to your `.env` file
4. Configure OAuth settings in the application dashboard

## Deployment

### Standard Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm run start
   ```

### Docker Deployment

A `Dockerfile` and `docker-compose.yml` are included for containerized deployment.

1. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

## Security Considerations

- **Environment Variables**: Keep your API keys and secrets secure in environment variables
- **Access Control**: Implement proper authentication and authorization for users
- **Data Validation**: Validate all input with Zod schemas
- **Webhooks**: Verify webhook signatures where possible
- **OAuth Tokens**: Store tokens securely and implement proper refresh mechanisms

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.