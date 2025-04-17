/**
 * Migration Script for Airtable MainImage Attachments to MainImageLink Field
 * Optimized for handling small batches within rate limits
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
const PROGRESS_FILE = './migration-small-batch.json';
const BATCH_SIZE = 2; // Number of records to process per run

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
  lastProcessedIndex: -1,
  totalRecords: 0
};

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
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload an image URL to Imgur with exponential backoff for rate limits
 */
async function uploadImageToImgur(imageUrl, retryCount = 0) {
  const MAX_RETRIES = 5;
  const BASE_DELAY = 60000; // Start with 1 minute delay
  
  try {
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
    
    // Handle rate limiting
    if (response.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`Rate limited by Imgur. Waiting ${delay/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        console.log(`Retrying upload (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        return uploadImageToImgur(imageUrl, retryCount + 1);
      } else {
        throw new Error(`Imgur rate limit exceeded after ${MAX_RETRIES} retries`);
      }
    }
    
    if (!response.ok || !data.success) {
      // If we get an error that looks like rate limiting but doesn't have 429 status
      if (JSON.stringify(data).includes('Too Many Requests') && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`Rate limited by Imgur (from error). Waiting ${delay/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        console.log(`Retrying upload (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        return uploadImageToImgur(imageUrl, retryCount + 1);
      } else {
        throw new Error(`Imgur API error: ${JSON.stringify(data)}`);
      }
    }
    
    console.log(`Imgur upload successful: ${data.data.link}`);
    return data.data.link;
  } catch (error) {
    // Check if the error message contains rate limit indicators
    if (error.message.includes('Too Many Requests') && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      console.log(`Rate limited by Imgur (from exception). Waiting ${delay/1000} seconds before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(delay);
      console.log(`Retrying upload (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
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
 * Process a single record
 */
async function processRecord(record, index) {
  const recordId = record.id;
  
  // Skip if we've already processed this record
  if (progress.processedRecords.includes(recordId)) {
    console.log(`Skipping record ${recordId} (already processed)`);
    return false;
  }
  
  try {
    console.log(`\nProcessing record ${index + 1} of ${progress.totalRecords}\n`);
    
    const title = record.fields.Name || 'Untitled';
    console.log(`Processing record: ${recordId} - ${title}`);
    
    // Process MainImage if it exists
    if (record.fields.MainImage && record.fields.MainImage.length > 0) {
      const mainImage = record.fields.MainImage[0];
      const mainImageUrl = mainImage.url;
      
      // Upload to Imgur
      const imgurLink = await uploadImageToImgur(mainImageUrl);
      
      // Update Airtable record with new link
      await updateAirtableRecord(recordId, imgurLink);
      
      // Mark record as processed
      progress.processedRecords.push(recordId);
      progress.lastProcessedIndex = index;
      await saveProgress();
      
      return true;
    } else {
      console.log(`No MainImage attachment for record ${recordId}`);
      
      // Mark record as processed even though there was no image
      progress.processedRecords.push(recordId);
      progress.lastProcessedIndex = index;
      await saveProgress();
      
      return true;
    }
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    return false;
  }
}

/**
 * Process a small batch of records
 */
async function processSmallBatch(records) {
  let startIndex = progress.lastProcessedIndex + 1;
  let processed = 0;
  
  // Process up to BATCH_SIZE records
  for (let i = 0; i < BATCH_SIZE && startIndex + i < records.length; i++) {
    const recordIndex = startIndex + i;
    const success = await processRecord(records[recordIndex], recordIndex);
    
    if (success) {
      processed++;
    }
    
    // Add delay between records to avoid rate limiting
    if (i < BATCH_SIZE - 1 && startIndex + i + 1 < records.length) {
      console.log('Waiting 10 seconds before next record...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  return processed;
}

/**
 * Main migration function
 */
async function migrateSmallBatch() {
  console.log('Starting small batch migration of Airtable MainImage attachments to MainImageLink fields');
  
  // Load existing progress if available
  await loadProgress();
  
  // Fetch all records from Airtable
  const records = await fetchAirtableRecords();
  
  // Update progress with total count if not already set
  if (!progress.totalRecords) {
    progress.totalRecords = records.length;
    await saveProgress();
  }
  
  console.log(`Found ${records.length} records, processing up to ${BATCH_SIZE} records in this batch`);
  
  // Process small batch
  const processed = await processSmallBatch(records);
  
  console.log(`\nSmall batch completed!`);
  console.log(`Total records: ${records.length}`);
  console.log(`Records processed in this batch: ${processed}`);
  console.log(`Total records processed so far: ${progress.processedRecords.length}`);
  console.log(`Completion percentage: ${Math.round(progress.processedRecords.length / records.length * 100)}%`);
}

// Run the migration
migrateSmallBatch().catch(error => {
  console.error('Migration failed:', error);
});