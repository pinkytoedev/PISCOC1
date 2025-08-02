#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧪 Testing Neon Database Connection');
console.log('===================================');

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

const databaseUrl = dbUrlMatch[1].trim();

if (!databaseUrl.includes('neon.tech')) {
    console.log('⚠️  Current DATABASE_URL does not appear to be a Neon database');
    console.log(`Current URL: ${databaseUrl}`);
}

console.log('Testing connection...');

try {
    // Test basic connection
    console.log('1. Testing basic connection...');
    execSync(`psql "${databaseUrl}" -c "SELECT version();"`, { stdio: 'pipe' });
    console.log('✅ Basic connection successful');

    // Test table count
    console.log('2. Checking tables...');
    const tableResult = execSync(`psql "${databaseUrl}" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" -t`, { encoding: 'utf8' });
    const tableCount = parseInt(tableResult.trim());
    console.log(`✅ Found ${tableCount} tables`);

    // Test sample data
    console.log('3. Testing sample queries...');

    try {
        const userResult = execSync(`psql "${databaseUrl}" -c "SELECT COUNT(*) FROM users;" -t`, { encoding: 'utf8' });
        const userCount = parseInt(userResult.trim());
        console.log(`✅ Users table: ${userCount} records`);
    } catch (error) {
        console.log('⚠️  Users table not found or empty');
    }

    try {
        const articleResult = execSync(`psql "${databaseUrl}" -c "SELECT COUNT(*) FROM articles;" -t`, { encoding: 'utf8' });
        const articleCount = parseInt(articleResult.trim());
        console.log(`✅ Articles table: ${articleCount} records`);
    } catch (error) {
        console.log('⚠️  Articles table not found or empty');
    }

    console.log('');
    console.log('🎉 All tests passed! Your Neon database is ready.');
    console.log('');
    console.log('💡 You can now:');
    console.log('- Start your application: npm run dev');
    console.log('- Access Neon Console: https://console.neon.tech/');
    console.log('- Monitor database performance and usage');

} catch (error) {
    console.log('❌ Connection test failed');
    console.log('');
    console.log('Possible issues:');
    console.log('1. Invalid connection string');
    console.log('2. Database not accessible');
    console.log('3. SSL certificate issues');
    console.log('');
    console.log('Error details:', error.message);
    console.log('');
    console.log('💡 Try:');
    console.log('1. Double-check your Neon connection string');
    console.log('2. Ensure you have psql installed');
    console.log('3. Check your internet connection');
}