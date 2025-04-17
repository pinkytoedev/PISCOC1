/**
 * Test script to verify the link field upload functionality
 */

import 'dotenv/config';
import fetch from 'node-fetch';

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';
// Using one of the record IDs we've already processed in the migration script
const TEST_RECORD_ID = 'rec0dBv2iMdSt2YS8';
const TEST_IMAGE_URL = 'https://i.imgur.com/test123.jpg';

async function testLinkFieldUpload() {
  try {
    console.log(`Testing link field upload with record ${TEST_RECORD_ID}`);

    // First, get the current record to see what fields it has
    const getUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${TEST_RECORD_ID}`;
    
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to get record: ${await getResponse.text()}`);
    }
    
    const record = await getResponse.json();
    console.log("Current fields:", Object.keys(record.fields));
    console.log("MainImageLink value:", record.fields.MainImageLink);
    
    // Now update the record with a new test image URL
    const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${TEST_RECORD_ID}`;
    const updateData = {
      fields: {
        MainImageLink: TEST_IMAGE_URL
      }
    };
    
    console.log(`Updating MainImageLink to: ${TEST_IMAGE_URL}`);
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!updateResponse.ok) {
      console.error("Error updating record:", await updateResponse.text());
      return;
    }
    
    const updatedRecord = await updateResponse.json();
    console.log("Update successful!");
    console.log("New MainImageLink value:", updatedRecord.fields.MainImageLink);
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testLinkFieldUpload();