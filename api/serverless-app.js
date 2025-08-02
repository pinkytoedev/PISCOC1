// Serverless Express App for Vercel
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { setupAuth } from '../server/auth.js';
import { storage } from '../server/storage.js';
import { registerRoutes } from '../server/routes.js';
import cors from 'cors';

const PgSession = connectPgSimple(session);
const app = express();

// Configure CORS for production
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
        pool: storage.sessionStore.pool,
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

// Setup authentication
setupAuth(app);

// Register all routes
registerRoutes(app);

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Not Found' });
});

export default app;