#!/usr/bin/env node

/**
 * Environment Setup Helper for PISCOC1
 * This script helps users configure their environment for local development
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
    header: (msg) => console.log(`\n${colors.bright}${colors.blue}${msg}${colors.reset}\n${'='.repeat(msg.length)}`),
    step: (num, msg) => console.log(`\n${colors.bright}${colors.magenta}Step ${num}:${colors.reset} ${msg}`)
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setupEnvironment() {
    console.log(colors.bright + colors.cyan + '\n🛠️  PISCOC1 Environment Setup Helper\n' + colors.reset);
    console.log('This script will help you set up your local development environment.\n');

    log.step(1, 'Environment File Setup');
    
    const envPath = join(rootDir, '.env');
    const envExamplePath = join(rootDir, '.env.example');

    if (existsSync(envPath)) {
        const overwrite = await question('🤔 .env file already exists. Do you want to overwrite it? (y/N): ');
        if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
            log.info('Keeping existing .env file. You can manually update it later.');
        } else {
            copyFileSync(envExamplePath, envPath);
            log.success('Created new .env file from template');
        }
    } else {
        copyFileSync(envExamplePath, envPath);
        log.success('Created .env file from template');
    }

    log.step(2, 'Database Setup Choice');
    console.log('Choose your database setup option:');
    console.log('1. 🐳 Docker PostgreSQL (Recommended - easiest setup)');
    console.log('2. 🔧 Local PostgreSQL (Manual installation required)');
    console.log('3. ☁️  Neon.tech Cloud PostgreSQL (Free tier available)');
    console.log('4. ⏭️  Skip database setup (configure manually later)');

    const dbChoice = await question('\nEnter your choice (1-4): ');

    switch (dbChoice) {
        case '1':
            await setupDockerPostgreSQL();
            break;
        case '2':
            await setupLocalPostgreSQL();
            break;
        case '3':
            await setupNeonPostgreSQL();
            break;
        case '4':
            log.info('Skipping database setup. Remember to configure DATABASE_URL in .env');
            break;
        default:
            log.warning('Invalid choice. Skipping database setup.');
    }

    log.step(3, 'Session Secret Generation');
    await generateSessionSecret();

    log.step(4, 'API Keys Information');
    await showAPIKeyInfo();

    log.step(5, 'Final Setup');
    await finalSetup();

    rl.close();
}

async function setupDockerPostgreSQL() {
    log.info('Setting up Docker PostgreSQL...');
    
    try {
        execSync('docker --version', { stdio: 'pipe' });
        log.success('Docker is installed');
    } catch (error) {
        log.error('Docker is not installed or not in PATH');
        log.info('Please install Docker from https://docker.com/get-started');
        return;
    }

    try {
        execSync('docker compose version', { stdio: 'pipe' });
        log.success('Docker Compose is available');
    } catch (error) {
        log.error('Docker Compose is not available');
        return;
    }

    log.info('Starting PostgreSQL container...');
    try {
        execSync('docker compose -f docker-compose.db-only.yml up -d', { cwd: rootDir });
        log.success('PostgreSQL container started');
        
        // Wait a moment for the database to be ready
        log.info('Waiting for database to be ready...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Update .env file with Docker database URL
        updateEnvFile('DATABASE_URL', 'postgresql://piscoc1_user:piscoc1_password@localhost:5432/multi_platform_integration?sslmode=disable');
        log.success('Updated .env with Docker PostgreSQL connection');
        
    } catch (error) {
        log.error('Failed to start PostgreSQL container');
        log.info('You can try running: docker compose -f docker-compose.db-only.yml up -d');
    }
}

async function setupLocalPostgreSQL() {
    log.info('Setting up local PostgreSQL...');
    
    try {
        execSync('psql --version', { stdio: 'pipe' });
        log.success('PostgreSQL client tools found');
    } catch (error) {
        log.error('PostgreSQL client tools not found');
        log.info('Please install PostgreSQL from https://postgresql.org/download/');
        return;
    }

    console.log('\n📝 To set up local PostgreSQL:');
    console.log('1. Make sure PostgreSQL service is running');
    console.log('2. Create a database: createdb multi_platform_integration');
    console.log('3. Update the DATABASE_URL in .env with your credentials');
    console.log('\nExample DATABASE_URL for local PostgreSQL:');
    console.log('postgresql://your_username:your_password@localhost:5432/multi_platform_integration?sslmode=disable');
    
    const continueSetup = await question('\nHave you completed these steps? (y/N): ');
    if (continueSetup.toLowerCase() === 'y' || continueSetup.toLowerCase() === 'yes') {
        log.success('Local PostgreSQL setup marked as complete');
    }
}

async function setupNeonPostgreSQL() {
    log.info('Setting up Neon.tech PostgreSQL...');
    
    console.log('\n📝 To set up Neon.tech PostgreSQL:');
    console.log('1. Go to https://neon.tech and create a free account');
    console.log('2. Create a new project');
    console.log('3. Copy the connection string from the dashboard');
    console.log('4. The connection string should look like:');
    console.log('   postgresql://username:password@ep-example.neon.tech/database_name?sslmode=require');
    
    const neonUrl = await question('\nPaste your Neon connection string (or press Enter to skip): ');
    if (neonUrl && neonUrl.includes('neon.tech')) {
        updateEnvFile('DATABASE_URL', neonUrl);
        log.success('Updated .env with Neon PostgreSQL connection');
    } else if (neonUrl) {
        log.warning('Connection string doesn\'t look like a Neon URL. Please check it.');
    }
}

async function generateSessionSecret() {
    const envContent = readFileSync(join(rootDir, '.env'), 'utf8');
    
    if (envContent.includes('your_secure_random_session_secret_here') || 
        envContent.includes('generate_a_secure_random_string_here')) {
        
        const sessionSecret = crypto.randomBytes(32).toString('hex');
        updateEnvFile('SESSION_SECRET', sessionSecret);
        log.success('Generated secure session secret');
    } else {
        log.info('Session secret already configured');
    }
}

async function showAPIKeyInfo() {
    console.log('\n📋 API Keys Required for Full Functionality:');
    console.log('\n🔹 Discord Integration:');
    console.log('   • Visit: https://discord.com/developers/applications');
    console.log('   • Create a new application');
    console.log('   • Go to "Bot" section and create a bot');
    console.log('   • Copy Bot Token → DISCORD_BOT_TOKEN');
    console.log('   • Copy Application ID → DISCORD_CLIENT_ID');
    
    console.log('\n🔹 Airtable Integration:');
    console.log('   • Visit: https://airtable.com/create/tokens');
    console.log('   • Create a personal access token');
    console.log('   • Copy token → AIRTABLE_API_KEY');
    console.log('   • Get your base ID from the API documentation → AIRTABLE_BASE_ID');
    
    console.log('\n🔹 Facebook/Instagram Integration:');
    console.log('   • Visit: https://developers.facebook.com/');
    console.log('   • Create a new app');
    console.log('   • Add Instagram Basic Display product');
    console.log('   • Copy App ID → FACEBOOK_APP_ID');
    console.log('   • Copy App Secret → FACEBOOK_APP_SECRET');
    
    console.log('\n🔹 ImgBB Integration (Image hosting):');
    console.log('   • Visit: https://api.imgbb.com/');
    console.log('   • Create account and get API key');
    console.log('   • Copy API key → IMGBB_API_KEY');
    
    console.log('\n💡 You can run the application with placeholder keys, but some features won\'t work.');
    console.log('   Use the API Keys page (/keys) in the app to manage and test your integrations.');
}

async function finalSetup() {
    log.info('Creating necessary directories...');
    try {
        execSync('mkdir -p uploads temp certs uploads/instagram', { cwd: rootDir });
        log.success('Created upload directories');
    } catch (error) {
        log.warning('Could not create all directories');
    }

    console.log('\n🎉 Setup Complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Review your .env file and add your API keys');
    console.log('2. Run: npm run test:setup (to verify everything is working)');
    console.log('3. Run: npm run db:push (to set up database schema)'); 
    console.log('4. Run: npm run dev (to start the development server)');
    console.log('\n💡 Use the /keys page in the app to manage your API integrations');
    console.log('🐛 If you encounter issues, check the troubleshooting section in README.md');
}

function updateEnvFile(key, value) {
    const envPath = join(rootDir, '.env');
    let envContent = readFileSync(envPath, 'utf8');
    
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    
    writeFileSync(envPath, envContent);
}

// Run the setup
setupEnvironment().catch(error => {
    console.error(colors.red + `\n❌ Setup failed: ${error.message}\n` + colors.reset);
    process.exit(1);
});