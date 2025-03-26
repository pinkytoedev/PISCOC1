const fetch = require('node-fetch');

async function getArticleFromAirtable() {
  try {
    // Get the settings from the database
    const apiKey = "patgroGZfZkFuXPYJ.7cc98000daf8279f678f761eb181c1b337cc5d4e84f5d43a8854f14ad935a59e";
    const baseId = "appg1YMt6gzbLVf2a";
    const tableName = "tbljWcl67xzH6zAno";
    const recordId = "rec4eLXUGPBl3jldZ"; // Example record ID from your database
    
    // Create the URL for the API request
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    console.log("Fetching from Airtable:", { url });
    
    // Send GET request to get the record
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Airtable API Error Response:", {
        status: response.status, 
        statusText: response.statusText,
        response: errorText
      });
      console.error(`Airtable API error: ${response.status} - ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log("Airtable API Success - Record:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error testing Airtable:", error);
  }
}

// Execute the test function
getArticleFromAirtable();