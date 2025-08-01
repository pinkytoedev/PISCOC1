# PISCOC1 - Multi-Platform Integration Ecosystem

A comprehensive platform for managing content across multiple social media and content management platforms including Discord, Airtable, Instagram, and more.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- PostgreSQL 16+
- npm or yarn

### Local Development Setup

#### Option 1: Manual Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PISCOC1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure your API keys and database connection. See [API Keys Setup](#api-keys-setup) section below.

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb multi_platform_integration
   
   # Push database schema
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   
   The application will be available at `http://localhost:5000`

#### Option 2: Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PISCOC1
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure your API keys. Database connection is handled automatically.

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```
   
   This will start both the application and PostgreSQL database. The application will be available at `http://localhost:5000`

4. **Initialize database**
   ```bash
   docker-compose exec app npm run db:push
   ```

### Production Build

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm run start
   ```

## 📊 Features

- **Multi-Platform Integration**: Connect with Discord, Airtable, Instagram, and Imgur
- **Content Management**: Create, edit, and manage articles across platforms
- **Team Collaboration**: Manage team members and permissions
- **API Key Management**: Centralized configuration page for all integrations
- **Real-time Status Monitoring**: Check the health of all connected services
- **Secure Authentication**: Session-based auth with role-based access control

## 🔑 API Keys Setup

This application integrates with multiple external services. You'll need to obtain API keys for each service you want to use:

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/multi_platform_integration

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
SESSION_SECRET=random_secure_session_string

# Frontend variables
VITE_FACEBOOK_APP_ID=${FACEBOOK_APP_ID}
```

### Obtaining API Keys

#### Discord
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the Bot Token for `DISCORD_BOT_TOKEN`
5. Copy the Application ID for `DISCORD_CLIENT_ID`

#### Airtable
1. Go to [Airtable API](https://airtable.com/create/tokens)
2. Create a personal access token
3. Use the token for `AIRTABLE_API_KEY`

#### Facebook/Instagram
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Instagram Basic Display product
4. Copy App ID for `FACEBOOK_APP_ID`
5. Copy App Secret for `FACEBOOK_APP_SECRET`

#### Imgur
1. Go to [Imgur API](https://api.imgur.com/oauth2/addclient)
2. Register your application
3. Copy Client ID for `IMGUR_CLIENT_ID`
4. Copy Client Secret for `IMGUR_CLIENT_SECRET`

### Managing API Keys

Once your application is running, you can use the **API Keys** page (`/keys`) to:

- View the configuration status of all integrations
- Get step-by-step setup instructions for each service
- Copy environment variable names
- Access direct links to API registration pages
- Monitor the health of all connected services

The Keys page is accessible from the sidebar under "Integrations → API Keys" and requires admin privileges.

## 🏗️ Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utility functions
├── server/                 # Express backend
│   ├── integrations/       # External service integrations
│   ├── middleware/         # Express middleware
│   ├── routes.ts           # API routes
│   └── index.ts            # Server entry point
├── shared/                 # Shared types and schemas
└── dist/                   # Built application
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes

## 🔐 Authentication

The application uses session-based authentication. Default admin credentials will be created during first setup.

## 📚 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed API endpoint documentation.

## 🔧 Database

This application uses PostgreSQL with Drizzle ORM. Database schema is defined in the `server/db.ts` file.

## 🚀 Deployment

The application is designed to run on a single port (5000) serving both the API and frontend. Ensure your deployment environment:

1. Has Node.js 20+ installed
2. Has PostgreSQL database available
3. Has all required environment variables set
4. Runs `npm run build` before starting
5. Starts with `npm run start`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.