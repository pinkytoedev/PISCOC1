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
  const NO_CACHE = Date.now(); // Add timestamp to avoid caching {
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
  
  // Collect data from all progress files to get a complete picture
  let combinedProgress: MigrationProgress = {
    processedRecords: [],
    totalRecords: 0,
    uploadTimestamps: [],
    errors: []
  };
  
  // Read all progress files and combine their data
  for (const file of existingFiles) {
    try {
      const fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      // Merge processed records (avoiding duplicates)
      combinedProgress.processedRecords = [
        ...new Set([...combinedProgress.processedRecords, ...fileData.processedRecords])
      ];
      
      // Use the largest total value
      combinedProgress.totalRecords = Math.max(combinedProgress.totalRecords, fileData.totalRecords);
      
      // Merge timestamps if available
      if (fileData.uploadTimestamps) {
        combinedProgress.uploadTimestamps = [
          ...combinedProgress.uploadTimestamps,
          ...fileData.uploadTimestamps
        ];
      }
      
      // Merge errors if available
      if (fileData.errors) {
        combinedProgress.errors = [
          ...combinedProgress.errors,
          ...fileData.errors
        ];
      }
    } catch (error) {
      console.error(`Error reading migration file ${file}:`, error);
    }
  }
  
  // Sort timestamps
  if (combinedProgress.uploadTimestamps.length > 0) {
    combinedProgress.uploadTimestamps.sort((a, b) => b - a);
  }
  
  try {
    // Calculate percentage based on combined progress
    const percentage = combinedProgress.totalRecords > 0 
      ? Math.round((combinedProgress.processedRecords.length / combinedProgress.totalRecords) * 100) 
      : 0;
    
    // Get recent uploads (in the last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentUploads = combinedProgress.uploadTimestamps
      ? combinedProgress.uploadTimestamps.filter(timestamp => timestamp > oneDayAgo).length
      : 0;
    
    // Get last upload time
    const lastUploadTime = combinedProgress.uploadTimestamps && combinedProgress.uploadTimestamps.length > 0
      ? new Date(Math.max(...combinedProgress.uploadTimestamps)).toISOString()
      : null;
    
    return {
      totalRecords: combinedProgress.totalRecords,
      processedRecords: combinedProgress.processedRecords.length,
      percentage,
      recentUploads,
      lastUploadTime,
      errors: combinedProgress.errors || []
    };
  } catch (error) {
    console.error('Error reading migration progress file:', error);
    return defaultResult;
  }
}