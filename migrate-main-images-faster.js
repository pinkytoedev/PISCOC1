/**
 * Migration Script for Airtable MainImage Attachments to MainImageLink Field
 * Optimized for faster processing with batch updates
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
const PROGRESS_FILE = './migration-main-progress-faster.json';
const DELAY_BETWEEN_RECORDS = 300; // 0.3 second delay between processing records
const BATCH_SIZE = 10; // Number of records to process in parallel
const BATCH_DELAY = 1000; // Delay between batches in milliseconds

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
  totalRecords: 0,
  processedRecords: 0,
  successfulRecords: 0,
  failedRecords: 0,
  lastProcessedIndex: -1,
  recordsProcessed: {}, // Map of recordId -> boolean
  errors: [] // Array of {recordId, error} objects
};

/**
 * Load progress from file if it exists
 */
async function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = await fs.readFile(PROGRESS_FILE, 'utf8');
      progress = JSON.parse(data);
      console.log(`Loaded existing progress: ${progress.processedRecords}/${progress.totalRecords} records processed`);
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
 * Upload an image URL to Imgur
 */
async function uploadImageToImgur(imageUrl) {
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
    
    if (!response.ok || !data.success) {
      throw new Error(`Imgur API error: ${JSON.stringify(data)}`);
    }
    
    console.log(`Imgur upload successful: ${data.data.link}`);
    return data.data.link;
  } catch (error) {
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
  if (progress.recordsProcessed[recordId]) {
    console.log(`Skipping record ${recordId} (already processed)`);
    return null; // Return null to indicate no processing was needed
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
      
      progress.successfulRecords++;
      
      // Mark record as processed
      progress.recordsProcessed[recordId] = true;
      progress.processedRecords++;
      
      return { recordId, success: true };
    } else {
      console.log(`No MainImage attachment for record ${recordId}`);
      
      // Mark record as processed even though there was no image
      progress.recordsProcessed[recordId] = true;
      progress.processedRecords++;
      
      return { recordId, success: false, reason: 'no-image' };
    }
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    
    // Track the error
    progress.errors.push({
      recordId,
      error: error.message
    });
    
    progress.failedRecords++;
    progress.processedRecords++;
    
    return { recordId, success: false, error: error.message };
  }
}

/**
 * Process a batch of records in parallel
 */
async function processBatch(records, startIndex) {
  const promises = [];
  
  for (let i = 0; i < BATCH_SIZE && startIndex + i < records.length; i++) {
    const recordIndex = startIndex + i;
    // Use a small delay between starting each record processing
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_RECORDS));
    promises.push(processRecord(records[recordIndex], recordIndex));
  }
  
  const results = await Promise.all(promises);
  
  // Update the last processed index
  progress.lastProcessedIndex = startIndex + BATCH_SIZE - 1;
  if (progress.lastProcessedIndex >= records.length) {
    progress.lastProcessedIndex = records.length - 1;
  }
  
  await saveProgress();
  
  return results.filter(r => r !== null); // Filter out null results (skipped records)
}

/**
 * Main migration function
 */
async function migrateAttachmentsToLinks() {
  console.log('Starting migration of Airtable MainImage attachments to MainImageLink field');
  
  // Load existing progress if available
  const hasExistingProgress = await loadProgress();
  
  // Fetch all records from Airtable
  const records = await fetchAirtableRecords();
  
  // Update progress with total count
  progress.totalRecords = records.length;
  console.log(`Found ${records.length} records to process`);
  await saveProgress();
  
  // Process records in batches, starting from where we left off
  const startIndex = hasExistingProgress ? progress.lastProcessedIndex + 1 : 0;
  
  for (let i = startIndex; i < records.length; i += BATCH_SIZE) {
    console.log(`\nProcessing batch starting at index ${i}`);
    const batchResults = await processBatch(records, i);
    
    console.log(`Batch completed. Results: ${batchResults.length} records processed`);
    console.log(`Waiting ${BATCH_DELAY/1000} seconds before next batch...`);
    
    // Add a delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < records.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log('\nMigration completed!');
  console.log(`Total records: ${progress.totalRecords}`);
  console.log(`Processed records: ${progress.processedRecords}`);
  console.log(`Successful updates: ${progress.successfulRecords}`);
  console.log(`Failed updates: ${progress.failedRecords}`);
  
  if (progress.errors.length > 0) {
    console.log('\nErrors encountered:');
    progress.errors.forEach(error => {
      console.log(`Record ${error.recordId}: ${error.error}`);
    });
  }
}

// Run the migration
migrateAttachmentsToLinks().catch(error => {
  console.error('Migration failed:', error);
});