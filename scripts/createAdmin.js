/**
 * Creates the initial admin user, reading its credentials from an Airtable
 * record.
 *
 * BROKEN — this file does not run at all. Verified with `node --check`.
 *
 *  1. `fetchAdminCredentialsFromAirtable` is declared twice below. package.json
 *     sets "type": "module", so this loads as ESM, where every module is strict
 *     and a duplicate top-level declaration is an EARLY error:
 *
 *       SyntaxError: Identifier 'fetchAdminCredentialsFromAirtable'
 *                    has already been declared
 *
 *     The module never evaluates. Nothing connects, and the `DELETE FROM users`
 *     further down is unreachable — so the file is inert rather than dangerous.
 *     The two definitions also expect different environment variables.
 *  2. Behind that, the INSERT is missing a comma between its two argument
 *     arrays, so JS parses `[...][...]` as an index expression and
 *     `client.query` would receive `undefined` for its parameters. Fixing (1)
 *     alone therefore still leaves a script that cannot insert a user.
 *
 * It is also not wired to any npm script, and the INSERT hard-codes the
 * username 'admin' rather than using the one it just fetched.
 *
 * See the README for the manual SQL that does work.
 *
 * Needs: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, ADMIN_CREDENTIALS_RECORD_ID,
 * DATABASE_URL. Optional: ADMIN_CREDENTIALS_TABLE (default 'AdminCredentials'),
 * ADMIN_CREDENTIALS_USERNAME_FIELD (default 'Username'),
 * ADMIN_CREDENTIALS_PASSWORD_FIELD (default 'Password').
 */

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
