import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import pg from 'pg';

const { Client } = pg;
const scryptAsync = promisify(scrypt);

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
    await client.connect();
    
    // Clear previous admin
    await client.query('DELETE FROM users WHERE username = $1', ['admin']);
    
    // Create new admin
    const hashedPassword = await hashPassword('admin123');
    const result = await client.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id',
      ['admin', hashedPassword, true]
    );
    
    console.log('Admin user created with ID:', result.rows[0].id);
  } catch (err) {
    console.error('Error creating admin user:', err);
  } finally {
    await client.end();
  }
}

setupAdminUser();