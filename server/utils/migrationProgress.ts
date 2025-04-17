/**
 * Utility for tracking and reporting Airtable migration progress
 */
import fs from 'fs';
import path from 'path';

// Progress files for different migration types
const PROGRESS_FILES = [
  './migration-with-progress-bar.json',
  './migration-with-improved-rate-limits.json',
  './migration-main-progress.json',
  './migration-small-batch.json',
  './migration-single-image.json'
];

/**
 * Interface for migration progress data
 */
export interface MigrationProgress {
  processedRecords: string[];
  totalRecords: number;
  uploadTimestamps?: number[];
  errors?: Array<{
    recordId: string;
    title: string;
    error: string;
  }>;
}

/**
 * Get the combined migration progress from all progress files
 */
export function getMigrationProgress(): {
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
} {
  // Default return if no files exist
  const defaultResult = {
    totalRecords: 0,
    processedRecords: 0,
    percentage: 0,
    recentUploads: 0,
    lastUploadTime: null,
    errors: []
  };
  
  // Try to find any progress files
  const existingFiles = PROGRESS_FILES.filter(file => fs.existsSync(file));
  if (existingFiles.length === 0) {
    return defaultResult;
  }
  
  // Find the most recently modified file
  const fileStats = existingFiles.map(file => ({
    path: file,
    stats: fs.statSync(file)
  }));
  
  fileStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  const latestFile = fileStats[0].path;
  
  try {
    // Read the latest progress file
    const data = fs.readFileSync(latestFile, 'utf8');
    const progress: MigrationProgress = JSON.parse(data);
    
    // Calculate percentage
    const percentage = progress.totalRecords > 0 
      ? Math.round((progress.processedRecords.length / progress.totalRecords) * 100) 
      : 0;
    
    // Get recent uploads (in the last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentUploads = progress.uploadTimestamps
      ? progress.uploadTimestamps.filter(timestamp => timestamp > oneDayAgo).length
      : 0;
    
    // Get last upload time
    const lastUploadTime = progress.uploadTimestamps && progress.uploadTimestamps.length > 0
      ? new Date(Math.max(...progress.uploadTimestamps)).toISOString()
      : null;
    
    return {
      totalRecords: progress.totalRecords,
      processedRecords: progress.processedRecords.length,
      percentage,
      recentUploads,
      lastUploadTime,
      errors: progress.errors || []
    };
  } catch (error) {
    console.error('Error reading migration progress file:', error);
    return defaultResult;
  }
}