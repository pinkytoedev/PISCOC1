import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import pg from 'pg';

const { Client } = pg;
const scryptAsync = promisify(scrypt);

// retrieve environment variables and throw error when missing
function getEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

async function fetchAdminCredentialsFromAirtable() {
  const AIRTABLE_API_KEY = getEnvVar('AIRTABLE_API_KEY');
  const AIRTABLE_BASE_ID = getEnvVar('AIRTABLE_BASE_ID');
  const AIRTABLE_TABLE_NAME = getEnvVar('AIRTABLE_TABLE_NAME');

  const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from Airtable: ${response.statusText}`);
  } 

  const data = await response.json();
  if (data.records.length === 0) {
    throw new Error('No records found in Airtable table');
  }
  
  const record = data.records[0];
  const username = record.fields['username'];
  const password = record.fields['password'];
  if (!username || !password) {
    throw new Error('Username or password field is missing in Airtable record');
  }
  
  return { username, password };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
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
      ['admin', hashedPassword, true]
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