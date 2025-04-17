/**
 * Script to check the progress of MainImageLink migration
 * 
 * This script will:
 * 1. Fetch all article records from Airtable
 * 2. Check how many have MainImageLink field populated
 * 3. Compare with how many have MainImage attachment
 */

import 'dotenv/config';
import fetch from 'node-fetch';

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';

// Validation
if (!AIRTABLE_API_KEY) {
  console.error('Error: AIRTABLE_API_KEY environment variable is required');
  process.exit(1);
}

async function fetchAllRecords() {
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

async function checkMigrationProgress() {
  console.log('Checking migration progress...');
  
  try {
    const records = await fetchAllRecords();
    console.log(`Found ${records.length} total records`);
    
    let mainImageAttachmentCount = 0;
    let mainImageLinkCount = 0;
    let instaPhotoAttachmentCount = 0;
    let instaPhotoLinkCount = 0;
    
    // Check each record
    for (const record of records) {
      const fields = record.fields;
      
      // Check MainImage attachment
      if (fields.MainImage && Array.isArray(fields.MainImage) && fields.MainImage.length > 0) {
        mainImageAttachmentCount++;
      }
      
      // Check MainImageLink
      if (fields.MainImageLink && typeof fields.MainImageLink === 'string') {
        mainImageLinkCount++;
      }
      
      // Check instaPhoto attachment
      if (fields.instaPhoto && Array.isArray(fields.instaPhoto) && fields.instaPhoto.length > 0) {
        instaPhotoAttachmentCount++;
      }
      
      // Check InstaPhotoLink
      if (fields.InstaPhotoLink && typeof fields.InstaPhotoLink === 'string') {
        instaPhotoLinkCount++;
      }
    }
    
    console.log('\n=== MIGRATION PROGRESS ===');
    console.log(`Total Records: ${records.length}`);
    console.log('\nMainImage Migration:');
    console.log(`- Records with MainImage attachment: ${mainImageAttachmentCount}`);
    console.log(`- Records with MainImageLink field: ${mainImageLinkCount}`);
    console.log(`- Migration percentage: ${Math.round((mainImageLinkCount / Math.max(mainImageAttachmentCount, 1)) * 100)}%`);
    
    console.log('\ninstaPhoto Migration:');
    console.log(`- Records with instaPhoto attachment: ${instaPhotoAttachmentCount}`);
    console.log(`- Records with InstaPhotoLink field: ${instaPhotoLinkCount}`);
    console.log(`- Migration percentage: ${Math.round((instaPhotoLinkCount / Math.max(instaPhotoAttachmentCount, 1)) * 100)}%`);
    
  } catch (error) {
    console.error('Error checking migration progress:', error);
  }
}

// Run the progress check
checkMigrationProgress();