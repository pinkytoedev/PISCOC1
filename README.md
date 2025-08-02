# PISCOC1 - Multi-Platform Integration Ecosystem

A comprehensive platform for managing content across multiple social media and content management platforms including Discord, Airtable, Instagram, and more.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- PostgreSQL 16+
- npm or yarn

### Local Development Setup

### Local Development Setup

#### 🚀 Quick Start (Recommended)

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd PISCOC1
   npm install
   ```

2. **Automated Environment Setup**
   ```bash
   npm run setup:env
   ```
   This guided setup will:
   - Create your `.env` file
   - Set up PostgreSQL (Docker recommended)
   - Generate secure session secrets
   - Guide you through API key setup

3. **Test your setup**
   ```bash
   npm run test:setup
   ```

4. **Start development**
   ```bash
   npm run dev
   ```
   
   The application will be available at `http://localhost:3000`

#### 📋 Manual Setup Options

##### Option 1: Docker PostgreSQL (Recommended)

1. **Prerequisites**: Docker and Docker Compose
2. **Start PostgreSQL**:
   ```bash
   npm run docker:db
   ```
3. **Set up database**:
   ```bash
   npm run db:setup
   ```
4. **Copy environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

##### Option 2: Local PostgreSQL

1. **Install PostgreSQL 16+**
2. **Create database**:
   ```bash
   createdb multi_platform_integration
   ```
3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Update DATABASE_URL in .env
   ```
4. **Set up schema**:
   ```bash
   npm run db:setup
   ```

##### Option 3: Neon.tech Cloud PostgreSQL

1. **Create account** at [neon.tech](https://neon.tech)
2. **Create project** and copy connection string
3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Add your Neon connection string to DATABASE_URL
   ```
4. **Set up schema**:
   ```bash
   npm run db:push
   ```

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

- **Multi-Platform Integration**: Connect with Discord, Airtable, Instagram, and ImgBB
- **Content Management**: Create, edit, and manage articles across platforms
- **Team Collaboration**: Manage team members and permissions
- **API Key Management**: Centralized configuration page for all integrations
- **Real-time Status Monitoring**: Check the health of all connected services
- **Secure Authentication**: Session-based auth with role-based access control

## 🔑 API Keys Setup

This application integrates with multiple external services. You'll need to obtain API keys for each service you want to use:

### Required Environment Variables (SEE .env.example)

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

