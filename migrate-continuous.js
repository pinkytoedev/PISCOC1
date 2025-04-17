/**
 * Continuous Migration Script for Airtable Images to Imgur
 * 
 * This script:
 * 1. Runs continuously to migrate images from Airtable to Imgur
 * 2. Respects Imgur API rate limits automatically
 * 3. Updates progress in real-time for dashboard monitoring
 * 4. Handles errors gracefully with automatic retries
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import FormData from 'form-data';

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;
const PROGRESS_FILE = './migration-continuous.json';

// Imgur rate limit settings
// API limit is 1250 uploads per day or about 50 per hour
// We'll be more conservative with 30 per hour (1 every 2 minutes)
const IMGUR_UPLOADS_PER_HOUR = 30; 
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const UPLOAD_DELAY = Math.ceil(MILLISECONDS_PER_HOUR / IMGUR_UPLOADS_PER_HOUR);
const MAX_RETRIES = 5;
const MIN_DELAY_BETWEEN_RECORDS = 10000; // Minimum 10 seconds between records

// Validation
if (!AIRTABLE_API_KEY) {
  console.error('Error: AIRTABLE_API_KEY environment variable is required');
  process.exit(1);
}

if (!IMGUR_CLIENT_ID) {
  console.error('Error: IMGUR_CLIENT_ID environment variable is required');
  process.exit(1);
}

/**
 * Progress tracking structure
 */
let progress = {
  processedRecords: [], // Array of recordIds that have been processed
  totalRecords: 0,
  uploadTimestamps: [], // Array of timestamps when uploads occurred
  errors: [],           // Array of errors encountered
  isRunning: false,     // Flag to track if migration is currently running
  lastRunTime: null,    // When the migration last ran (for dashboard display)
  paused: false         // Flag to allow pausing the migration
};

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay needed to respect rate limits
 */
function calculateRateLimitDelay() {
  const now = Date.now();
  const oneHourAgo = now - MILLISECONDS_PER_HOUR;
  
  // Filter timestamps to only include those within the last hour
  progress.uploadTimestamps = progress.uploadTimestamps.filter(
    timestamp => timestamp > oneHourAgo
  );
  
  // If we haven't reached our hourly limit, use the minimum delay
  if (progress.uploadTimestamps.length < IMGUR_UPLOADS_PER_HOUR) {
    return MIN_DELAY_BETWEEN_RECORDS;
  }
  
  // Calculate when we can do the next upload
  const oldestTimestamp = progress.uploadTimestamps[0];
  const nextAvailableSlot = oldestTimestamp + MILLISECONDS_PER_HOUR;
  
  // Return the milliseconds to wait, or minimum delay whichever is greater
  return Math.max(MIN_DELAY_BETWEEN_RECORDS, nextAvailableSlot - now);
}

/**
 * Record an upload timestamp
 */
function recordUpload() {
  const now = Date.now();
  progress.uploadTimestamps.push(now);
  progress.lastRunTime = now;
  // Keep sorted by timestamp (oldest first)
  progress.uploadTimestamps.sort((a, b) => a - b);
}

/**
 * Load progress from file if it exists
 */
async function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = await fs.readFile(PROGRESS_FILE, 'utf8');
      const savedProgress = JSON.parse(data);
      
      // Merge the saved progress with our default structure
      progress = {
        ...progress,
        ...savedProgress,
        // Always start with isRunning false when loading
        isRunning: false
      };
      
      console.log(`Loaded existing progress: ${progress.processedRecords.length}/${progress.totalRecords} records processed`);
      return true;
    }
  } catch (error) {
    console.error('Error loading progress file:', error);
  }
  return false;
}

/**
 * Save current progress to file
 */
async function saveProgress() {
  try {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving progress file:', error);
  }
}

/**
 * Fetch all records from Airtable
 */
