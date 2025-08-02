#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const certsDir = path.join(process.cwd(), 'certs');
const keyPath = path.join(certsDir, 'localhost-key.pem');
const certPath = path.join(certsDir, 'localhost.pem');

console.log('🔧 Setting up HTTPS certificates for local development...');

try {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
        console.log('📁 Created certs directory');
    }

    // Check if certificates already exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('✅ HTTPS certificates already exist');
        console.log('🔒 You can now use: npm run dev:https');
        console.log('🌐 Access your app at: https://localhost:3001');
        process.exit(0);
    }

    // Create a temporary config file for OpenSSL
    const configContent = `[dn]
CN=localhost

[req]
distinguished_name = dn

[EXT]
subjectAltName=DNS:localhost
keyUsage=digitalSignature
extendedKeyUsage=serverAuth`;

    const configPath = path.join(certsDir, 'openssl.conf');
    fs.writeFileSync(configPath, configContent);

    // Generate the certificate
    const opensslCommand = `openssl req -x509 -out "${certPath}" -keyout "${keyPath}" -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -extensions EXT -config "${configPath}"`;

    console.log('🔑 Generating self-signed certificate...');
    execSync(opensslCommand, { stdio: 'inherit' });

    // Clean up config file
    fs.unlinkSync(configPath);

    console.log('✅ HTTPS certificates generated successfully!');
    console.log('📁 Certificates saved to:', certsDir);
    console.log('');
    console.log('🚀 Next steps:');
    console.log('  1. Run: npm run dev:https');
    console.log('  2. Visit: https://localhost:3001');
    console.log('  3. Accept the security warning (it\'s safe for localhost)');
    console.log('  4. Facebook Login will now work with HTTPS!');
    console.log('');
    console.log('📝 Don\'t forget to add these redirect URIs to your Facebook app:');
    console.log('  - https://localhost:3001/');
    console.log('  - https://localhost:3001/auth/facebook/callback');

} catch (error) {
    console.error('❌ Failed to generate HTTPS certificates:', error.message);
    console.log('');
    console.log('💡 Make sure OpenSSL is installed on your system:');
    console.log('  - macOS: brew install openssl');
    console.log('  - Ubuntu/Debian: sudo apt-get install openssl');
    console.log('  - Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    process.exit(1);
}