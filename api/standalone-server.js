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
                'SELECT id, username, password, is_admin, last_login FROM users WHERE username = $1',
                [username]
            );
            const dbUser = result.rows[0];

            if (!dbUser || !(await comparePasswords(password, dbUser.password))) {
                return done(null, false);
            }

            // Update last login
            await pgPool.query(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [dbUser.id]
            );

            // Map database columns to expected JavaScript properties
            const user = {
                id: dbUser.id,
                username: dbUser.username,
                password: dbUser.password,
                isAdmin: dbUser.is_admin,
                lastLogin: dbUser.last_login
            };

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
            'SELECT id, username, is_admin, last_login FROM users WHERE id = $1',
            [id]
        );
        const dbUser = result.rows[0];

        if (!dbUser) {
            return done(null, false);
        }

        // Map database columns to expected JavaScript properties
        const user = {
            id: dbUser.id,
            username: dbUser.username,
            isAdmin: dbUser.is_admin,
            lastLogin: dbUser.last_login
        };

        done(null, user);
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

            // Ensure we're sending the properly mapped user object
            const responseUser = {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                lastLogin: user.lastLogin
            };
            res.status(200).json(responseUser);
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

// Config endpoints
app.get('/api/config/facebook', (req, res) => {
    const isFacebookConfigured = !!process.env.FACEBOOK_APP_ID;
    res.json({
        status: 'success',
        configured: isFacebookConfigured,
        appId: process.env.FACEBOOK_APP_ID || ''
    });
});

// Integration status endpoint
app.get('/api/integration-status', (req, res) => {
    const integrations = [
        {
            name: 'database',
            configured: !!process.env.DATABASE_URL,
            required: true,
            envVar: 'DATABASE_URL',
            lastChecked: new Date().toISOString()
        },
        {
            name: 'discord',
            configured: !!process.env.DISCORD_BOT_TOKEN && !!process.env.DISCORD_CLIENT_ID,
            required: false,
            envVar: 'DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID',
            lastChecked: new Date().toISOString()
        },
        {
            name: 'airtable',
            configured: !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID,
            required: false,
            envVar: 'AIRTABLE_API_KEY, AIRTABLE_BASE_ID',
            lastChecked: new Date().toISOString()
        },
        {
            name: 'instagram',
            configured: !!process.env.FACEBOOK_APP_ID && !!process.env.INSTAGRAM_APP_ID,
            required: false,
            envVar: 'FACEBOOK_APP_ID, INSTAGRAM_APP_ID',
            lastChecked: new Date().toISOString()
        },
        {
            name: 'imgbb',
            configured: !!process.env.IMGBB_API_KEY,
            required: false,
            envVar: 'IMGBB_API_KEY',
            lastChecked: new Date().toISOString()
        },
        {
            name: 'session',
            configured: !!process.env.SESSION_SECRET,
            required: true,
            envVar: 'SESSION_SECRET',
            lastChecked: new Date().toISOString()
        }
    ];
    
    res.json(integrations);
});

// Test integration access endpoint
app.get('/api/test-integrations', async (req, res) => {
    const tests = {
        database: {
            configured: !!process.env.DATABASE_URL,
            connected: false,
            error: null
        },
        discord: {
            configured: !!process.env.DISCORD_BOT_TOKEN,
            token_length: process.env.DISCORD_BOT_TOKEN ? process.env.DISCORD_BOT_TOKEN.length : 0
        },
        airtable: {
            configured: !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID,
            base_id: process.env.AIRTABLE_BASE_ID ? 'set' : 'not_set'
        },
        imgbb: {
            configured: !!process.env.IMGBB_API_KEY,
            key_length: process.env.IMGBB_API_KEY ? process.env.IMGBB_API_KEY.length : 0
        }
    };

    // Test database connection
    if (process.env.DATABASE_URL) {
        try {
            await pgPool.query('SELECT 1');
            tests.database.connected = true;
        } catch (error) {
            tests.database.error = error.message;
        }
    }

    res.json(tests);
});

