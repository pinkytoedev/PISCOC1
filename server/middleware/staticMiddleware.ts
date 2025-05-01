/**
 * Static File Serving Middleware
 * 
 * Configures Express to serve static files from various directories
 * Includes special configuration for Instagram image uploads
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