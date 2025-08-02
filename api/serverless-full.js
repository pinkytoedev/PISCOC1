// Complete serverless app for Vercel with all dependencies included
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import crypto from 'crypto';

const app = express();
const PgSession = connectPgSimple(session);

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is required');
}

// Configure SSL for production
let sslConfig;
if (process.env.NODE_ENV === 'production') {
    if (connectionString?.includes('neon.tech') || connectionString?.includes('supabase')) {
        sslConfig = { rejectUnauthorized: false };
    } else {
        sslConfig = { rejectUnauthorized: false };
    }
} else {
    sslConfig = false;
}

const pgPool = new pg.Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: sslConfig
});

// Test database connection
pgPool.query('SELECT 1')
    .then(() => console.log('Database connected successfully'))
    .catch(err => {
        console.error('Database connection error:', err.message);
    });

const db = drizzle(pgPool);

// Configure CORS
const corsOptions = {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Trust proxy
app.set('trust proxy', 1);

// Session configuration with PostgreSQL store
const sessionConfig = {
    store: new PgSession({
        pool: pgPool,
        tableName: 'session',
        createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
    name: 'sessionId',
};

app.use(session(sessionConfig));

// Password hashing functions
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, hashedPassword) {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
    return hash === verifyHash;
}

// Simple user schema
const users = {
    id: 'id',
    username: 'username',
    password: 'password',
    isAdmin: 'is_admin',
    lastLogin: 'last_login'
};

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(
    async function(username, password, done) {
        try {
            const result = await db.execute(
                `SELECT id, username, password, is_admin as "isAdmin", last_login as "lastLogin" 
                 FROM users WHERE username = $1`,
                [username]
            );
            
            const user = result.rows[0];
            
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            
            const isValid = verifyPassword(password, user.password);
            
            if (!isValid) {
                return done(null, false, { message: 'Incorrect password.' });
            }
            
            // Update last login
            await db.execute(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [user.id]
            );
            
            return done(null, {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                lastLogin: user.lastLogin
            });
        } catch (error) {
            return done(error);
        }
    }
));

passport.serializeUser(function(user, done) {
    done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
    try {
        const result = await db.execute(
            `SELECT id, username, is_admin as "isAdmin", last_login as "lastLogin" 
             FROM users WHERE id = $1`,
            [id]
        );
        
        const user = result.rows[0];
        
        if (!user) {
            return done(new Error('User not found'));
        }
        
        done(null, {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            lastLogin: user.lastLogin
        });
    } catch (error) {
        done(error);
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Auth routes
app.post('/api/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ message: 'Internal server error during authentication' });
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        req.logIn(user, (err) => {
            if (err) {
                console.error('Session login error:', err);
                return res.status(500).json({ message: 'Failed to establish session' });
            }

            res.status(200).json({
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                lastLogin: user.lastLogin
            });
        });
    })(req, res, next);
});

app.post('/api/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ message: 'Failed to logout' });
        }
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

app.get('/api/me', (req, res) => {
    if (req.user) {
        res.json(req.user);
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

// Simple user check endpoint
app.get('/api/users', async (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    
    try {
        const result = await db.execute(
            'SELECT id, username, is_admin as "isAdmin", last_login as "lastLogin" FROM users'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Articles endpoints (simplified for now)
app.get('/api/articles', async (req, res) => {
    try {
        const result = await db.execute(
            'SELECT * FROM articles ORDER BY created_at DESC LIMIT 50'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Catch all
app.use((req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

export default app;