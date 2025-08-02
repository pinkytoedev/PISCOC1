#!/usr/bin/env node

/**
 * Setup Testing Script for PISCOC Development Environment
 * This script checks all prerequisites and helps developers set up their local environment
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import net from 'net';
import * as dotenv from 'dotenv';

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
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
    header: (msg) => console.log(`\n${colors.bright}${colors.blue}${msg}${colors.reset}\n${'='.repeat(msg.length)}`)
};

let totalErrors = 0;
let totalWarnings = 0;

// Check Node.js version
function checkNodeVersion() {
    log.header('Checking Node.js Version');

    try {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

        if (majorVersion >= 20) {
            log.success(`Node.js version ${nodeVersion} (required: 20+)`);
        } else {
            log.error(`Node.js version ${nodeVersion} is too old. Please install Node.js 20 or higher.`);
            log.info('Visit https://nodejs.org to download the latest version.');
            totalErrors++;
        }
    } catch (error) {
        log.error('Could not determine Node.js version');
        totalErrors++;
    }
}

// Check npm installation
function checkNpm() {
    log.header('Checking npm Installation');

    try {
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        log.success(`npm version ${npmVersion}`);
    } catch (error) {
        log.error('npm is not installed or not in PATH');
        totalErrors++;
    }
}

// Check PostgreSQL installation
function checkPostgreSQL() {
    log.header('Checking PostgreSQL Installation');

    try {
        const pgVersion = execSync('psql --version', { encoding: 'utf8' }).trim();
        log.success(`PostgreSQL detected: ${pgVersion}`);

        // Extract version number
        const versionMatch = pgVersion.match(/(\d+)\.(\d+)/);
        if (versionMatch) {
            const majorVersion = parseInt(versionMatch[1]);
            if (majorVersion < 16) {
                log.warning(`PostgreSQL ${majorVersion} detected. Version 16+ is recommended.`);
                totalWarnings++;
            }
        }
    } catch (error) {
        log.warning('PostgreSQL client tools not found in PATH');
        log.info('Make sure PostgreSQL is installed and psql is in your PATH');
        log.info('You can also use Docker Compose to run PostgreSQL');
        totalWarnings++;
    }
}

// Check port availability
async function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(true);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
}

async function checkPorts() {
    log.header('Checking Port Availability');

    const ports = [
        { port: 3000, description: 'Main application port' },
        { port: 3001, description: 'HTTPS development port' },
        { port: 5432, description: 'PostgreSQL default port' }
    ];

    for (const { port, description } of ports) {
        const isAvailable = await checkPort(port);
        if (isAvailable) {
            log.success(`Port ${port} is available (${description})`);
        } else {
            log.warning(`Port ${port} is in use (${description})`);
            if (port === 3000 || port === 3001) {
                log.info('The application will try alternative ports if needed');
            }
            totalWarnings++;
        }
    }
}

// Check dependencies
function checkDependencies() {
    log.header('Checking npm Dependencies');

    const packageJsonPath = join(rootDir, 'package.json');
    const nodeModulesPath = join(rootDir, 'node_modules');

    if (!existsSync(packageJsonPath)) {
        log.error('package.json not found');
        totalErrors++;
        return;
    }

    if (!existsSync(nodeModulesPath)) {
        log.error('node_modules directory not found');
        log.info('Run "npm install" to install dependencies');
        totalErrors++;
        return;
    }

    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        const requiredDeps = Object.keys(packageJson.dependencies || {});

        log.success(`Found ${requiredDeps.length} dependencies in package.json`);

        // Check for a few critical dependencies
        const criticalDeps = ['express', 'drizzle-orm', 'react', 'dotenv'];
        for (const dep of criticalDeps) {
            const depPath = join(nodeModulesPath, dep);
            if (existsSync(depPath)) {
                log.success(`Critical dependency '${dep}' is installed`);
            } else {
                log.error(`Critical dependency '${dep}' is missing`);
                totalErrors++;
            }
        }
    } catch (error) {
        log.error(`Error reading package.json: ${error.message}`);
        totalErrors++;
    }
}

// Check environment variables
function checkEnvironmentVariables() {
    log.header('Checking Environment Variables');

    const envPath = join(rootDir, '.env');
    const envExamplePath = join(rootDir, '.env.example');

    if (!existsSync(envPath)) {
        log.error('.env file not found');
        log.info('Copy .env.example to .env and fill in your values');
        totalErrors++;
        return;
    }

    if (!existsSync(envExamplePath)) {
        log.warning('.env.example file not found');
        totalWarnings++;
    }

    // Load environment variables
    dotenv.config({ path: envPath });

    // Required environment variables
    const requiredVars = [
        { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
        { name: 'SESSION_SECRET', description: 'Session encryption secret' },
        { name: 'DISCORD_BOT_TOKEN', description: 'Discord bot authentication' },
        { name: 'DISCORD_CLIENT_ID', description: 'Discord application ID' },
        { name: 'AIRTABLE_API_KEY', description: 'Airtable API authentication' },
        { name: 'AIRTABLE_BASE_ID', description: 'Airtable base identifier' },
        { name: 'FACEBOOK_APP_ID', description: 'Facebook app ID for Instagram' },
        { name: 'FACEBOOK_APP_SECRET', description: 'Facebook app secret' }
    ];

    let missingRequired = 0;
    for (const { name, description } of requiredVars) {
        if (process.env[name]) {
            log.success(`${name} is set (${description})`);
        } else {
            log.error(`${name} is missing (${description})`);
            missingRequired++;
        }
    }

    if (missingRequired > 0) {
        totalErrors++;
        log.info(`Missing ${missingRequired} required environment variables`);
    }

    // Optional environment variables
    const optionalVars = [
        'IMGBB_API_KEY',
        'INSTAGRAM_ACCESS_TOKEN',
        'INSTAGRAM_ACCOUNT_ID',
        'BASE_URL'
    ];

    let missingOptional = 0;
    for (const varName of optionalVars) {
        if (!process.env[varName]) {
            missingOptional++;
        }
    }

    if (missingOptional > 0) {
        log.warning(`${missingOptional} optional environment variables are not set`);
        totalWarnings++;
    }
}

// Check database connection
async function checkDatabaseConnection() {
    log.header('Checking Database Connection');

    if (!process.env.DATABASE_URL) {
        log.error('DATABASE_URL not set, skipping database connection test');
        return;
    }

    try {
        const pg = await import('pg');
        const pool = new pg.default.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false
        });

        await pool.query('SELECT 1');
        await pool.end();

        log.success('Successfully connected to PostgreSQL database');
    } catch (error) {
        log.error(`Failed to connect to database: ${error.message}`);
        log.info('Make sure PostgreSQL is running and DATABASE_URL is correct');
        totalErrors++;
    }
}

// Check file permissions
function checkFilePermissions() {
    log.header('Checking File Permissions');

    const dirsToCheck = [
        'uploads',
        'temp',
        'certs',
        'uploads/instagram'
    ];

    for (const dir of dirsToCheck) {
        const dirPath = join(rootDir, dir);
        if (!existsSync(dirPath)) {
            log.warning(`Directory '${dir}' does not exist`);
            log.info(`Creating directory: ${dir}`);
            try {
                execSync(`mkdir -p "${dirPath}"`, { cwd: rootDir });
                log.success(`Created directory: ${dir}`);
            } catch (error) {
                log.error(`Failed to create directory '${dir}': ${error.message}`);
                totalErrors++;
            }
        } else {
            try {
                // Try to write a test file
                const testFile = join(dirPath, '.test-write');
                execSync(`touch "${testFile}" && rm "${testFile}"`);
                log.success(`Directory '${dir}' is writable`);
            } catch (error) {
                log.error(`Directory '${dir}' is not writable`);
                totalErrors++;
            }
        }
    }
}

// Main test runner
async function runTests() {
    console.log(colors.bright + colors.cyan + '\n🔍 PISCOC Development Environment Test\n' + colors.reset);

    checkNodeVersion();
    checkNpm();
    checkPostgreSQL();
    await checkPorts();
    checkDependencies();
    checkEnvironmentVariables();
    await checkDatabaseConnection();
    checkFilePermissions();

    // Summary
    log.header('Test Summary');

    if (totalErrors === 0 && totalWarnings === 0) {
        console.log(colors.green + colors.bright + '\n✨ All checks passed! Your environment is ready.\n' + colors.reset);
        console.log('Run "npm run dev" to start the development server.\n');
    } else {
        if (totalErrors > 0) {
            console.log(colors.red + `\n❌ Found ${totalErrors} error(s) that must be fixed.\n` + colors.reset);
        }
        if (totalWarnings > 0) {
            console.log(colors.yellow + `⚠️  Found ${totalWarnings} warning(s) that should be reviewed.\n` + colors.reset);
        }

        console.log('Please fix the issues above before running the application.\n');
        process.exit(totalErrors > 0 ? 1 : 0);
    }
}

// Run the tests
runTests().catch(error => {
    console.error(colors.red + `\n❌ Test script failed: ${error.message}\n` + colors.reset);
    process.exit(1);
});