import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Set default test environment variables if not provided
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

// Mock external APIs for testing if not configured
if (!process.env.DISCORD_BOT_TOKEN) {
  process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
}
if (!process.env.AIRTABLE_API_KEY) {
  process.env.AIRTABLE_API_KEY = 'test-airtable-key';
}
if (!process.env.IMGUR_CLIENT_ID) {
  process.env.IMGUR_CLIENT_ID = 'test-imgur-client';
}

console.log('Test setup complete');