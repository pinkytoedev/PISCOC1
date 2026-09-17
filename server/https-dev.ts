import fs from 'fs';
import https from 'https';
import path from 'path';
import { Express } from 'express';
import { log } from './vite';

/**
 * Optional HTTPS listener for local development.
 *
 * Started from `server/index.ts` in development only, on a hardcoded port 3001.
 * It does NOT create certificates — it reads `certs/localhost-key.pem` and
 * `certs/localhost.pem` and returns null if either is missing. Generate them
 * with `npm run setup:https`.
 *
 * Caveat: when PORT is unset and 3000 is already taken, the plain HTTP fallback
 * list also reaches for 3001, and the resulting async bind error is not
 * catchable here — it surfaces as an uncaughtException and shuts the process
 * down.
 */
export function setupHTTPS(app: Express, port: number = 3001) {
    try {
        // Check if certificates exist
        const keyPath = path.join(process.cwd(), 'certs', 'localhost-key.pem');
        const certPath = path.join(process.cwd(), 'certs', 'localhost.pem');

        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            log('⚠️  HTTPS certificates not found. Run: npm run setup:https to create them');
            log('📝 Continuing with plain HTTP; the HTTPS listener is optional.');
            return null;
        }

        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
            // Allow self-signed certificates
            rejectUnauthorized: false
        };

        const httpsServer = https.createServer(options, app);

        httpsServer.listen(port, () => {
            log(`🔒 HTTPS Server running on https://localhost:${port}`);
            log('⚠️  You may see certificate warnings - this is normal for localhost development');
        });

        return httpsServer;
    } catch (error) {
        log('❌ Failed to setup HTTPS server:', String(error));
        return null;
    }
}