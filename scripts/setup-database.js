#!/usr/bin/env node

/**
 * Manual Database Setup Script for Local Development
 * This script sets up the database schema when SSL connection issues prevent drizzle-kit from working
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🗄️  Manual Database Setup');
console.log('===========================');

// Read DATABASE_URL from .env
const envPath = path.join(process.cwd(), '.env');

if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);

if (!dbUrlMatch) {
    console.log('❌ DATABASE_URL not found in .env file');
    process.exit(1);
}

let databaseUrl = dbUrlMatch[1].trim();

// Remove SSL mode for local development
if (databaseUrl.includes('sslmode=require')) {
    databaseUrl = databaseUrl.replace('sslmode=require', 'sslmode=disable');
    console.log('🔧 Modified connection string for local development (disabled SSL)');
}

console.log('📝 Creating database schema...');

// SQL for creating the basic tables needed for the application
const schemaSQL = `
-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    last_login TIMESTAMP
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    bio TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_type TEXT NOT NULL DEFAULT 'url',
    image_path TEXT,
    external_id TEXT
);

-- Create articles table
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    excerpt TEXT,
    content TEXT,
    content_format TEXT NOT NULL DEFAULT 'plaintext',
    image_url TEXT NOT NULL,
    image_type TEXT NOT NULL DEFAULT 'url',
    image_path TEXT,
    instagram_image_url TEXT,
    featured TEXT NOT NULL DEFAULT 'no',
    published_at TIMESTAMP,
    date TEXT,
    scheduled TEXT,
    finished BOOLEAN DEFAULT false,
    author TEXT NOT NULL,
    photo TEXT,
    photo_credit TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hashtags TEXT,
    external_id TEXT,
    source TEXT DEFAULT 'manual'
);

-- Create carousel_quotes table
CREATE TABLE IF NOT EXISTS carousel_quotes (
    id SERIAL PRIMARY KEY,
    carousel TEXT NOT NULL,
    quote TEXT NOT NULL,
    main TEXT,
    philo TEXT,
    external_id TEXT
);

-- Create image_assets table
CREATE TABLE IF NOT EXISTS image_assets (
    id SERIAL PRIMARY KEY,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    hash TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Create integration_settings table
CREATE TABLE IF NOT EXISTS integration_settings (
    id SERIAL PRIMARY KEY,
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true
);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSONB
);

-- Create sessions table (for express-session with connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;

-- Create index for session cleanup
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- Create useful indexes
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_settings_service ON integration_settings(service);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);

-- Print success message
SELECT 'Database schema created successfully!' as message;
`;

try {
    // Write SQL to temporary file
    const tempSQLFile = '/tmp/schema.sql';
    fs.writeFileSync(tempSQLFile, schemaSQL);
    
    // Execute SQL using psql
    console.log('🔄 Executing schema creation...');
    execSync(`psql "${databaseUrl}" -f "${tempSQLFile}"`, { stdio: 'inherit' });
    
    // Clean up temp file
    fs.unlinkSync(tempSQLFile);
    
    console.log('✅ Database schema created successfully!');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Run: npm run dev (to start the application)');
    console.log('2. Visit: http://localhost:3000');
    console.log('3. The application will create default admin user on first run');
    
} catch (error) {
    console.log('❌ Failed to create database schema');
    console.log('');
    console.log('Error details:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('1. Make sure PostgreSQL container is running: npm run docker:db');
    console.log('2. Check if psql is installed and in PATH');
    console.log('3. Verify DATABASE_URL is correct in .env file');
    process.exit(1);
}