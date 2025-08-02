# 🚀 PISCOC1 Local Setup Checklist

This checklist ensures you can successfully run PISCOC1 locally without issues.

## ✅ Pre-Requirements Checklist

### System Requirements
- [ ] **Node.js 20+** installed (`node --version`)
- [ ] **npm** installed (`npm --version`)
- [ ] **Git** installed (`git --version`)
- [ ] **Docker** installed (optional, but recommended) (`docker --version`)

### Quick Setup (5 minutes)
- [ ] Clone repository: `git clone <repository-url> && cd PISCOC1`
- [ ] Install dependencies: `npm install`
- [ ] Run setup wizard: `npm run setup:env`
- [ ] Test setup: `npm run test:setup`
- [ ] Start application: `npm run dev`
- [ ] Visit: `http://localhost:3000`

## 📋 Detailed Setup Verification

### 1. Environment Setup
- [ ] `.env` file exists (copy from `.env.example`)
- [ ] `DATABASE_URL` configured
- [ ] `SESSION_SECRET` generated (32+ random characters)
- [ ] API keys added (optional, but recommended for full functionality)

### 2. Database Setup
Choose one option:

#### Option A: Docker PostgreSQL (Recommended)
- [ ] Docker installed and running
- [ ] Run: `npm run docker:db`
- [ ] Run: `npm run db:setup`
- [ ] DATABASE_URL: `postgresql://piscoc1_user:piscoc1_password@localhost:5432/multi_platform_integration?sslmode=disable`

#### Option B: Local PostgreSQL
- [ ] PostgreSQL 16+ installed
- [ ] Database created: `createdb multi_platform_integration`
- [ ] Run: `npm run db:setup`
- [ ] DATABASE_URL: `postgresql://username:password@localhost:5432/multi_platform_integration?sslmode=disable`

#### Option C: Neon.tech Cloud
- [ ] Neon account created
- [ ] Project created and connection string copied
- [ ] Run: `npm run db:push`
- [ ] DATABASE_URL: `postgresql://username:password@ep-xxx.neon.tech/database_name?sslmode=require`

### 3. Application Testing
- [ ] Environment test passes: `npm run test:setup`
- [ ] TypeScript compiles: `npm run check`
- [ ] Application builds: `npm run build`
- [ ] Development server starts: `npm run dev`
- [ ] Application responds: Visit `http://localhost:3000`

### 4. API Integrations (Optional)
Visit `/keys` page in the running application to configure:

#### Discord Integration
- [ ] Bot created at https://discord.com/developers/applications
- [ ] `DISCORD_BOT_TOKEN` added to `.env`
- [ ] `DISCORD_CLIENT_ID` added to `.env`

#### Airtable Integration
- [ ] API token created at https://airtable.com/create/tokens
- [ ] `AIRTABLE_API_KEY` added to `.env`
- [ ] `AIRTABLE_BASE_ID` added to `.env`

#### Facebook/Instagram Integration
- [ ] App created at https://developers.facebook.com/
- [ ] `FACEBOOK_APP_ID` added to `.env`
- [ ] `FACEBOOK_APP_SECRET` added to `.env`
- [ ] HTTPS setup for testing: `npm run dev:https`

#### ImgBB Integration
- [ ] API key obtained from https://api.imgbb.com/
- [ ] `IMGBB_API_KEY` added to `.env`

## 🔧 Common Issue Solutions

### Database Connection Issues
```bash
# Check connection
npm run test:setup

# Reset Docker database
npm run docker:db:stop && npm run docker:db && npm run db:setup

# Test Neon connection
npm run test:neon
```

### Environment Issues
```bash
# Reset environment
rm .env && npm run setup:env

# Generate new session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Port Conflicts
```bash
# Kill processes on port 3000
lsof -ti:3000 | xargs kill

# Use Docker (different ports)
npm run docker:full
```

### Permission Issues
```bash
# Create required directories
mkdir -p uploads temp certs uploads/instagram

# Fix permissions (Linux/Mac)
chmod -R 755 uploads temp certs
```

## 🎯 Success Indicators

When everything is working correctly, you should see:

1. **Setup Test**: All green checkmarks from `npm run test:setup`
2. **Server Start**: No errors in console when running `npm run dev`
3. **Database**: Connection successful (no "relation does not exist" errors)
4. **Application**: Login page loads at `http://localhost:3000`
5. **API Keys**: Status page at `/keys` shows integration statuses

## 📞 Getting Help

If you encounter issues:

1. **Check logs**: Look for specific error messages in console
2. **Run diagnostics**: `npm run test:setup` 
3. **Reset everything**: 
   ```bash
   git clean -fdx
   npm install
   npm run setup:env
   npm run test:setup
   npm run dev
   ```
4. **Check this repository's issues** for similar problems
5. **Create a new issue** with:
   - Your operating system
   - Node.js version (`node --version`)
   - Error messages
   - Output from `npm run test:setup`

## 🏁 Quick Commands Reference

```bash
# Complete setup from scratch
git clone <repo> && cd PISCOC1 && npm install && npm run setup:env

# Start development
npm run dev

# Test everything
npm run test:setup

# Database management
npm run docker:db          # Start PostgreSQL container
npm run db:setup           # Setup database schema
npm run db:push            # Push schema to cloud DB

# Troubleshooting
npm run test:setup         # Check environment
npm run test:neon          # Test database connection
npm run check              # TypeScript check
npm run build              # Test build process
```