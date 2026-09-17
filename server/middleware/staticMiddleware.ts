/**
 * Static file serving for the `uploads/` directory.
 *
 * One directory, mounted at `/uploads`, unauthenticated. Files with a
 * jpg/jpeg/png/gif extension get a 24-hour cache and
 * `Access-Control-Allow-Origin: *` so external services can fetch them.
 *
 * The live image pipeline hosts on ImgBB rather than on local disk, so this
 * directory is usually empty on a fresh deployment.
 */

import express, { Express } from 'express';
import path from 'path';
import { log } from '../vite';

export function setupStaticServing(app: Express): void {
  // Serve the uploads directory
  const uploadsPath = path.join(process.cwd(), 'uploads');
  log(`Setting up static file serving from: ${uploadsPath}`, 'server');
  
  // Configure options for better caching and security
  const staticOptions = {
    maxAge: '1h',
    setHeaders: (res: express.Response, filePath: string) => {
      // Set appropriate headers for images
      if (filePath.match(/\.(jpg|jpeg|png|gif)$/i)) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allow external services to access
      }
    }
  };
  
  // Mount the uploads directory
  app.use('/uploads', express.static(uploadsPath, staticOptions));
  
  // Log success
  log('Static file middleware configured successfully', 'server');
}