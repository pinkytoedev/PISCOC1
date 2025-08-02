#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

console.log('🚀 Neon Database Setup Script');
console.log('=====================================');
console.log('');

async function main() {
    try {
        console.log('This script will help you:');
        console.log('1. Update your .env with Neon database URL');
        console.log('2. Import your existing data to Neon');
        console.log('3. Test the connection');
        console.log('');

        // Get Neon connection string
        const neonUrl = await askQuestion('Enter your Neon database connection string: ');

        if (!neonUrl || !neonUrl.includes('neon.tech')) {
            console.log('❌ Invalid Neon URL. Please make sure you copied the full connection string.');
            process.exit(1);
        }

        console.log('');
        console.log('📁 Updating .env file...');

        // Update .env file
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('DATABASE_URL=')) {
                envContent = envContent.replace(/DATABASE_URL=.+/, `DATABASE_URL=${neonUrl}`);
            } else {
                envContent += `\nDATABASE_URL=${neonUrl}\n`;
            }
        } else {
            envContent = `DATABASE_URL=${neonUrl}\n`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log('✅ .env file updated');

        // Check if backup exists
        const backupPath = path.join(process.cwd(), 'piscoc_backup.sql');
        if (!fs.existsSync(backupPath)) {
            console.log('⚠️  Backup file not found. Creating backup first...');

            try {
                execSync('pg_dump P.I.S.C.O.C.1 > piscoc_backup.sql', { stdio: 'inherit' });
                console.log('✅ Backup created');
            } catch (error) {
                console.log('❌ Failed to create backup. Please ensure your local database is running.');
                process.exit(1);
            }
        }

        // Import data to Neon
        console.log('');
        const shouldImport = await askQuestion('Import your existing data to Neon? (y/n): ');

        if (shouldImport.toLowerCase() === 'y' || shouldImport.toLowerCase() === 'yes') {
            console.log('📤 Importing data to Neon...');
            console.log('This may take a few minutes...');

            try {
                execSync(`psql "${neonUrl}" < piscoc_backup.sql`, { stdio: 'inherit' });
                console.log('✅ Data imported successfully!');
            } catch (error) {
                console.log('❌ Failed to import data. Error details above.');
                console.log('💡 You can try importing manually with:');
                console.log(`   psql "${neonUrl}" < piscoc_backup.sql`);
            }
        }

        // Test connection
        console.log('');
        console.log('🧪 Testing connection...');

        try {
            execSync(`psql "${neonUrl}" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"`, { stdio: 'inherit' });
            console.log('✅ Connection test successful!');
        } catch (error) {
            console.log('❌ Connection test failed. Please check your Neon URL.');
        }

        console.log('');
        console.log('🎉 Neon setup complete!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Restart your application: npm run dev');
        console.log('2. Test all functionality');
        console.log('3. Update your production deployment with the new DATABASE_URL');
        console.log('');
        console.log('🔒 Security notes:');
        console.log('- Your Neon database includes SSL by default');
        console.log('- The connection string contains your password - keep it secure');
        console.log('- You can manage your database at: https://console.neon.tech/');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();