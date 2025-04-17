/**
 * Utility for tracking and reporting Airtable migration progress
 */
import fs from 'fs';
import path from 'path';

// Progress files for different migration types
// Temporarily exclude problematic migration-main-progress.json file
const PROGRESS_FILES = [
  './migration-with-progress-bar.json',
  './migration-with-improved-rate-limits.json',
  // './migration-main-progress.json', // Temporarily excluded due to format incompatibility
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
      
      // Skip files that don't match our expected format
      if (!fileData || typeof fileData !== 'object') {
        console.warn(`Skipping invalid progress file ${file}: Not a valid JSON object`);
        continue;
      }
      
      // Handle different formats of processed records
      try {
        // Format 1: Array of record IDs
        if (fileData.processedRecords && Array.isArray(fileData.processedRecords)) {
          const uniqueRecords = new Set<string>();
          // Add existing records
          combinedProgress.processedRecords.forEach(id => uniqueRecords.add(id));
          // Add new records
          fileData.processedRecords.forEach((id: string) => uniqueRecords.add(id)); 
          combinedProgress.processedRecords = Array.from(uniqueRecords);
        } 
        // Format 2: Object with record IDs as keys
        else if (fileData.recordsProcessed && typeof fileData.recordsProcessed === 'object') {
          const uniqueRecords = new Set<string>();
          // Add existing records
          combinedProgress.processedRecords.forEach(id => uniqueRecords.add(id));
          // Add new records
          Object.keys(fileData.recordsProcessed).forEach(id => uniqueRecords.add(id));
          combinedProgress.processedRecords = Array.from(uniqueRecords);
        }
        // Format 3: Just a count (we can't merge specific IDs in this case)
        else if (fileData.processedRecords && typeof fileData.processedRecords === 'number') {
          // Just keep track that we found records, but can't merge specific IDs
          console.log(`File ${file} has ${fileData.processedRecords} processed records (numeric format)`);
        }
      } catch (innerError) {
        console.error(`Error processing records from file ${file}:`, innerError);
      }
      
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