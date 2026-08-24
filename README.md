# PISCOC1 - Multi-Platform Integration Ecosystem

A comprehensive platform for managing editorial content, backed by Airtable and ImgBB.

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
   The app will start on `http://localhost:3000` (auto-fallbacks to `3002`, `3003`, etc. if ports are busy). The optional HTTPS listener runs on `https://localhost:3001`, which HTTP never falls back onto.

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
   The app will start on `http://localhost:3000` (auto-fallbacks to `3002`, `3003`, etc. if ports are busy; `3001` is reserved for HTTPS).

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

- **Multi-Platform Integration**: Connect with Airtable and ImgBB
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
├── client/
│   └── src/
│       ├── components/
│       │   ├── articles/   # Article table rows, cards, form fields, upload panels
│       │   ├── dashboard/  # Composed dashboard containers
│       │   ├── modals/     # Create / edit / view dialogs
│       │   └── ui/         # shadcn primitives (vendored; edit with care)
│       ├── hooks/          # Data-fetching and mutation hooks
│       ├── pages/          # Routed pages
│       └── lib/            # queryClient (CSRF-aware fetch helpers), utils
├── server/
│   ├── lib/                # Infrastructure: env, logger, errors, sanitizer,
│   │                       # redaction, Airtable REST client. No Express, no domain.
│   ├── middleware/         # auth, csrf, rateLimit, upload, webhookAuth
│   ├── services/           # Domain logic, no Express:
│   │                       #   settings   cached integration credentials
│   │                       #   activity   audit log
│   │                       #   articles   publication side effects
│   │                       #   reupload   re-upload sessions
│   │                       #   uploadTokens contributor links
│   │                       #   siteRefresh  cache invalidation
│   │                       #   images/    hosting + SSRF-guarded fetching
│   ├── integrations/       # Third-party: airtable/, imgbb,
│   │                       # contributorUpload, directUpload, teamPublicUpload
│   ├── routes/             # Thin Express routers, one per resource;
│   │                       # index.ts is mount order and nothing else
│   ├── storage.ts          # Database access
│   └── index.ts            # Entry point
├── shared/schema.ts        # Drizzle tables + Zod schemas, used by both sides
├── migrations/             # Hand-applied SQL, in order
└── scripts/                # Verification and inspection tooling
```

Layering runs one way: `routes → services → lib`. Route handlers parse and
respond; services own the domain rules; `lib` knows nothing about either.

## 🔧 Available Scripts

**Development**
- `npm run dev` — development server (HTTP). With Railway env vars: `railway run npm run dev`.
- `npm run dev:https` — HTTPS, for testing behaviour that requires TLS
- `npm run setup:https` — generate local certificates
- `npm run check` — TypeScript type checking
- `npm run db:push` — push schema changes

**Build and run**
- `npm run build` / `npm run start`

**Verification** — each exits non-zero on failure, so they can gate a deploy
- `npm run verify:guards` — asserts no route is unauthenticated unless it is on
  an allowlist with a stated reason. Reads the live Express stack, so it cannot
  be fooled by how the source looks.
- `npm run verify:uploads` — file-type verification and image normalization.
  No server or database needed.
- `npm run verify:security` — HTML sanitization, re-upload sessions, upload-link
  scoping and revocation, secret redaction, error shapes. Needs a running server.
- `npm run verify:routes` — reachability and auth for every migrated route.
  Needs a running server.
- `npm run routes` — print all routes with their guards.


### 🔒 Local HTTPS (optional)

Plain HTTP on `http://localhost:3000` is the normal way to develop. A TLS
listener is available for the occasional case that needs one:

1. **Generate HTTPS certificates**:
   ```bash
   npm run setup:https
   ```

2. **Start HTTPS development server**:
   ```bash
   npm run dev:https
   ```

3. **Accept the security warning** when visiting `https://localhost:3001` (this is safe for localhost development)

> **Note**: The WebSocket warnings in the console when using HTTPS are harmless. For regular development, use HTTP.

## 🔐 Authentication and security

Session-based authentication, with four levels of access. `npm run verify:guards`
prints the breakdown and fails if the unauthenticated surface grows.

**Two environment variables gate real protections:**

- `SESSION_SECRET` — **required in production; the server refuses to boot without
  it.** Generate with `openssl rand -hex 32`.
- `WEBHOOK_SECRET` — protects `POST /api/webhooks/article-published`, which
  triggers a full Airtable sync. Unset leaves it open to anyone.

**CSRF.** Session cookies use `SameSite=None` in production, so every
state-changing request must echo the `csrf_token` cookie back in an
`x-csrf-token` header. Use `apiRequest()` / `apiUpload()` from
`client/src/lib/queryClient.ts` and this is handled; a raw `fetch` will get a 403.

**Contributor uploads.** People outside the CMS submit content through a
generated link — no account. The link is a random secret stored only as a hash,
scoped to one article and one set of asset types. All uploaded HTML is sanitized
before storage, and every file's real format is checked from its leading bytes.
See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

**Secrets** in `integration_settings` are never returned in full; the API sends a
masked preview and a `configured` flag.

### First administrator

Default administrator credentials are pulled from Airtable during first setup
instead of being hard-coded in the repository.

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

Postgres, through Railway in production.

Migrations in `migrations/` are applied **by hand, in order** — the Drizzle
journal only tracks `0000`, so `drizzle-kit migrate` will not apply the rest.
Every file is written to be idempotent, so re-running one is safe:

```bash
for f in migrations/*.sql; do psql -d "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

`npm run db:push` diffs `shared/schema.ts` against the database and is the usual
path during development. Note that `0004` deletes any pre-existing upload tokens:
they were stored in plaintext and cannot be converted to hashes without leaving
the original secrets usable. Outstanding contributor links must be reissued.

## 🚀 Development

The application serves both API and frontend from a single Express server using Vite middleware in development.

- Ensure you have Node.js 20+, PostgreSQL available, and required environment variables set (via `.env` or Railway).
- Optional checks: `npm run test:setup`, will see if everything is present to start dev server
  - With Railway env vars: `railway run npm run dev`
  - Manually: `npm run dev`
- Visit `http://localhost:3000` (falls back to `3002`, `3003`, ... if busy; `3001` is reserved for HTTPS).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.