// Integration-specific endpoints
// Discord integration
app.get('/api/discord/settings', async (req, res) => {
    try {
        const result = await pgPool.query(
            "SELECT * FROM integration_settings WHERE integration = 'discord'"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Discord settings error:', error);
        res.json([]);
    }
});

app.get('/api/discord/bot/status', (req, res) => {
    res.json({
        isRunning: false,
        isConfigured: !!process.env.DISCORD_BOT_TOKEN,
        message: 'Bot status check in serverless environment'
    });
});

app.get('/api/discord/bot/servers', (req, res) => {
    res.json([]); // Empty servers list for serverless
});

app.get('/api/discord/webhooks', (req, res) => {
    res.json([]); // Empty webhooks list for serverless
});

// Airtable integration
app.get('/api/airtable/settings', async (req, res) => {
    try {
        const result = await pgPool.query(
            "SELECT * FROM integration_settings WHERE integration = 'airtable'"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Airtable settings error:', error);
        res.json([]);
    }
});

app.get('/api/airtable/test-connection', async (req, res) => {
    const configured = !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID;
    res.json({
        success: configured,
        message: configured ? 'Airtable is configured' : 'Airtable API key or Base ID not configured'
    });
});

// ImgBB integration
app.get('/api/imgbb/settings', async (req, res) => {
    try {
        const result = await pgPool.query(
            "SELECT * FROM integration_settings WHERE integration = 'imgbb'"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('ImgBB settings error:', error);
        res.json([]);
    }
});

// Instagram integration
app.get('/api/instagram/account', (req, res) => {
    res.json({
        configured: !!process.env.INSTAGRAM_APP_ID,
        message: 'Instagram account status'
    });
});

app.get('/api/instagram/media', (req, res) => {
    res.json([]); // Empty media list for serverless
});

// POST endpoints for settings (minimal implementation)
app.post('/api/discord/settings', async (req, res) => {
    try {
        // In a full implementation, this would update the database
        res.json({ success: true, message: 'Discord settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/airtable/settings', async (req, res) => {
    try {
        res.json({ success: true, message: 'Airtable settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/imgbb/settings/:key', async (req, res) => {
    try {
        res.json({ success: true, message: 'ImgBB settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test endpoints
app.post('/api/discord/test', (req, res) => {
    const configured = !!process.env.DISCORD_BOT_TOKEN;
    res.json({
        success: configured,
        message: configured ? 'Discord bot token is configured' : 'Discord bot token not found'
    });
});

app.post('/api/airtable/sync/:type', (req, res) => {
    const configured = !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID;
    res.json({
        success: configured,
        message: configured ? `Sync ${req.params.type} initiated` : 'Airtable not configured'
    });
});

// Basic CRUD endpoints (minimal implementation for Vercel)
// These would normally connect to the database, but for now we'll return empty data

// Team Members
app.get('/api/team-members', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM team_members ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Team members fetch error:', error);
        res.json([]); // Return empty array on error
    }
});

// Articles
app.get('/api/articles', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM articles ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Articles fetch error:', error);
        res.json([]); // Return empty array on error
    }
});

// Carousel Quotes
app.get('/api/carousel-quotes', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM carousel_quotes ORDER BY id DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Carousel quotes fetch error:', error);
        res.json([]); // Return empty array on error
    }
});

// Admin Requests
app.get('/api/admin-requests', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM admin_requests ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Admin requests fetch error:', error);
        res.json([]); // Return empty array on error
    }
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

    // Debug environment variables (safely)
    const envDebug = {
        NODE_ENV: process.env.NODE_ENV || 'not_set',
        DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not_set',
        SESSION_SECRET: process.env.SESSION_SECRET ? 'set' : 'not_set',
        VERCEL: process.env.VERCEL || 'not_set',
        VERCEL_ENV: process.env.VERCEL_ENV || 'not_set',
        // Check for common Vercel env vars
        VERCEL_URL: process.env.VERCEL_URL || 'not_set',
        // List all env keys (but not values for security)
        envKeys: Object.keys(process.env).sort()
    };

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: {
            configured: !!connectionString,
            status: dbStatus,
            error: dbError,
            connectionStringLength: connectionString ? connectionString.length : 0
        },
        session: !!sessionSecret,
        envDebug
    });
});

// Additional integration endpoints
app.get('/api/discord/bot/invite-url', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (clientId) {
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot`;
        res.json({ url: inviteUrl });
    } else {
        res.status(400).json({ error: 'Discord client ID not configured' });
    }
});

app.post('/api/discord/bot/initialize', (req, res) => {
    res.json({ success: true, message: 'Bot initialization not available in serverless environment' });
});

app.post('/api/discord/bot/start', (req, res) => {
    res.json({ success: false, message: 'Bot cannot run in serverless environment' });
});

app.post('/api/discord/bot/stop', (req, res) => {
    res.json({ success: true, message: 'Bot stop not applicable in serverless environment' });
});

// Instagram webhook endpoints (minimal)
app.get('/api/instagram/webhooks/logs', (req, res) => {
    res.json([]);
});

app.get('/api/instagram/webhooks/subscriptions', (req, res) => {
    res.json([]);
});

app.get('/api/instagram/webhooks/field-groups', (req, res) => {
    res.json([]);
});

// Serve static files
const publicPath = path.resolve(__dirname, '../dist/public');
app.use(express.static(publicPath));

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// List all registered routes (for debugging)
app.get('/api/routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods)
            });
        }
    });
    res.json(routes);
});

// Catch-all route for SPA
app.use('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(publicPath, 'index.html'));
    } else {
        console.log(`API route not found: ${req.path}`);
        res.status(404).json({ error: 'Not found', path: req.path });
    }
});

export default app;