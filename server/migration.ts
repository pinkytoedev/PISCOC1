/**
 * Migration progress tracking API
 */
import fs from 'fs';
import express from 'express';

// Progress files for different migration types
const PROGRESS_FILES = [
  './migration-with-progress-bar.json',
  './migration-with-improved-rate-limits.json',
  // './migration-main-progress.json', // Temporarily excluded due to format incompatibility
  './migration-small-batch.json',
  './migration-single-image.json',
  './migration-continuous.json' // New continuous migration process
];

interface MigrationProgress {
  processedRecords: string[];
  totalRecords: number;
  uploadTimestamps?: number[];
  errors?: Array<{
    recordId: string;
    title: string;
    error: string;
  }>;
}

interface MigrationResponse {
  totalRecords: number;
  processedRecords: number;
  percentage: number;
  recentUploads: number;
  lastUploadTime: string | null;
  errors: Array<{
    recordId: string;
    title: string;
    error: string;
  }>;
}

/**
 * Get migration progress data
 */
export function getMigrationProgress(): MigrationResponse {
  // Default return if no files exist
  const defaultResult: MigrationResponse = {
    totalRecords: 0,
    processedRecords: 0,
    percentage: 0,
    recentUploads: 0,
    lastUploadTime: null,
    errors: []
  };
  
  // Find existing progress files
  const existingFiles = PROGRESS_FILES.filter(file => fs.existsSync(file));
  if (existingFiles.length === 0) {
    return defaultResult;
  }
  
  // Collect data from all progress files
  let allProcessedRecords: string[] = [];
  let maxTotalRecords = 0;
  let allUploadTimestamps: number[] = [];
  let allErrors: Array<{recordId: string; title: string; error: string}> = [];
  
  // Read and combine data from all files
  for (const file of existingFiles) {
    try {
      const fileContent = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(fileContent) as MigrationProgress;
      
      // Combine processed records (avoiding duplicates)
      if (data.processedRecords && Array.isArray(data.processedRecords)) {
        allProcessedRecords = [...allProcessedRecords, ...data.processedRecords];
        // Remove duplicates
        allProcessedRecords = [...new Set(allProcessedRecords)];
      }
      
      // Track maximum total records
      if (data.totalRecords && typeof data.totalRecords === 'number') {
        maxTotalRecords = Math.max(maxTotalRecords, data.totalRecords);
      }
      
      // Combine upload timestamps
      if (data.uploadTimestamps && Array.isArray(data.uploadTimestamps)) {
        allUploadTimestamps = [...allUploadTimestamps, ...data.uploadTimestamps];
      }
      
      // Combine errors
      if (data.errors && Array.isArray(data.errors)) {
        allErrors = [...allErrors, ...data.errors];
      }
    } catch (error) {
      console.error(`Error reading migration file ${file}:`, error);
    }
  }
  
  // Sort upload timestamps (most recent first)
  allUploadTimestamps.sort((a, b) => b - a);
  
  // Calculate percentage complete
  const percentage = maxTotalRecords > 0 
    ? Math.round((allProcessedRecords.length / maxTotalRecords) * 100) 
    : 0;
  
  // Get recent uploads (in the last 24 hours)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const recentUploads = allUploadTimestamps
    .filter(timestamp => timestamp > oneDayAgo)
    .length;
  
  // Get last upload time
  const lastUploadTime = allUploadTimestamps.length > 0
    ? new Date(allUploadTimestamps[0]).toISOString()
    : null;
  
  return {
    totalRecords: maxTotalRecords,
    processedRecords: allProcessedRecords.length,
    percentage,
    recentUploads,
    lastUploadTime,
    errors: allErrors.slice(0, 10) // Limit to 10 most recent errors
  };
}

/**
 * Register migration routes
 */
export function registerMigrationRoutes(app: express.Express): void {
  // Get migration progress
  app.get('/api/migration-progress', (req, res) => {
    try {
      // Add cache control headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const progress = getMigrationProgress();
      res.json(progress);
    } catch (error) {
      console.error('Error getting migration progress:', error);
      res.status(500).json({ 
        error: 'Failed to fetch migration progress',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}