async function fetchAirtableRecords() {
  const records = [];
  let offset = null;
  
  try {
    do {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
      
      // Add offset parameter if we have one
      const params = new URLSearchParams();
      if (offset) {
        params.append('offset', offset);
      }
      
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} - ${await response.text()}`);
      }
      
      const data = await response.json();
      records.push(...data.records);
      offset = data.offset;
      
      console.log(`Fetched ${data.records.length} records, total: ${records.length}`);
      
    } while (offset);
    
    return records;
  } catch (error) {
    console.error('Error fetching Airtable records:', error);
    // If there's an error, wait and retry once
    console.log('Waiting 30 seconds before retrying...');
    await sleep(30000);
    
    // Simple retry once
    try {
      return await fetchAirtableRecords();
    } catch (retryError) {
      console.error('Error fetching Airtable records after retry:', retryError);
      throw retryError;
    }
  }
}

/**
 * Upload an image URL to Imgur respecting rate limits
 */
async function uploadImageToImgur(imageUrl, retryCount = 0) {
  try {
    // Check if we need to wait to respect rate limits
    const delayNeeded = calculateRateLimitDelay();
    if (delayNeeded > 0) {
      const delaySeconds = Math.ceil(delayNeeded / 1000);
      console.log(`Rate limit reached. Waiting ${delaySeconds} seconds before next upload...`);
      await sleep(delayNeeded);
    }
    
    console.log(`Uploading to Imgur: ${imageUrl}`);
    
    const formData = new FormData();
    formData.append('image', imageUrl);
    
    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    // Handle rate limiting (status code 429)
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        // Exponential backoff with jitter
        const baseDelay = 60000; // 1 minute
        const exponentialDelay = baseDelay * Math.pow(2, retryCount);
        const jitter = Math.random() * 5000; // Add up to 5 seconds of jitter
        const delay = exponentialDelay + jitter;
        
        console.log(`Rate limited by Imgur. Waiting ${Math.ceil(delay/1000)} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        return uploadImageToImgur(imageUrl, retryCount + 1);
      } else {
        throw new Error(`Imgur rate limit exceeded after ${MAX_RETRIES} retries`);
      }
    }
    
    if (!response.ok || !data.success) {
      if (JSON.stringify(data).includes('Too Many Requests') && retryCount < MAX_RETRIES) {
        // Exponential backoff for "Too Many Requests" errors without 429 status
        const baseDelay = 60000; // 1 minute
        const exponentialDelay = baseDelay * Math.pow(2, retryCount);
        const jitter = Math.random() * 5000; // Add up to 5 seconds of jitter
        const delay = exponentialDelay + jitter;
        
        console.log(`Rate limited by Imgur (from error message). Waiting ${Math.ceil(delay/1000)} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        return uploadImageToImgur(imageUrl, retryCount + 1);
      } else {
        throw new Error(`Imgur API error: ${JSON.stringify(data)}`);
      }
    }
    
    // Record this successful upload in our rate limit tracker
    recordUpload();
    
    console.log(`Imgur upload successful: ${data.data.link}`);
    return data.data.link;
  } catch (error) {
    if (error.message && error.message.includes('Too Many Requests') && retryCount < MAX_RETRIES) {
      // Exponential backoff for exceptions containing rate limit messages
      const baseDelay = 60000; // 1 minute
      const exponentialDelay = baseDelay * Math.pow(2, retryCount);
      const jitter = Math.random() * 5000; // Add up to 5 seconds of jitter
      const delay = exponentialDelay + jitter;
      
      console.log(`Rate limited by Imgur (from exception). Waiting ${Math.ceil(delay/1000)} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(delay);
      return uploadImageToImgur(imageUrl, retryCount + 1);
    }
    
    console.error('Error uploading to Imgur:', error);
    throw error;
  }
}

/**
 * Update an Airtable record with new image link
 */