#### ImgBB
1. Go to [ImgBB](https://imgbb.com/)
2. Create an account and go to [API](https://api.imgbb.com/)
3. Get your API key
4. Copy API key for `IMGBB_API_KEY`

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

- `npm run dev` - Start development server (HTTP)
- `npm run dev:https` - Start development server with HTTPS (required for Facebook Login)
- `npm run setup:https` - Generate HTTPS certificates for local development
- `npm run setup:env` - Interactive environment setup wizard
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes (for Neon/cloud databases)
- `npm run db:setup` - Set up database schema (for local databases)
- `npm run test:setup` - Check if you are ready to start dev session
- `npm run test:neon` - Check database configuration from env file
- `npm run docker:db` - Start PostgreSQL container only
- `npm run docker:db:stop` - Stop PostgreSQL container
- `npm run docker:full` - Start full application with Docker
- `npm run docker:full:stop` - Stop full Docker application

## 🐛 Troubleshooting

### Common Issues and Solutions

#### 1. Database Connection Issues

**Error**: `Failed to connect to database` or `The server does not support SSL connections`

**Solutions**:
- For local PostgreSQL: Make sure `sslmode=disable` in your DATABASE_URL
- For Docker: Run `npm run docker:db` to start PostgreSQL container
- For Neon.tech: Make sure `sslmode=require` in your DATABASE_URL
- Test connection: `npm run test:setup`

#### 2. Missing Environment Variables

**Error**: Environment variables not set warnings

**Solutions**:
- Run `npm run setup:env` for guided setup
- Copy `.env.example` to `.env` and fill in your values
- Generate session secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### 3. Port Already in Use

**Error**: `EADDRINUSE` or port conflicts

**Solutions**:
- The app automatically tries ports 3000, 3001, 3002, etc.
- Kill existing processes: `lsof -ti:3000 | xargs kill`
- Use Docker: `npm run docker:full`

#### 4. Missing Database Tables

**Error**: `relation "table_name" does not exist`

**Solutions**:
- Run `npm run db:setup` for local databases
- Run `npm run db:push` for cloud databases (Neon)
- Check database connection first: `npm run test:setup`

#### 5. Node.js Version Issues

**Error**: Compatibility issues or build failures

**Solutions**:
- Use Node.js 20+: `node --version`
- Clear cache: `npm cache clean --force`
- Delete node_modules: `rm -rf node_modules && npm install`

#### 6. API Integration Issues

**Error**: API keys not working or features not functioning

**Solutions**:
- Visit `/keys` page in the app to test API integrations
- Check API key format in `.env` file
- Verify external service is accessible
- For Facebook: Use HTTPS - `npm run dev:https`

#### 7. File Upload Issues

**Error**: File upload failures or permission errors

**Solutions**:
- Check directory permissions: `ls -la uploads/`
- Create directories: `mkdir -p uploads temp certs uploads/instagram`
- For Docker: Check volume mounts

#### 8. Build or TypeScript Errors

**Error**: Compilation or build failures

**Solutions**:
- Check TypeScript: `npm run check`
- Clear cache: `rm -rf dist && npm run build`
- Update dependencies: `npm update`

### Getting Help

1. **Run diagnostics**: `npm run test:setup`
2. **Check logs**: Look at console output for specific error messages
3. **Verify environment**: Make sure all required environment variables are set
4. **Test database**: Use `npm run test:neon` for database-specific issues
5. **Reset setup**: Delete `.env` and run `npm run setup:env`

### Quick Reset Commands

```bash
# Reset environment
rm .env && npm run setup:env

# Reset database (Docker)
npm run docker:db:stop && npm run docker:db && npm run db:setup

# Reset dependencies
rm -rf node_modules package-lock.json && npm install

# Full reset
git clean -fdx && npm install && npm run setup:env
```

### 🔒 HTTPS Setup for Facebook Integration

Facebook requires HTTPS for OAuth login. To enable this in development:

1. **Generate HTTPS certificates**:
   ```bash
   npm run setup:https
   ```

2. **Start HTTPS development server**:
   ```bash
   npm run dev:https
   ```

3. **Access your app**:
   - **For development**: Use `http://localhost:3000` (Facebook SDK now works properly)
   - **For Facebook testing**: Use `https://localhost:3001` (may show WebSocket warnings - these are safe to ignore)

4. **Accept the security warning** when visiting `https://localhost:3001` (this is safe for localhost development)

> **Note**: The WebSocket warnings in the console when using HTTPS are harmless and don't affect Facebook functionality. For regular development, use HTTP. Use HTTPS only when testing Facebook Login specifically.

## 🔐 Authentication

The application uses session-based authentication. Default admin credentials will be created during first setup.

## 📚 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed API endpoint documentation.

## 🔧 Database

This application uses NEON PostgreSQL with Drizzle ORM. Database schema is defined in the `server/db.ts` file.

## 🚀 Development

### Pre-Development Checklist

Before starting development, ensure your environment is properly configured:

1. **✅ Environment Check**
   ```bash
   npm run test:setup
   ```
   This will verify:
   - Node.js version (20+)
   - npm installation
   - PostgreSQL availability
   - Environment variables
   - Database connection
   - File permissions

2. **✅ Database Setup**
   ```bash
   # For Docker PostgreSQL (recommended)
   npm run docker:db && npm run db:setup
   
   # For cloud databases (Neon.tech)
   npm run db:push
   ```

3. **✅ API Keys Configuration**
   - Visit the **API Keys** page (`/keys`) in the running application
   - Follow the setup instructions for each integration
   - Test connectivity using the built-in status checks

### Development Workflow

1. **Start development server**:
   ```bash
   npm run dev
   ```
   - Application: `http://localhost:3000`
   - Auto-reloads on code changes
   - API endpoints: `http://localhost:3000/api/*`

2. **For Facebook/Instagram development**:
   ```bash
   npm run dev:https
   ```
   - HTTPS Application: `https://localhost:3001`
   - Required for Facebook SDK integration
   - Accept security warning for localhost

3. **Database operations**:
   ```bash
   # Check database status
   npm run test:neon
   
   # Update schema (cloud databases)
   npm run db:push
   
   # Reset local database
   npm run db:setup
   ```

### Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utility functions
├── server/                 # Express backend
│   ├── integrations/       # External service integrations
│   ├── middleware/         # Express middleware
│   ├── utils/              # Server utilities
│   ├── routes.ts           # API routes
│   └── index.ts            # Server entry point
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Database schema (Drizzle)
├── scripts/                # Development scripts
├── uploads/                # File upload storage
└── dist/                   # Built application
```

### API Integration Status

The application integrates with multiple external services. Use the `/keys` page to:
- View configuration status of all integrations
- Get step-by-step setup instructions
- Test API connectivity
- Monitor service health

### Port Configuration

The application automatically handles port conflicts:
- **Primary**: 3000 (HTTP development)
- **HTTPS**: 3001 (for Facebook integration)
- **Fallback**: 3002, 3003, 5000, 5001, 5002
- **Database**: 5432 (PostgreSQL)

### Environment Variables

Required for basic functionality:
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption key

Optional (enables specific integrations):
- Discord: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Airtable: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`
- Facebook/Instagram: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- ImgBB: `IMGBB_API_KEY`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.