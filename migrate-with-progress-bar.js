/**
 * Migration Script for Airtable MainImage Attachments to MainImageLink Field
 * With visual progress bar and status display
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import FormData from 'form-data';
import ProgressBar from 'progress';

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;
const PROGRESS_FILE = './migration-with-progress-bar.json';

// Imgur rate limit settings
// API limit is 1250 uploads per day or about 50 per hour
// We'll be more conservative with 10 per hour (1 every 6 minutes)
const IMGUR_UPLOADS_PER_HOUR = 10; 
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const UPLOAD_DELAY = Math.ceil(MILLISECONDS_PER_HOUR / IMGUR_UPLOADS_PER_HOUR);
const MAX_BATCH_SIZE = 5; // Process up to 5 records per run

// Progress bar instances
let overallProgressBar = null;
let currentBatchProgressBar = null;
let statusBar = null;

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
  currentStatus: 'Initializing', // Current status message
  errors: [] // Track errors for reporting
};

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update the status message
 */
function updateStatus(message) {
  progress.currentStatus = message;
  
  // Clear the current line and print the status
  process.stdout.write('\r\x1b[K'); // Clear the current line
  process.stdout.write(`\x1b[36m[Status]\x1b[0m ${message}`);
  
  // If we have a progress bar, render it on the next line
  if (currentBatchProgressBar) {
    process.stdout.write('\n');
    currentBatchProgressBar.render();
  }
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
 * Initialize the progress bars
 */
function initializeProgressBars(totalRecords, batchSize) {
  // Overall progress bar
  overallProgressBar = new ProgressBar('Total Progress [:bar] :current/:total (:percent) ETA: :eta s', {
    complete: '=',
    incomplete: ' ',
    width: 30,
    total: totalRecords
  });
  
  // Update with current progress
  overallProgressBar.tick(progress.processedRecords.length);
  
  // Batch progress bar
  currentBatchProgressBar = new ProgressBar('Current Batch [:bar] :current/:total (:percent)', {
    complete: '=',
    incomplete: ' ',
    width: 30,
    total: batchSize
  });
  
  console.log(''); // Add some spacing
}

/**
 * Fetch all records from Airtable
 */
async function fetchAirtableRecords() {
  updateStatus('Fetching records from Airtable...');
  
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
      updateStatus(`Rate limit reached. Waiting ${delaySeconds} seconds before next upload...`);
      
      // Setup a progress bar for the rate limit wait
      const waitBar = new ProgressBar('Rate Limit Wait [:bar] :current/:total seconds', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: delaySeconds
      });
      
      // Update the progress bar every second
      for (let i = 0; i < delaySeconds; i++) {
        await sleep(1000);
        waitBar.tick(1);
      }
      
      console.log(''); // Add spacing after wait is complete
    }
    
    updateStatus(`Uploading to Imgur: ${imageUrl}`);
    
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
        const delaySeconds = Math.ceil(delay/1000);
        
        updateStatus(`Rate limited by Imgur. Waiting ${delaySeconds} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        
        // Setup a progress bar for the retry wait
        const retryWaitBar = new ProgressBar('Retry Wait [:bar] :current/:total seconds', {
          complete: '=',
          incomplete: ' ',
          width: 30,
          total: delaySeconds
        });
        
        // Update the progress bar every second
        for (let i = 0; i < delaySeconds; i++) {
          await sleep(1000);
          retryWaitBar.tick(1);
        }
        
        console.log(''); // Add spacing after wait is complete
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
        const delaySeconds = Math.ceil(delay/1000);
        
        updateStatus(`Rate limited by Imgur (from error message). Waiting ${delaySeconds} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        
        // Setup a progress bar for the retry wait
        const retryWaitBar = new ProgressBar('Retry Wait [:bar] :current/:total seconds', {
          complete: '=',
          incomplete: ' ',
          width: 30,
          total: delaySeconds
        });
        
        // Update the progress bar every second
        for (let i = 0; i < delaySeconds; i++) {
          await sleep(1000);
          retryWaitBar.tick(1);
        }
        
        console.log(''); // Add spacing after wait is complete
        return uploadImageToImgur(imageUrl, retryCount + 1);
      } else {
        throw new Error(`Imgur API error: ${JSON.stringify(data)}`);
      }
    }
    
    // Record this successful upload in our rate limit tracker
    recordUpload();
    
    updateStatus(`Imgur upload successful: ${data.data.link}`);
    return data.data.link;
  } catch (error) {
    if (error.message && error.message.includes('Too Many Requests') && retryCount < MAX_RETRIES) {
      // Exponential backoff with jitter for exceptions containing rate limit messages
      const baseDelay = 60000; // 1 minute
      const exponentialDelay = baseDelay * Math.pow(2, retryCount);
      const jitter = Math.random() * 5000; // Add up to 5 seconds of jitter
      const delay = exponentialDelay + jitter;
      const delaySeconds = Math.ceil(delay/1000);
      
      updateStatus(`Rate limited by Imgur (from exception). Waiting ${delaySeconds} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      
      // Setup a progress bar for the retry wait
      const retryWaitBar = new ProgressBar('Retry Wait [:bar] :current/:total seconds', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: delaySeconds
      });
      
      // Update the progress bar every second
      for (let i = 0; i < delaySeconds; i++) {
        await sleep(1000);
        retryWaitBar.tick(1);
      }
      
      console.log(''); // Add spacing after wait is complete
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
    updateStatus(`Updating Airtable record ${recordId} with MainImageLink: ${imageUrl}`);
    
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
    
    updateStatus(`Record ${recordId} updated successfully`);
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
    updateStatus(`Processing: ${title}`);
    
    const mainImage = record.fields.MainImage[0];
    const mainImageUrl = mainImage.url;
    
    // Upload to Imgur
    const imgurLink = await uploadImageToImgur(mainImageUrl);
    
    // Update Airtable record with new link
    await updateAirtableRecord(recordId, imgurLink);
    
    // Mark record as processed
    progress.processedRecords.push(recordId);
    await saveProgress();
    
    // Update progress bars
    if (overallProgressBar) overallProgressBar.tick(1);
    if (currentBatchProgressBar) currentBatchProgressBar.tick(1);
    
    return true;
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    progress.errors.push({
      recordId,
      title: record.fields.Name || 'Untitled',
      error: error.message
    });
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
    updateStatus('No more records to process!');
    return 0;
  }
  
  // Process just a small batch
  const batchToProcess = recordsToProcess.slice(0, MAX_BATCH_SIZE);
  console.log(`Found ${recordsToProcess.length} records left to process, processing batch of ${batchToProcess.length}`);
  
  // Initialize progress bars
  initializeProgressBars(records.length, batchToProcess.length);
  
  let processed = 0;
  
  // Process each record in the batch sequentially (not in parallel)
  for (const record of batchToProcess) {
    const success = await processRecord(record);
    if (success) {
      processed++;
    }
    
    // Add a significant delay between records to respect rate limits
    if (processed < batchToProcess.length) {
      const delaySeconds = Math.ceil(UPLOAD_DELAY / 1000);
      updateStatus(`Waiting ${delaySeconds} seconds before processing next record...`);
      
      // Setup a progress bar for the between-record wait
      const waitBar = new ProgressBar('Wait [:bar] :current/:total seconds', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: delaySeconds
      });
      
      // Update the progress bar every second
      for (let i = 0; i < delaySeconds; i++) {
        await sleep(1000);
        waitBar.tick(1);
      }
      
      console.log(''); // Add spacing after wait is complete
    }
  }
  
  return processed;
}

/**
 * Display a summary of the migration
 */
function displayMigrationSummary(records, processed) {
  console.log('\n===== MIGRATION SUMMARY =====');
  
  // Calculate progress statistics
  const totalRecords = records.length;
  const processedTotal = progress.processedRecords.length;
  const remaining = totalRecords - processedTotal;
  const percentage = Math.round((processedTotal / totalRecords) * 100);
  
  // Create a visual progress bar
  const barWidth = 30;
  const completeChars = Math.round((processedTotal / totalRecords) * barWidth);
  const bar = '█'.repeat(completeChars) + '░'.repeat(barWidth - completeChars);
  
  console.log(`Progress: ${bar} ${percentage}%`);
  console.log(`Total Records: ${totalRecords}`);
  console.log(`Processed in this batch: ${processed}`);
  console.log(`Total Processed: ${processedTotal}`);
  console.log(`Remaining: ${remaining}`);
  
  // If there are errors, display them
  if (progress.errors.length > 0) {
    console.log('\n===== ERRORS =====');
    progress.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.title} (${error.recordId}): ${error.error}`);
    });
  }
  
  // Estimate time to completion
  if (remaining > 0) {
    const timePerRecord = UPLOAD_DELAY / 1000; // seconds
    const estimatedSecondsRemaining = remaining * timePerRecord;
    const estimatedHours = Math.floor(estimatedSecondsRemaining / 3600);
    const estimatedMinutes = Math.floor((estimatedSecondsRemaining % 3600) / 60);
    
    console.log('\n===== ESTIMATED TIME TO COMPLETION =====');
    console.log(`Estimated time: ${estimatedHours} hours and ${estimatedMinutes} minutes`);
    console.log(`Expected completion: ${new Date(Date.now() + estimatedSecondsRemaining * 1000).toLocaleString()}`);
    console.log('\nRun this script again to process the next batch.');
  } else {
    console.log('\n✅ All records have been processed! Migration completed!');
  }
}

/**
 * Main migration function
 */
async function migrateWithProgressBar() {
  console.log('======================================');
  console.log('AIRTABLE IMAGE MIGRATION WITH PROGRESS BAR');
  console.log('======================================');
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
  
  // Display a summary of the migration
  displayMigrationSummary(records, processed);
}

// Run the migration
migrateWithProgressBar().catch(error => {
  console.error('Migration failed:', error);
});