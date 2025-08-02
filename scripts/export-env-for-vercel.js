#!/usr/bin/env node

import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load .env file
if (!existsSync(join(process.cwd(), '.env'))) {
    console.error('❌ .env file not found!');
    process.exit(1);
}

config();

console.log('📋 Environment Variables for Vercel Dashboard\n');
console.log('Copy each of these to your Vercel project settings:\n');
console.log('='.repeat(60));

const requiredVars = [
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

requiredVars.forEach(varName => {
    const value = process.env[varName];

    if (!value) {
        console.log(`\n❌ ${varName}`);
        console.log('   Value: NOT SET - Add this to your .env file first!');
    } else if (value.includes('your_') && value.includes('_here')) {
        console.log(`\n⚠️  ${varName}`);
        console.log('   Value: PLACEHOLDER - Update with real value!');
        console.log(`   Current: ${value}`);
    } else {
        console.log(`\n✅ ${varName}`);
        console.log(`   Value: ${value.substring(0, 10)}...${value.length > 10 ? '(truncated for security)' : ''}`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('\n🔗 Quick link to Vercel Environment Variables:');
console.log('   https://vercel.com/dashboard/[your-project]/settings/environment-variables\n');

// Check for production values
console.log('⚠️  Important reminders:');
console.log('   - Update NODE_ENV to "production" in Vercel');
console.log('   - Update FRONTEND_URL to your actual Vercel URL');
console.log('   - Update DISCORD_CLIENT_SECRET with your actual secret');
console.log('   - Consider using different API keys for production\n');