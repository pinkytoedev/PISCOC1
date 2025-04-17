// Simple script to test Airtable fields for link-based image upload
// Run with node test-airtable-fields.js

import fetch from 'node-fetch';

// Test different field name variations to find the correct ones that exist in Airtable
async function testLinkFields() {
  try {
    // Get required settings from environment variables or use defaults from previous logs
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = 'appg1YMt6gzbLVf2a'; // From logs
    const tableName = 'tbljWcl67xzH6zAno'; // From logs
    const recordId = 'recO1tZsszSOPbfwe'; // From logs
    
    if (!apiKey) {
      console.error("AIRTABLE_API_KEY not set in environment variables");
      return;
    }
    
    // First get the existing record to see what fields are available
    const getUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to get record: ${await getResponse.text()}`);
    }
    
    const record = await getResponse.json();
    console.log("Available fields:", Object.keys(record.fields));
    
    // Test variations of field names one by one
    const fieldNameVariations = [
      'Image Link', 
      'ImageLink', 
      'Main Image Link', 
      'MainImageLink',
      'Insta Photo Link',
      'InstaPhotoLink'
    ];
    
    console.log("\nTesting field name variations:");
    for (const fieldName of fieldNameVariations) {
      // Try to update the record with this field name
      const updateUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
      const updateData = {
        fields: {
          [fieldName]: "https://i.imgur.com/test-image.jpg"
        }
      };
      
      console.log(`\nTesting field name: '${fieldName}'`);
      console.log('Sending payload:', JSON.stringify(updateData));
      
      try {
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });
        
        if (updateResponse.ok) {
          console.log(`✓ SUCCESS: Field '${fieldName}' exists and was updated`);
        } else {
          const errorText = await updateResponse.text();
          console.log(`✗ FAILED: Field '${fieldName}' failed - ${updateResponse.status} - ${errorText}`);
        }
      } catch (error) {
        console.log(`✗ ERROR: Field '${fieldName}' test error - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testLinkFields();