async function updateAirtableRecord(recordId, imageUrl, retryCount = 0) {
  try {
    console.log(`Updating Airtable record ${recordId} with MainImageLink: ${imageUrl}`);
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          MainImageLink: imageUrl
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // If we get a rate limit error, retry with exponential backoff
      if (response.status === 429 && retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 30000; // 30s, 60s, 120s...
        console.log(`Rate limited by Airtable. Waiting ${delay/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        return updateAirtableRecord(recordId, imageUrl, retryCount + 1);
      }
      
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    console.log(`Record ${recordId} updated successfully`);
    return await response.json();
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 15000; // 15s, 30s, 60s...
      console.log(`Error updating Airtable. Waiting ${delay/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(delay);
      return updateAirtableRecord(recordId, imageUrl, retryCount + 1);
    }
    
    console.error('Error updating Airtable record:', error);
    throw error;
  }
}

/**
 * Find records that need processing
 */
function findRecordsToProcess(records) {
  return records.filter(record => 
    // Not already processed
    !progress.processedRecords.includes(record.id) && 
    // Has MainImage attachment
    record.fields.MainImage && 
    record.fields.MainImage.length > 0
  );
}

/**
 * Process a single record
 */
async function processRecord(record) {
  const recordId = record.id;
  
  try {
    const title = record.fields.Name || 'Untitled';
    console.log(`\nProcessing record: ${recordId} - ${title}\n`);
    
    const mainImage = record.fields.MainImage[0];
    const mainImageUrl = mainImage.url;
    
    // Upload to Imgur
    const imgurLink = await uploadImageToImgur(mainImageUrl);
    
    // Update Airtable record with new link
    await updateAirtableRecord(recordId, imgurLink);
    
    // Mark record as processed
    progress.processedRecords.push(recordId);
    await saveProgress();
    
    console.log(`Successfully processed record ${recordId}`);
    return true;
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    
    // Record the error
    progress.errors.push({
      recordId,
      title: record.fields.Name || 'Untitled',
      error: error.message,
      timestamp: Date.now()
    });
    
    // Save progress even when errors occur
    await saveProgress();
    
    return false;
  }
}

/**
 * Main migration function - runs continuously
 */
async function runContinuousMigration() {
  // Set running flag
  progress.isRunning = true;
  await saveProgress();
  
  try {
    console.log('Starting continuous migration of Airtable images to Imgur');
    console.log(`Using rate limits: ${IMGUR_UPLOADS_PER_HOUR} uploads per hour (minimum ${MIN_DELAY_BETWEEN_RECORDS/1000} seconds between records)`);
    
    // Fetch all records from Airtable
    const records = await fetchAirtableRecords();
    
    // Update progress with total count if not already set
    if (!progress.totalRecords) {
      progress.totalRecords = records.length;
      await saveProgress();
    }
    
    // Find records that need processing
    const recordsToProcess = findRecordsToProcess(records);
    console.log(`Found ${recordsToProcess.length} records that need processing`);
    
    // Process each record with appropriate delays
    for (let i = 0; i < recordsToProcess.length; i++) {
      // Check if migration has been paused
      if (progress.paused) {
        console.log('Migration paused. Waiting to be resumed...');
        while (progress.paused) {
          await sleep(5000); // Check every 5 seconds if we've been resumed
          
          // Reload progress file to check pause status
          await loadProgress();
        }
        console.log('Migration resumed!');
      }
      
      const record = recordsToProcess[i];
      await processRecord(record);
      
      // Calculate and show progress
      const totalProcessed = progress.processedRecords.length;
      const percentComplete = Math.round((totalProcessed / progress.totalRecords) * 100);
      console.log(`\nProgress: ${totalProcessed}/${progress.totalRecords} (${percentComplete}%)`);
      
      // Calculate remaining time
      const remainingRecords = progress.totalRecords - totalProcessed;
      const avgTimePerRecord = UPLOAD_DELAY / 1000; // seconds
      const estTimeRemaining = remainingRecords * avgTimePerRecord;
      const estHours = Math.floor(estTimeRemaining / 3600);
      const estMinutes = Math.floor((estTimeRemaining % 3600) / 60);
      
      console.log(`Estimated time remaining: ${estHours} hours and ${estMinutes} minutes\n`);
      
      // If we're at the end, we're done!
      if (i === recordsToProcess.length - 1) {
        console.log('All records processed! Migration complete!');
        break;
      }
      
      // Calculate delay before next record
      const delay = calculateRateLimitDelay();
      const delaySeconds = Math.ceil(delay / 1000);
      console.log(`Waiting ${delaySeconds} seconds before next record...`);
      await sleep(delay);
    }
  } catch (error) {
    console.error('Error in continuous migration:', error);
    
    // Handle catastrophic errors by waiting and restarting
    console.log('Encountered a critical error. Waiting 5 minutes before restarting migration...');
    await sleep(5 * 60 * 1000); // 5 minutes
    
    return runContinuousMigration();
  } finally {
    // Update running status before exiting
    progress.isRunning = false;
    await saveProgress();
  }
}

/**
 * Entry point with proper error handling
 */
async function startMigration() {
  try {
    // Load existing progress
    await loadProgress();
    
    // Check if already running
    if (progress.isRunning) {
      console.log('Migration is already marked as running. Resetting flag to start fresh.');
      progress.isRunning = false;
      await saveProgress();
    }
    
    // Start the migration
    await runContinuousMigration();
  } catch (error) {
    console.error('Fatal error in migration process:', error);
    process.exit(1);
  }
}

// Start the migration process
startMigration().catch(error => {
  console.error('Unhandled error in migration:', error);
  process.exit(1);
});