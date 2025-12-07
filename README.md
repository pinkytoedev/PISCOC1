# PISCOC1 - Multi-Platform Integration Ecosystem

A comprehensive platform for managing content across multiple social media and content management platforms including Airtable, Instagram, and more.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- PostgreSQL 16+
- npm or yarn
- Railway CLI (optional, recommended for local env injection)
   'npm i -g @railway/cli'

### Local Development Setup

#### Option 1: Railway (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Login and link Railway** (for local env variables)
   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   ```

4. **Start development server with Railway env**
   ```bash
   railway run npm run dev
   ```
   The app will start on `http://localhost:3000` (auto-fallbacks to `3001`, `3002`, etc. if ports are busy). HTTPS for Facebook runs on `https://localhost:3001`.

#### Option 2: Manual Setup (without Railway)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Edit `.env` and configure your API keys and database connection. See [API Keys Setup](#api-keys-setup).

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb [Database name]

   # Push database schema
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   The app will start on `http://localhost:3000` (auto-fallbacks to `3001`, `3002`, etc. if ports are busy).

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

- **Multi-Platform Integration**: Connect with Airtable, Instagram, and ImgBB
- **Content Management**: Create, edit, and manage articles across platforms
- **Team Collaboration**: Manage team members and permissions
- **API Key Management**: Centralized configuration page for all integrations
- **Real-time Status Monitoring**: Check the health of all connected services
- **Secure Authentication**: Session-based auth with role-based access control

## 🔑 API Keys Setup

This application integrates with multiple external services. You'll need to obtain API keys for each service you want to use:

### Required Environment Variables (SEE .env.example)

### Obtaining API Keys

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

- `npm run dev` - Start development server (HTTP). When using Railway env vars locally, run `railway run npm run dev`.
- `npm run dev:https` - Start development server with HTTPS (required for Facebook Login)
- `npm run setup:https` - Generate HTTPS certificates for local development
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes
-`npm run test:setup` - Check if you are ready to start dev session


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

The application uses session-based authentication. Default administrator credentials are pulled securely from Airtable during first setup instead of being hard-coded in the repository.

1. Create an Airtable table (defaults to `AdminCredentials`) with a record that includes username and password fields (defaults to `Username` and `Password`).
2. Configure environment variables so `scripts/createAdmin.js` can fetch the record:
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `ADMIN_CREDENTIALS_RECORD_ID`
   - Optional overrides: `ADMIN_CREDENTIALS_TABLE`, `ADMIN_CREDENTIALS_USERNAME_FIELD`, `ADMIN_CREDENTIALS_PASSWORD_FIELD`
3. Run `node scripts/createAdmin.js` to create the admin account using the fetched credentials.

Optionally set `VITE_DEFAULT_ADMIN_USERNAME` (to match the Airtable username) so the UI can remind you to rotate off the default account. After signing in, create a new administrator with a unique password, then disable or remove the default

## 📚 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed API endpoint documentation.

## 🔧 Database
Uses Postgres through Railway.

## 🚀 Development

The application serves both API and frontend from a single Express server using Vite middleware in development.

- Ensure you have Node.js 20+, PostgreSQL available, and required environment variables set (via `.env` or Railway).
- Optional checks: `npm run test:setup`, will see if everything is present to start dev server
  - With Railway env vars: `railway run npm run dev`
  - Manually: `npm run dev`
- Visit `http://localhost:3000` (falls back to `3001`, `3002`, ... if busy). For Facebook login testing, use `https://localhost:3001`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.
