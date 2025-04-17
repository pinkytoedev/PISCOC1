/**
 * Resumable Migration Script for Airtable Attachment Images to Link Fields
 * 
 * This script:
 * 1. Fetches all article records from Airtable
 * 2. Maintains progress in a local JSON file
 * 3. For each record with a MainImage attachment, it:
 *    - Gets the attachment URL
 *    - Uploads the image to Imgur to get a new link
 *    - Updates the record with the new link in MainImageLink field
 * 4. Similarly processes instaPhoto attachments and updates InstaPhotoLink field
 * 5. Can be stopped and resumed at any point
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
const PROGRESS_FILE = './migration-progress.json';
const DELAY_BETWEEN_RECORDS = 1000; // 1 second delay between processing records

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
  recordsProcessed: {}, // Map of recordId -> {mainImage: boolean, instaPhoto: boolean}
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
async function updateAirtableRecord(recordId, updates) {
  try {
    console.log(`Updating Airtable record ${recordId} with new image links`);
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: updates
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
  
  // Skip if we've already fully processed this record
  if (progress.recordsProcessed[recordId] && 
      progress.recordsProcessed[recordId].mainImage && 
      progress.recordsProcessed[recordId].instaPhoto) {
    console.log(`Skipping record ${recordId} (already processed)`);
    return;
  }
  
  try {
    console.log(`\nProcessing record ${index + 1} of ${progress.totalRecords}\n`);
    
    // Initialize record tracking if not exists
    if (!progress.recordsProcessed[recordId]) {
      progress.recordsProcessed[recordId] = {
        mainImage: false,
        instaPhoto: false
      };
    }
    
    const title = record.fields.Name || 'Untitled';
    console.log(`Processing record: ${recordId} - ${title}`);
    
    const updates = {};
    
    // Process MainImage if it exists and hasn't been processed yet
    if (record.fields.MainImage && 
        record.fields.MainImage.length > 0 && 
        !progress.recordsProcessed[recordId].mainImage) {
      
      const mainImage = record.fields.MainImage[0];
      const mainImageUrl = mainImage.url;
      
      // Upload to Imgur
      const imgurLink = await uploadImageToImgur(mainImageUrl);
      updates.MainImageLink = imgurLink;
      
      // Mark MainImage as processed for this record
      progress.recordsProcessed[recordId].mainImage = true;
    }
    
    // Process instaPhoto if it exists and hasn't been processed yet
    if (record.fields.instaPhoto && 
        record.fields.instaPhoto.length > 0 && 
        !progress.recordsProcessed[recordId].instaPhoto) {
      
      const instaPhoto = record.fields.instaPhoto[0];
      const instaPhotoUrl = instaPhoto.url;
      
      // Upload to Imgur
      const imgurLink = await uploadImageToImgur(instaPhotoUrl);
      updates.InstaPhotoLink = imgurLink;
      
      // Mark instaPhoto as processed for this record
      progress.recordsProcessed[recordId].instaPhoto = true;
    }
    
    // Only update if we have changes to make
    if (Object.keys(updates).length > 0) {
      console.log(`Updating record ${recordId} with:`, updates);
      await updateAirtableRecord(recordId, updates);
      progress.successfulRecords++;
    } else {
      console.log(`No image attachments to process for record ${recordId}`);
    }
    
    progress.processedRecords++;
    progress.lastProcessedIndex = index;
    await saveProgress();
    
  } catch (error) {
    console.error(`Error processing record ${recordId}:`, error);
    
    // Track the error
    progress.errors.push({
      recordId,
      error: error.message
    });
    
    progress.failedRecords++;
    progress.processedRecords++;
    progress.lastProcessedIndex = index;
    await saveProgress();
  }
}

/**
 * Main migration function
 */
async function migrateAttachmentsToLinks() {
  console.log('Starting migration of Airtable attachment images to link fields');
  
  // Load existing progress if available
  const hasExistingProgress = await loadProgress();
  
  // Fetch all records from Airtable
  const records = await fetchAirtableRecords();
  
  // Update progress with total count
  progress.totalRecords = records.length;
  console.log(`Found ${records.length} records to process`);
  await saveProgress();
  
  // Process records sequentially, starting from where we left off
  const startIndex = hasExistingProgress ? progress.lastProcessedIndex + 1 : 0;
  
  for (let i = startIndex; i < records.length; i++) {
    await processRecord(records[i], i);
    
    // Add a delay between records to avoid rate limiting
    if (i < records.length - 1) {
      console.log(`Waiting ${DELAY_BETWEEN_RECORDS/1000} second before processing next record...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_RECORDS));
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