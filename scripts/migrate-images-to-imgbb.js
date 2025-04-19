/**
 * Migration Script: Airtable MainImage to ImgBB Upload
 * 
 * This script automates the process of:
 * 1. Fetching articles with MainImage attachments from Airtable
 * 2. Uploading the images to ImgBB
 * 3. Updating the MainImageLink field in Airtable with the ImgBB URL
 * 
 * Run with: node scripts/migrate-images-to-imgbb.js
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { storage } from '../server/storage.js'; // This path might need adjustment
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration tracking
let migrationProgress = {
  processedRecords: [],
  totalRecords: 0,
  uploadTimestamps: [],
  errors: []
};

// Store migration progress in a file so it persists between script runs
const PROGRESS_FILE = path.join(__dirname, '..', 'data', 'imgbb-migration-progress.json');

// Function to save migration progress
function saveMigrationProgress() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(migrationProgress, null, 2));
    console.log('Migration progress saved');
  } catch (error) {
    console.error('Failed to save migration progress:', error);
  }
}

// Function to load migration progress
function loadMigrationProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      migrationProgress = JSON.parse(data);
      console.log(`Loaded existing migration progress: ${migrationProgress.processedRecords.length}/${migrationProgress.totalRecords} processed`);
    } else {
      console.log('No existing migration progress found, starting fresh');
    }
  } catch (error) {
    console.error('Failed to load migration progress:', error);
  }
}

// Function to get ImgBB API key
async function getImgBBSettings() {
  try {
    const apiKeySetting = await storage.getIntegrationSettingByKey('imgbb', 'apiKey');
    const enabledSetting = await storage.getIntegrationSettingByKey('imgbb', 'enabled');
    
    return {
      apiKey: apiKeySetting?.value || process.env.IMGBB_API_KEY,
      enabled: enabledSetting?.value === 'true' || process.env.IMGBB_ENABLED === 'true'
    };
  } catch (error) {
    console.error('Error getting ImgBB settings:', error);
    return { apiKey: null, enabled: false };
  }
}

// Function to get Airtable API Key and Base ID
async function getAirtableSettings() {
  try {
    const apiKeySetting = await storage.getIntegrationSettingByKey('airtable', 'apiKey');
    const baseIdSetting = await storage.getIntegrationSettingByKey('airtable', 'baseId');
    const tableNameSetting = await storage.getIntegrationSettingByKey('airtable', 'tableName');
    
    return {
      apiKey: apiKeySetting?.value || process.env.AIRTABLE_API_KEY,
      baseId: baseIdSetting?.value || process.env.AIRTABLE_BASE_ID,
      tableName: tableNameSetting?.value || process.env.AIRTABLE_TABLE_NAME || 'Articles'
    };
  } catch (error) {
    console.error('Error getting Airtable settings:', error);
    return { apiKey: null, baseId: null, tableName: 'Articles' };
  }
}

// Function to upload an image from URL to ImgBB
async function uploadImageUrlToImgBB(imageUrl, filename, apiKey) {
  try {
    console.log(`Uploading image URL to ImgBB: ${imageUrl}`);
    
    // Create form data for the request
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', imageUrl);
    formData.append('name', filename);
    
    // Make API request to ImgBB
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`ImgBB URL upload failed: ${response.status} ${await response.text()}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`ImgBB URL upload failed: ${JSON.stringify(result)}`);
    }
    
    // Return the ImgBB response data
    return result.data;
  } catch (error) {
    console.error('Error in uploadImageUrlToImgBB:', error);
    return null;
  }
}

// Function to update Airtable record with ImgBB URL in MainImageLink field
async function updateAirtableMainImageLink(recordId, imageUrl, airtableSettings) {
  try {
    console.log(`Updating Airtable record ${recordId} MainImageLink with URL: ${imageUrl}`);
    
    const url = `https://api.airtable.com/v0/${airtableSettings.baseId}/${encodeURIComponent(airtableSettings.tableName)}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${airtableSettings.apiKey}`,
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
      throw new Error(`Failed to update Airtable: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating Airtable MainImageLink:', error);
    return null;
  }
}

// Function to get MainImage attachment URL from Airtable record
function getAttachmentUrl(fields) {
  if (!fields.MainImage || !Array.isArray(fields.MainImage) || fields.MainImage.length === 0) {
    return null;
  }
  
  const attachment = fields.MainImage[0];
  
  // Try to get the URL from the attachment
  if (attachment.url) {
    return attachment.url;
  }
  
  // Try the thumbnails if direct URL not available
  if (attachment.thumbnails) {
    if (attachment.thumbnails.full) {
      return attachment.thumbnails.full.url;
    } else if (attachment.thumbnails.large) {
      return attachment.thumbnails.large.url;
    } else if (attachment.thumbnails.small) {
      return attachment.thumbnails.small.url;
    }
  }
  
  return null;
}

// Main migration function
async function migrateImagesToImgBB() {
  try {
    console.log('Starting migration of Airtable MainImage attachments to ImgBB');
    
    // Load existing migration progress
    loadMigrationProgress();
    
    // Get API keys
    const imgbbSettings = await getImgBBSettings();
    const airtableSettings = await getAirtableSettings();
    
    if (!imgbbSettings.apiKey || !imgbbSettings.enabled) {
      throw new Error('ImgBB API key is not configured or integration is disabled');
    }
    
    if (!airtableSettings.apiKey || !airtableSettings.baseId) {
      throw new Error('Airtable API key or base ID is not configured');
    }
    
    console.log('Fetching articles from Airtable...');
    
    // Fetch records from Airtable with pagination support
    let allRecords = [];
    let offset = null;
    
    do {
      // Build URL with offset if we have one
      let url = `https://api.airtable.com/v0/${airtableSettings.baseId}/${encodeURIComponent(airtableSettings.tableName)}`;
      if (offset) {
        url += `?offset=${offset}`;
      }
      
      console.log(`Fetching records from Airtable${offset ? ' with offset' : ''}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${airtableSettings.apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch records from Airtable: ${response.status} ${await response.text()}`);
      }
      
      const data = await response.json();
      
      // Add records to our collection
      allRecords = [...allRecords, ...data.records];
      
      // Get the offset for the next page (if any)
      offset = data.offset || null;
      
      console.log(`Fetched ${data.records.length} records${offset ? ', more pages available' : ''}`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } while (offset);
    
    console.log(`Total records fetched: ${allRecords.length}`);
    
    // Filter records with MainImage attachments
    const recordsWithAttachments = allRecords.filter(record => 
      record.fields.MainImage && 
      Array.isArray(record.fields.MainImage) && 
      record.fields.MainImage.length > 0
    );
    
    console.log(`Found ${recordsWithAttachments.length} records with MainImage attachments`);
    
    // Skip records already processed
    const recordsToProcess = recordsWithAttachments.filter(record => 
      !migrationProgress.processedRecords.includes(record.id)
    );
    
    console.log(`${recordsToProcess.length} records need processing`);
    
    // Update migration progress
    migrationProgress.totalRecords = recordsWithAttachments.length;
    saveMigrationProgress();
    
    // Process each record
    for (const record of recordsToProcess) {
      try {
        console.log(`Processing record ${record.id}: ${record.fields.Title || 'Untitled'}`);
        
        // Get attachment URL
        const attachmentUrl = getAttachmentUrl(record.fields);
        
        if (!attachmentUrl) {
          console.warn(`No valid attachment URL found for record ${record.id}`);
          
          migrationProgress.errors.push({
            recordId: record.id,
            title: record.fields.Title || 'Untitled',
            error: 'No valid attachment URL found'
          });
          
          saveMigrationProgress();
          continue;
        }
        
        // Generate filename from record title or ID
        const filename = `${record.fields.Title ? record.fields.Title.replace(/[^a-zA-Z0-9]/g, '-') : record.id}.jpg`;
        
        console.log(`Uploading image '${filename}' to ImgBB...`);
        
        // Upload to ImgBB
        const imgbbResult = await uploadImageUrlToImgBB(attachmentUrl, filename, imgbbSettings.apiKey);
        
        if (!imgbbResult) {
          console.error(`Failed to upload image to ImgBB for record ${record.id}`);
          
          migrationProgress.errors.push({
            recordId: record.id,
            title: record.fields.Title || 'Untitled',
            error: 'Failed to upload to ImgBB'
          });
          
          saveMigrationProgress();
          continue;
        }
        
        console.log(`Successfully uploaded to ImgBB: ${imgbbResult.url}`);
        
        // Update Airtable with ImgBB URL
        const airtableResult = await updateAirtableMainImageLink(
          record.id,
          imgbbResult.url,
          airtableSettings
        );
        
        if (!airtableResult) {
          console.error(`Failed to update Airtable MainImageLink for record ${record.id}`);
          
          migrationProgress.errors.push({
            recordId: record.id,
            title: record.fields.Title || 'Untitled',
            error: 'Failed to update Airtable MainImageLink'
          });
          
          saveMigrationProgress();
          continue;
        }
        
        console.log(`Successfully updated Airtable MainImageLink for record ${record.id}`);
        
        // Update progress
        migrationProgress.processedRecords.push(record.id);
        migrationProgress.uploadTimestamps.push(Date.now());
        saveMigrationProgress();
        
        // Sleep for a short time to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        
        migrationProgress.errors.push({
          recordId: record.id,
          title: record.fields.Title || 'Untitled',
          error: error.message || String(error)
        });
        
        saveMigrationProgress();
      }
    }
    
    console.log('Migration completed');
    console.log(`Processed ${migrationProgress.processedRecords.length}/${migrationProgress.totalRecords} records`);
    console.log(`Errors: ${migrationProgress.errors.length}`);
    
    return {
      success: migrationProgress.errors.length === 0,
      processed: migrationProgress.processedRecords.length,
      total: migrationProgress.totalRecords,
      errors: migrationProgress.errors
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

// Run the migration
migrateImagesToImgBB()
  .then(result => {
    console.log('Migration result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });