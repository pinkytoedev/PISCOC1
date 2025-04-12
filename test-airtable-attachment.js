// Test script to debug Airtable attachment uploads
const fetch = require('node-fetch');

async function testAirtableAttachment() {
  try {
    // Get settings from environment or hardcode for testing
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = 'appg1YMt6gzbLVf2a'; // From logs
    const tableName = 'tbljWcl67xzH6zAno'; // From logs
    const recordId = 'recoYQ6q0hZ3vdmGb'; // From logs
    const fieldName = 'MainImage';
    
    if (!apiKey) {
      console.error('AIRTABLE_API_KEY environment variable not set');
      return;
    }
    
    console.log('Testing Airtable attachment upload with config:', {
      baseId,
      tableName,
      recordId,
      fieldName
    });
    
    // Create the URL for the API request
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    // Using a test image URL
    const imageUrl = 'https://i.imgur.com/UAr13LQ.jpeg'; // Same URL as in logs
    const filename = 'test-image.jpg';
    
    // Format for Airtable attachment field
    const payload = {
      fields: {
        [fieldName]: [
          {
            url: imageUrl,
            filename: filename
          }
        ]
      }
    };
    
    console.log('Sending payload to Airtable:', JSON.stringify(payload, null, 2));
    
    // Send PATCH request
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('Airtable API Error Response:', {
        status: response.status, 
        statusText: response.statusText,
        response: responseText
      });
      return;
    }
    
    console.log('Airtable API Success - Uploaded Image:', responseText);
    
    // After a successful upload, let's verify the record
    const getResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!getResponse.ok) {
      console.error('Failed to verify record:', getResponse.status, await getResponse.text());
      return;
    }
    
    const record = await getResponse.json();
    console.log('Record after upload:', JSON.stringify(record, null, 2));
    
    // Check if the MainImage field has our attachment
    if (record.fields && record.fields[fieldName] && Array.isArray(record.fields[fieldName])) {
      console.log('SUCCESS: Attachment field contains:', record.fields[fieldName]);
    } else {
      console.error('ERROR: Attachment field missing or empty');
      console.log('Full record fields:', record.fields);
    }
  } catch (error) {
    console.error('Error testing Airtable attachment:', error);
  }
}

// Execute the test
testAirtableAttachment();