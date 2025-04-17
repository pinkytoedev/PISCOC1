/**
 * Migrate Airtable Attachment Images to Link Fields
 * 
 * This script:
 * 1. Fetches all article records from Airtable
 * 2. For each record with a MainImage attachment, it:
 *    - Gets the attachment URL
 *    - Uploads the image to Imgur to get a new link
 *    - Updates the record with the new link in MainImageLink field
 * 3. Similarly processes instaPhoto attachments and updates InstaPhotoLink field
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Configuration from environment or defaults
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;

if (!AIRTABLE_API_KEY) {
  console.error('Error: AIRTABLE_API_KEY environment variable is required');
  process.exit(1);
}

if (!IMGUR_CLIENT_ID) {
  console.error('Error: IMGUR_CLIENT_ID environment variable is required');
  process.exit(1);
}

// Stats for tracking migration progress
const stats = {
  total: 0,
  mainImageProcessed: 0,
  instaPhotoProcessed: 0,
  errors: 0,
  skipped: 0
};

/**
 * Fetch all records from Airtable
 */
async function fetchAirtableRecords() {
  console.log(`Fetching records from Airtable base ${AIRTABLE_BASE_ID}, table ${AIRTABLE_TABLE_NAME}`);
  
  let records = [];
  let offset = null;
  
  do {
    // Build URL with offset if we have one
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?pageSize=100`;
    if (offset) {
      url += `&offset=${offset}`;
    }
    
    // Make the request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    records = records.concat(data.records);
    offset = data.offset;
    
    console.log(`Fetched ${data.records.length} records, total: ${records.length}`);
    
  } while (offset);
  
  stats.total = records.length;
  return records;
}

/**
 * Upload an image URL to Imgur
 */
async function uploadImageToImgur(imageUrl) {
  console.log(`Uploading to Imgur: ${imageUrl}`);
  
  const formData = new FormData();
  formData.append('image', imageUrl);
  formData.append('type', 'url');
  
  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Imgur API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`Imgur upload successful: ${data.data.link}`);
  
  return data.data.link;
}

/**
 * Update an Airtable record with new image link
 */
async function updateAirtableRecord(recordId, updates) {
  console.log(`Updating Airtable record ${recordId} with new image links`);
  
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: updates })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable API update error: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Process a single record
 */
async function processRecord(record) {
  console.log(`\nProcessing record: ${record.id} - ${record.fields.Name || '(No Name)'}`);
  
  const updates = {};
  
  // Process MainImage attachment if it exists
  if (record.fields.MainImage && record.fields.MainImage.length > 0) {
    try {
      const attachment = record.fields.MainImage[0];
      let imageUrl;
      
      // Get the best available URL from the attachment
      if (attachment.url) {
        imageUrl = attachment.url;
      } else if (attachment.thumbnails && attachment.thumbnails.full) {
        imageUrl = attachment.thumbnails.full.url;
      } else if (attachment.thumbnails && attachment.thumbnails.large) {
        imageUrl = attachment.thumbnails.large.url;
      } else {
        console.warn(`No usable URL found in MainImage attachment for record ${record.id}`);
        stats.skipped++;
        return;
      }
      
      // Upload to Imgur
      const imgurUrl = await uploadImageToImgur(imageUrl);
      
      // Add to updates
      updates.MainImageLink = imgurUrl;
      stats.mainImageProcessed++;
      
    } catch (error) {
      console.error(`Error processing MainImage for record ${record.id}:`, error);
      stats.errors++;
    }
  }
  
  // Process instaPhoto attachment if it exists
  if (record.fields.instaPhoto && record.fields.instaPhoto.length > 0) {
    try {
      const attachment = record.fields.instaPhoto[0];
      let imageUrl;
      
      // Get the best available URL from the attachment
      if (attachment.url) {
        imageUrl = attachment.url;
      } else if (attachment.thumbnails && attachment.thumbnails.full) {
        imageUrl = attachment.thumbnails.full.url;
      } else if (attachment.thumbnails && attachment.thumbnails.large) {
        imageUrl = attachment.thumbnails.large.url;
      } else {
        console.warn(`No usable URL found in instaPhoto attachment for record ${record.id}`);
        return;
      }
      
      // Upload to Imgur
      const imgurUrl = await uploadImageToImgur(imageUrl);
      
      // Add to updates
      updates.InstaPhotoLink = imgurUrl;
      stats.instaPhotoProcessed++;
      
    } catch (error) {
      console.error(`Error processing instaPhoto for record ${record.id}:`, error);
      stats.errors++;
    }
  }
  
  // If we have updates to make, update the record
  if (Object.keys(updates).length > 0) {
    try {
      console.log(`Updating record ${record.id} with:`, updates);
      await updateAirtableRecord(record.id, updates);
      console.log(`Record ${record.id} updated successfully`);
    } catch (error) {
      console.error(`Error updating record ${record.id}:`, error);
      stats.errors++;
    }
  } else {
    console.log(`No updates needed for record ${record.id}`);
    stats.skipped++;
  }
}

/**
 * Main migration function
 */
async function migrateAttachmentsToLinks() {
  console.log('Starting migration of Airtable attachment images to link fields');
  
  try {
    // Fetch all records from Airtable
    const records = await fetchAirtableRecords();
    console.log(`Found ${records.length} records to process`);
    
    // Process records with a small delay between each to avoid rate limits
    for (let i = 0; i < records.length; i++) {
      console.log(`\nProcessing record ${i+1} of ${records.length}`);
      await processRecord(records[i]);
      
      // Add a small delay between records to avoid hitting rate limits
      if (i < records.length - 1) {
        console.log('Waiting 1 second before processing next record...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Print final stats
    console.log('\n== MIGRATION COMPLETE ==');
    console.log(`Total records: ${stats.total}`);
    console.log(`MainImage fields processed: ${stats.mainImageProcessed}`);
    console.log(`instaPhoto fields processed: ${stats.instaPhotoProcessed}`);
    console.log(`Records skipped (no attachments): ${stats.skipped}`);
    console.log(`Errors encountered: ${stats.errors}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateAttachmentsToLinks();