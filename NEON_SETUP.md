# 🚀 Neon Database Setup Guide

This guide will help you migrate from your local PostgreSQL database to Neon's serverless PostgreSQL.

## 📋 Prerequisites

- ✅ Existing local database backup (`piscoc_backup.sql` - already created)
- ✅ `psql` command line tool installed
- ⏳ Neon account and database (we'll create this)

## 🎯 Step-by-Step Setup

### **Step 1: Create Neon Account**

1. **Visit [Neon Console](https://console.neon.tech/)**
2. **Sign up** with GitHub, Google, or email
3. **Verify your email** if needed

### **Step 2: Create Your Database**

1. **Click "Create Project"**
2. **Configure your project**:
   ```
   Project Name: PISCOC-Production
   Database Name: piscoc_db
   Region: US East (N. Virginia) - or closest to your users
   PostgreSQL Version: 15 (recommended)
   ```
3. **Click "Create Project"**

### **Step 3: Get Connection Details**

After creation, you'll see a connection string like:
```
postgresql://username:password@ep-abc123.us-east-1.aws.neon.tech/piscoc_db?sslmode=require
```

**Important**: Copy this entire string - you'll need it for the next step.

### **Step 4: Run Migration Script**

Use our automated setup script:

```bash
node scripts/setup-neon.js
```

The script will:
- ✅ Ask for your Neon connection string
- ✅ Update your `.env` file
- ✅ Import your existing data
- ✅ Test the connection

### **Step 5: Test Your Setup**

```bash
node scripts/test-neon.js
```

This will verify:
- ✅ Database connection
- ✅ Table structure
- ✅ Data integrity

### **Step 6: Restart Your Application**

```bash
npm run dev
```

Your app should now be connected to Neon!

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Update Environment Variables

Create or update your `.env` file:
```bash
DATABASE_URL=postgresql://username:password@ep-abc123.us-east-1.aws.neon.tech/piscoc_db?sslmode=require
```

### 2. Import Your Data

```bash
psql "postgresql://username:password@ep-abc123.us-east-1.aws.neon.tech/piscoc_db?sslmode=require" < piscoc_backup.sql
```

### 3. Test Connection

```bash
psql "postgresql://username:password@ep-abc123.us-east-1.aws.neon.tech/piscoc_db?sslmode=require" -c "SELECT COUNT(*) FROM users;"
```

## 🌟 Neon Benefits

### **Development**
- ✅ **Serverless**: No server management
- ✅ **Autoscaling**: Scales to zero when not in use
- ✅ **Branching**: Create database branches like Git
- ✅ **Free Tier**: 512MB storage, 1 compute hour/month

### **Production**
- ✅ **High Availability**: Built-in redundancy
- ✅ **SSL by Default**: Secure connections
- ✅ **Point-in-time Recovery**: Restore to any moment
- ✅ **Connection Pooling**: Efficient connection management

### **Both**
- ✅ **Same Database**: Use one database for dev and prod
- ✅ **PostgreSQL Compatible**: Full PostgreSQL features
- ✅ **Fast Cold Starts**: < 1 second activation
- ✅ **Monitoring**: Built-in performance insights

## 🎛️ Neon Console Features

Access your database at [console.neon.tech](https://console.neon.tech):

- **SQL Editor**: Run queries directly in browser
- **Metrics**: Monitor CPU, memory, storage usage
- **Branching**: Create development branches
- **Settings**: Manage compute, storage, access
- **Logs**: View connection and query logs

## 🔒 Security Best Practices

### **Connection String Security**
- ✅ Store in `.env` file (never commit to Git)
- ✅ Use different databases for dev/staging/prod
- ✅ Rotate passwords periodically

### **Access Control**
- ✅ Use IP allowlists for production
- ✅ Monitor connection logs
- ✅ Enable point-in-time recovery

## 🚨 Troubleshooting

### **Connection Issues**
```bash
# Test basic connectivity
psql "your-neon-url" -c "SELECT 1;"

# Check SSL requirement
psql "your-neon-url-without-sslmode" -c "SELECT 1;"
```

### **Import Issues**
```bash
# Check backup file
head -20 piscoc_backup.sql

# Import with verbose output
psql "your-neon-url" < piscoc_backup.sql -v ON_ERROR_STOP=1
```

### **Application Issues**
```bash
# Verify .env file
cat .env | grep DATABASE_URL

# Test with your app
npm run dev
```

## 📞 Getting Help

### **Neon Support**
- [Neon Documentation](https://neon.tech/docs)
- [Neon Discord](https://discord.gg/92vNTzKDGp)
- [GitHub Issues](https://github.com/neondatabase/neon)

### **Common Solutions**
- **"SSL required"**: Ensure `?sslmode=require` in URL
- **"Connection timeout"**: Check firewall/network
- **"Authentication failed"**: Verify username/password
- **"Database not found"**: Confirm database name in URL

## 🎉 Success Checklist

- [ ] Neon account created
- [ ] Project and database created
- [ ] Connection string copied
- [ ] `.env` file updated
- [ ] Data imported successfully
- [ ] Connection test passed
- [ ] Application starts without errors
- [ ] All features working as expected

Welcome to Neon! Your database is now serverless and production-ready! 🚀