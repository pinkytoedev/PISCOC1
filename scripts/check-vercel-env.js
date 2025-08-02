#!/usr/bin/env node

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Check if we should load from .env file
const loadFromEnv = process.argv.includes('--local');

if (loadFromEnv && existsSync(join(process.cwd(), '.env'))) {
    config();
    console.log('📁 Loading environment variables from .env file\n');
} else if (loadFromEnv) {
    console.error('❌ .env file not found!\n');
    process.exit(1);
} else {
    console.log('🔍 Checking current shell environment variables');
    console.log('   (Use --local flag to check .env file instead)\n');
}

const requiredEnvVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'IMGBB_API_KEY',
    'NODE_ENV',
    'FRONTEND_URL',
];

const optionalEnvVars = [
    'BASE_URL',
    'WEBHOOK_URL',
    'WEBHOOK_VERIFY_TOKEN',
];

console.log('Checking environment variables for Vercel deployment...\n');

let missingRequired = [];
let presentOptional = [];

// Check required vars
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        missingRequired.push(varName);
        console.log(`❌ ${varName} - MISSING (Required)`);
    } else {
        console.log(`✅ ${varName} - Set`);
    }
});

console.log('\n--- Optional Variables ---\n');

// Check optional vars
optionalEnvVars.forEach(varName => {
    if (process.env[varName]) {
        presentOptional.push(varName);
        console.log(`✅ ${varName} - Set`);
    } else {
        console.log(`⚠️  ${varName} - Not set (Optional)`);
    }
});

console.log('\n--- Summary ---\n');

if (missingRequired.length > 0) {
    console.error(`❌ Missing ${missingRequired.length} required environment variables:`);
    missingRequired.forEach(v => console.error(`   - ${v}`));

    if (!loadFromEnv) {
        console.error('\n📝 These environment variables need to be set in Vercel:');
        console.error('   1. Go to your Vercel project dashboard');
        console.error('   2. Click on "Settings" tab');
        console.error('   3. Click on "Environment Variables" in the sidebar');
        console.error('   4. Add each missing variable with its value from your .env file');
        console.error('\n💡 Tip: Run "npm run vercel:check -- --local" to verify your .env file has all values');
    } else {
        console.error('\n⚠️  Your .env file is missing these required variables.');
        console.error('   Please add them to your .env file.');
    }

    process.exit(1);
} else {
    console.log('✅ All required environment variables are set!');
    console.log(`✅ ${presentOptional.length} optional variables are set.`);

    if (loadFromEnv) {
        console.log('\n📋 Next steps:');
        console.log('   1. Copy these values to your Vercel project settings');
        console.log('   2. Go to: https://vercel.com/[your-username]/[your-project]/settings/environment-variables');
        console.log('   3. Add each variable one by one');
        console.log('\n💡 Pro tip: You can use the Vercel CLI to set them automatically:');
        console.log('   vercel env add <variable-name> production');
    } else {
        console.log('\n🚀 Ready for Vercel deployment!');
    }
}