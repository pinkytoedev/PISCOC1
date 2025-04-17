/**
 * Migration Script for Airtable MainImage Attachments to MainImageLink Field
 * Follows Imgur API guidelines to avoid rate limiting
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
const PROGRESS_FILE = './migration-with-improved-rate-limits.json';

// Imgur rate limit settings
// API limit is 1250 uploads per day or about 50 per hour
// We'll be more conservative with 12 per hour (1 every 5 minutes)
const IMGUR_UPLOADS_PER_HOUR = 10; 
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const UPLOAD_DELAY = Math.ceil(MILLISECONDS_PER_HOUR / IMGUR_UPLOADS_PER_HOUR);
const MAX_BATCH_SIZE = 5; // Process up to 5 records per run

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
  uploadTimestamps: [] // Array of timestamps when uploads occurred
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
  
  // If we haven't reached our hourly limit, no delay needed
  if (progress.uploadTimestamps.length < IMGUR_UPLOADS_PER_HOUR) {
    return 0;
  }
  
  // Calculate when we can do the next upload
  const oldestTimestamp = progress.uploadTimestamps[0];
  const nextAvailableSlot = oldestTimestamp + MILLISECONDS_PER_HOUR;
  
  // Return the milliseconds to wait
  return Math.max(0, nextAvailableSlot - now);
}

/**
 * Record an upload timestamp
 */
function recordUpload() {
  progress.uploadTimestamps.push(Date.now());
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
      progress = JSON.parse(data);
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
}

/**
 * Upload an image URL to Imgur respecting rate limits
 */
async function uploadImageToImgur(imageUrl, retryCount = 0) {
  const MAX_RETRIES = 3;
  
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
        // Exponential backoff with jitter for "Too Many Requests" errors without 429 status
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
      // Exponential backoff with jitter for exceptions containing rate limit messages
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
async function updateAirtableRecord(recordId, imageUrl) {
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
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    console.log(`Record ${recordId} updated successfully`);
    return await response.json();
  } catch (error) {
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
    
    return true;
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    return false;
  }
}

/**
 * Process a small batch of records
 */
async function processBatch(records) {
  // Find records that need processing
  const recordsToProcess = findRecordsToProcess(records);
  
  if (recordsToProcess.length === 0) {
    console.log('No more records to process!');
    return 0;
  }
  
  // Process just a small batch
  const batchToProcess = recordsToProcess.slice(0, MAX_BATCH_SIZE);
  console.log(`Found ${recordsToProcess.length} records left to process, processing batch of ${batchToProcess.length}`);
  
  let processed = 0;
  
  // Process each record in the batch sequentially (not in parallel)
  for (const record of batchToProcess) {
    const success = await processRecord(record);
    if (success) {
      processed++;
    }
    
    // Add a significant delay between records to respect rate limits
    if (processed < batchToProcess.length) {
      console.log(`Waiting ${UPLOAD_DELAY / 1000} seconds before processing next record...`);
      await sleep(UPLOAD_DELAY);
    }
  }
  
  return processed;
}

/**
 * Main migration function
 */
async function migrateWithRateLimits() {
  console.log('Starting migration of Airtable MainImage attachments to MainImageLink fields');
  console.log(`Using conservative rate limits: ${IMGUR_UPLOADS_PER_HOUR} uploads per hour (1 every ${Math.ceil(UPLOAD_DELAY/1000)} seconds)`);
  
  // Load existing progress if available
  await loadProgress();
  
  // Fetch all records from Airtable
  const records = await fetchAirtableRecords();
  
  // Update progress with total count if not already set
  if (!progress.totalRecords) {
    progress.totalRecords = records.length;
    await saveProgress();
  }
  
  // Process a small batch
  const processed = await processBatch(records);
  
  // Calculate remaining records
  const remaining = records.length - progress.processedRecords.length;
  
  console.log(`\nBatch completed!`);
  console.log(`Total records: ${records.length}`);
  console.log(`Records processed in this batch: ${processed}`);
  console.log(`Total records processed so far: ${progress.processedRecords.length}`);
  console.log(`Remaining records: ${remaining}`);
  console.log(`Completion percentage: ${Math.round(progress.processedRecords.length / records.length * 100)}%`);
  
  if (remaining > 0) {
    // Estimate time to completion
    const timePerRecord = UPLOAD_DELAY / 1000; // seconds
    const estimatedSecondsRemaining = remaining * timePerRecord;
    const estimatedHours = Math.floor(estimatedSecondsRemaining / 3600);
    const estimatedMinutes = Math.floor((estimatedSecondsRemaining % 3600) / 60);
    
    console.log(`\nEstimated time to complete migration: ${estimatedHours} hours and ${estimatedMinutes} minutes`);
    console.log(`Run this script again to process the next batch.`);
  } else {
    console.log(`\nAll records have been processed! Migration completed!`);
  }
}

// Run the migration
migrateWithRateLimits().catch(error => {
  console.error('Migration failed:', error);
});