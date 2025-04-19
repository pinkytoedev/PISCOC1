/**
 * ImgBB Migration API Routes
 * 
 * Endpoints for triggering and monitoring the migration of Airtable
 * MainImage attachments to ImgBB and updating the MainImageLink field.
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { storage } from '../storage';
import fs from 'fs';
import path from 'path';

// Progress file path
const PROGRESS_FILE = path.join(__dirname, '../../data', 'imgbb-migration-progress.json');

// Function to get migration progress
function getMigrationProgress(): { 
  totalRecords: number; 
  processedRecords: number; 
  percentage: number; 
  errors: Array<{ recordId: string; title: string; error: string; }>;
} {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      const progress = JSON.parse(data);
      
      return {
        totalRecords: progress.totalRecords || 0,
        processedRecords: progress.processedRecords?.length || 0,
        percentage: progress.totalRecords ? 
          Math.round((progress.processedRecords?.length || 0) / progress.totalRecords * 100) : 0,
        errors: progress.errors || []
      };
    }
    
    return {
      totalRecords: 0,
      processedRecords: 0,
      percentage: 0,
      errors: []
    };
  } catch (error) {
    console.error('Error reading migration progress:', error);
    return {
      totalRecords: 0,
      processedRecords: 0,
      percentage: 0,
      errors: []
    };
  }
}

// Register the migration routes
export function registerImgBBMigrationRoutes(app: Router): void {
  // Run migration
  app.post('/api/migration/airtable-to-imgbb', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Check if migration is already running
      const scriptPath = path.join(__dirname, '../../scripts/migrate-images-to-imgbb.js');
      
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ message: 'Migration script not found' });
      }
      
      // Create data directory if it doesn't exist
      const dataDir = path.join(__dirname, '../../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Log action
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'start',
        resourceType: 'migration',
        resourceId: 'airtable-to-imgbb',
        details: { startedAt: new Date().toISOString() }
      });
      
      // Run migration script in background
      const migration = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
          console.error('Migration failed:', error);
          
          // Log failure
          storage.createActivityLog({
            userId: req.user?.id,
            action: 'error',
            resourceType: 'migration',
            resourceId: 'airtable-to-imgbb',
            details: { error: error.message, stderr }
          }).catch(console.error);
          
          return;
        }
        
        console.log('Migration completed:', stdout);
        
        // Log completion
        storage.createActivityLog({
          userId: req.user?.id,
          action: 'complete',
          resourceType: 'migration',
          resourceId: 'airtable-to-imgbb',
          details: { completedAt: new Date().toISOString() }
        }).catch(console.error);
      });
      
      // Don't wait for the migration to complete
      return res.json({ 
        message: 'Migration started in background',
        status: 'running'
      });
    } catch (error) {
      console.error('Error starting migration:', error);
      return res.status(500).json({ 
        message: 'Failed to start migration',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get migration progress
  app.get('/api/migration/airtable-to-imgbb/progress', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const progress = getMigrationProgress();
      
      // Check if migration is currently running (you could implement a more robust check)
      const isRunning = false; // For now, just assume it's not running
      
      return res.json({
        ...progress,
        status: isRunning ? 'running' : 
          (progress.totalRecords > 0 && progress.processedRecords >= progress.totalRecords) ? 
            'completed' : 'idle'
      });
    } catch (error) {
      console.error('Error getting migration progress:', error);
      return res.status(500).json({ 
        message: 'Failed to get migration progress',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Reset migration progress
  app.post('/api/migration/airtable-to-imgbb/reset', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Delete progress file if it exists
      if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
      }
      
      // Log action
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'reset',
        resourceType: 'migration',
        resourceId: 'airtable-to-imgbb',
        details: { resetAt: new Date().toISOString() }
      });
      
      return res.json({ 
        message: 'Migration progress reset',
        status: 'idle'
      });
    } catch (error) {
      console.error('Error resetting migration progress:', error);
      return res.status(500).json({ 
        message: 'Failed to reset migration progress',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}