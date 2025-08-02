// Standalone server for Vercel - no build dependencies
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Trust proxy
app.set('trust proxy', 1);

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is required');
}

// Parse connection string to handle different database providers
let sslConfig;
if (process.env.NODE_ENV === 'production') {
    // Different SSL configs for different providers
    if (connectionString.includes('neon.tech')) {
        // Neon requires SSL
        sslConfig = { rejectUnauthorized: false };
    } else if (connectionString.includes('supabase')) {
        // Supabase requires SSL
        sslConfig = { rejectUnauthorized: false };
    } else {
        // Generic production SSL
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

// Test database connection with better error handling
pgPool.query('SELECT 1')
    .then(() => console.log('Database connected successfully'))
    .catch(err => {
        console.error('Database connection error:', err.message);
        console.error('Connection string present:', !!connectionString);
        console.error('SSL config:', sslConfig);
    });

const db = drizzle(pgPool);

// Simple user table schema (matching the actual schema)
const users = {
    id: 'id',
    username: 'username',
    password: 'password',
    isAdmin: 'is_admin',
    lastLogin: 'last_login'
};

// Password helpers
async function comparePasswords(supplied, stored) {
    const [hashed, salt] = stored.split('.');
    const hashedBuf = Buffer.from(hashed, 'hex');
    const suppliedBuf = await scryptAsync(supplied, salt, 64);
    return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Session configuration
// Note: Memory store warning is expected in serverless environments
// Each function invocation is stateless, so persistent session storage isn't practical
const sessionSecret = process.env.SESSION_SECRET || 'default-secret';
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        httpOnly: true
    }
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport Local Strategy
passport.use(
    new LocalStrategy(async (username, password, done) => {
        try {
            // Query the database for the user using pg client directly
            const result = await pgPool.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );
            const user = result.rows[0];

            if (!user || !(await comparePasswords(password, user.password))) {
                return done(null, false);
            }

            // Update last login
            await pgPool.query(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [user.id]
            );

            return done(null, user);
        } catch (error) {
            console.error('Login error:', error);
            return done(error);
        }
    })
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pgPool.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        done(null, result.rows[0]);
    } catch (error) {
        done(error);
    }
});

// Login route
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

            res.status(200).json(user);
        });
    })(req, res, next);
});

// Logout route
app.post('/api/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.sendStatus(200);
    });
});

// Get current user
app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.sendStatus(401);
    }
    res.json(req.user);
});

// Basic health check
app.get('/api/health', async (req, res) => {
    let dbStatus = 'not_configured';
    let dbError = null;

    if (connectionString) {
        try {
            await pgPool.query('SELECT 1');
            dbStatus = 'connected';
        } catch (err) {
            dbStatus = 'error';
            dbError = err.message;
        }
    }

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: {
            configured: !!connectionString,
            status: dbStatus,
            error: dbError
        },
        session: !!sessionSecret
    });
});

// Serve static files
const publicPath = path.resolve(__dirname, '../dist/public');
app.use(express.static(publicPath));

// Catch-all route for SPA
app.use('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(publicPath, 'index.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

export default app;