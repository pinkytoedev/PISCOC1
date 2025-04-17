/**
 * Test script to check the available field names in the Airtable table
 * This helps identify the exact field names we can use for image links
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function checkAirtableFields() {
  try {
    // Get the Airtable API key and base ID from environment variables
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a';
    const tableName = process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno';
    
    // Sample record ID - replace with a valid record ID from your table
    const recordId = process.env.AIRTABLE_SAMPLE_RECORD_ID || 'recO1tZsszSOPbfwe';
    
    if (!apiKey) {
      throw new Error('AIRTABLE_API_KEY environment variable is required');
    }
    
    console.log(`Using Base ID: ${baseId}`);
    console.log(`Using Table Name: ${tableName}`);
    console.log(`Sample Record ID: ${recordId}`);
    
    // First, just get a single record to see all available fields
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    console.log(`Fetching Airtable record from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log('\n==== RECORD STRUCTURE ====');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n==== AVAILABLE FIELDS ====');
    const fields = Object.keys(data.fields);
    fields.forEach(field => {
      const value = data.fields[field];
      const valueType = Array.isArray(value) ? 
        `Array[${value.length}]${value.length > 0 ? ` (${typeof value[0]})` : ''}` : 
        typeof value;
      
      console.log(`- ${field}: ${valueType}`);
    });
    
    // Test exact field names for our image link fields
    const testFields = [
      'MainImage', 
      'MainImageLink', 
      'Main Image Link',
      'ImageLink',
      'Image Link',
      'instaPhoto', 
      'InstaPhotoLink',
      'Insta Photo Link'
    ];
    
    console.log('\n==== FIELD NAME TESTS ====');
    testFields.forEach(field => {
      if (field in data.fields) {
        console.log(`✓ '${field}' exists in the record`);
      } else {
        console.log(`✗ '${field}' does NOT exist in the record`);
      }
    });
    
  } catch (error) {
    console.error('Error checking Airtable fields:', error);
  }
}

// Run the check
checkAirtableFields();