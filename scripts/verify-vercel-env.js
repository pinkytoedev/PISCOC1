#!/usr/bin/env node

// Script to verify Vercel environment variables match requirements
import { execSync } from 'child_process';

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

console.log('🔍 Verifying Vercel environment variables...\n');

try {
    // Get list of env vars from Vercel
    const output = execSync('npx vercel env ls production', { encoding: 'utf8' });

    // Parse the output to extract variable names
    const lines = output.split('\n');
    const vercelVars = new Set();

    // Skip header lines and parse variable names
    lines.forEach(line => {
        const match = line.match(/^\s*(\S+)\s+Encrypted/);
        if (match) {
            vercelVars.add(match[1]);
        }
    });

    console.log(`Found ${vercelVars.size} variables in Vercel\n`);

    // Check each required variable
    let missing = [];
    let found = [];

    requiredVars.forEach(varName => {
        if (vercelVars.has(varName)) {
            found.push(varName);
            console.log(`✅ ${varName}`);
        } else {
            missing.push(varName);
            console.log(`❌ ${varName} - MISSING`);
        }
    });

    console.log('\n--- Summary ---\n');

    if (missing.length === 0) {
        console.log('✅ All required environment variables are set in Vercel!');
        console.log('\n🚀 Your app should now work correctly on Vercel!');
        console.log('\n📝 Important Notes:');
        console.log('1. Make sure DISCORD_CLIENT_SECRET has the actual value (not placeholder)');
        console.log('2. FRONTEND_URL is set to: https://piscoc-1.vercel.app');
        console.log('3. NODE_ENV is set to: production');
        console.log('\n🔗 Deploy with: npx vercel --prod');
    } else {
        console.log(`❌ Missing ${missing.length} required variables:`);
        missing.forEach(v => console.log(`   - ${v}`));

        if (missing.includes('DISCORD_CLIENT_SECRET')) {
            console.log('\n⚠️  DISCORD_CLIENT_SECRET is missing!');
            console.log('   You need to get this from your Discord application:');
            console.log('   1. Go to https://discord.com/developers/applications');
            console.log('   2. Select your application');
            console.log('   3. Go to OAuth2 → General');
            console.log('   4. Copy the Client Secret');
            console.log('   5. Add it with: echo "YOUR_SECRET" | npx vercel env add DISCORD_CLIENT_SECRET production');
        }
    }

} catch (error) {
    console.error('Error checking Vercel environment:', error.message);
    process.exit(1);
}