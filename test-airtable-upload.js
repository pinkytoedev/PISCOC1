import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';

async function testImageUpload() {
  try {
    // Get the settings from the database
    const apiKey = "patgroGZfZkFuXPYJ.7cc98000daf8279f678f761eb181c1b337cc5d4e84f5d43a8854f14ad935a59e";
    const baseId = "appg1YMt6gzbLVf2a";
    const tableName = "tbljWcl67xzH6zAno";
    const recordId = "rec4eLXUGPBl3jldZ"; // Example record ID from your database
    const fieldName = "MainImage"; // The field name in Airtable
    
    // Create sample test image or use existing image path
    // For testing, let's use a small PNG image that we create on the fly
    const testImagePath = './test-image.png';
    
    // Check if the test image already exists
    if (!fs.existsSync(testImagePath)) {
      console.log("Creating sample test image for upload...");
      // Create a very simple 1x1 PNG image - this is just for testing!
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testImagePath, pngHeader);
    }
    
    // Read the test image
    const imageBuffer = fs.readFileSync(testImagePath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // Create the URL for the API request
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    console.log("Uploading image to Airtable:", { url, fieldName });
    
    // After checking Airtable API docs more carefully, they expect a URL for attachments
    // Let's use a publicly accessible test image URL instead
    const payload = {
      fields: {
        [fieldName]: [
          {
            url: "https://picsum.photos/200/300",
            filename: "test-image.jpg"
          }
        ]
      }
    };
    
    // Send PATCH request to update the record with the attachment
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
      console.error("Airtable API Error Response:", {
        status: response.status, 
        statusText: response.statusText,
        response: responseText
      });
      console.error(`Airtable API error: ${response.status} - ${responseText}`);
      return;
    }
    
    console.log("Airtable API Success - Uploaded Image:", responseText);
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error testing Airtable image upload:", error);
  }
}

// Execute the test function
testImageUpload();