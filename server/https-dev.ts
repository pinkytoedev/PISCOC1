import fs from 'fs';
import https from 'https';
import path from 'path';
import { Express } from 'express';
import { log } from './vite';

/**
 * Setup HTTPS for local development
 * This creates self-signed certificates for Facebook SDK testing
 */
export function setupHTTPS(app: Express, port: number = 3001) {
    try {
        // Check if certificates exist
        const keyPath = path.join(process.cwd(), 'certs', 'localhost-key.pem');
        const certPath = path.join(process.cwd(), 'certs', 'localhost.pem');

        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            log('⚠️  HTTPS certificates not found. Run: npm run setup:https to create them');
            log('📝 For now, Facebook login will only work on localhost HTTP for development');
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
            log('✅ Facebook SDK will work with HTTPS');
            log('⚠️  You may see certificate warnings - this is normal for localhost development');
        });

        return httpsServer;
    } catch (error) {
        log('❌ Failed to setup HTTPS server:', String(error));
        return null;
    }
}