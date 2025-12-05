import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import pg from 'pg';

const { Client } = pg;
const scryptAsync = promisify(scrypt);

function getEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

async function fetchAdminCredentialsFromAirtable() {
  const apiKey = getEnvVar('AIRTABLE_API_KEY');
  const baseId = getEnvVar('AIRTABLE_BASE_ID');
  const tableName = process.env.ADMIN_CREDENTIALS_TABLE || 'AdminCredentials';
  const recordId = getEnvVar('ADMIN_CREDENTIALS_RECORD_ID');
  const usernameField = process.env.ADMIN_CREDENTIALS_USERNAME_FIELD || 'Username';
  const passwordField = process.env.ADMIN_CREDENTIALS_PASSWORD_FIELD || 'Password';

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch admin credentials from Airtable: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const username = data?.fields?.[usernameField];
  const password = data?.fields?.[passwordField];

  if (!username || !password) {
    throw new Error(
      `Airtable record ${recordId} is missing required fields: ${usernameField} and/or ${passwordField}`
    );
  }

  console.log(`Fetched admin username from Airtable: ${username}`);
  return { username, password };
}

async function setupAdminUser() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const { username, password } = await fetchAdminCredentialsFromAirtable();
    await client.connect();

    // Clear previous admin accounts
    await client.query('DELETE FROM users WHERE username = ANY($1)', [['admin', 'websitedev', username]]);

    // Create new admin
    const hashedPassword = await hashPassword(password);
    const result = await client.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [username, hashedPassword, true]
    );

    console.log('Admin user created with ID:', result.rows[0].id);
  } catch (err) {
    console.error('Error creating admin user:', err);
  } finally {
    await client.end();
  }
}

setupAdminUser();
