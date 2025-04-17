import { storage } from '../storage';
import fetch from 'node-fetch';

/**
 * Test function that uploads an Imgur link to Airtable using a "Test" field
 * This is specifically designed to test if Airtable accepts the link field approach
 * rather than using the attachment field
 */
export async function uploadLinkToAirtableTestField(
  imageUrl: string,
  recordId: string,
  filename: string = "test-image.jpg"
): Promise<boolean> {
  try {
    // Get Airtable API settings
    const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
    const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
    const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
    
    if (!apiKeySetting?.value || !baseIdSetting?.value || !tableNameSetting?.value) {
      throw new Error("Airtable settings are not fully configured");
    }
    
    if (!apiKeySetting.enabled || !baseIdSetting.enabled || !tableNameSetting.enabled) {
      throw new Error("Some Airtable settings are disabled");
    }
    
    const apiKey = apiKeySetting.value;
    const baseId = baseIdSetting.value;
    const tableName = tableNameSetting.value;
    
    // Debug log to help identify configuration issues
    console.log("Airtable Link Test Upload Config:", {
      baseId,
      tableName,
      recordId
    });
    
    // Make sure table name is URL encoded for special characters
    const encodedTableName = encodeURIComponent(tableName);
    
    // Create the URL for the API request
    const url = `https://api.airtable.com/v0/${baseId}/${encodedTableName}/${recordId}`;
    
    // Create the payload - we're using "Test" as the field name
    // This is a simple text field, not an attachment field
    const payload = {
      fields: {
        Test: imageUrl // Using a direct URL string, not an attachment object
      }
    };
    
    console.log("Using Airtable Test Link payload:", JSON.stringify(payload));
    
    // Send PATCH request to update the record with the link
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = {};
      
      try {
        // Try to parse the error response as JSON for more structured info
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        // If it's not JSON, use the raw text
        errorDetails = { error: errorText };
      }
      
      console.error("Airtable API Error Response:", {
        status: response.status, 
        statusText: response.statusText,
        response: errorText,
        url,
        encodedTableName,
        originalTableName: tableName,
        recordId,
        method: 'PATCH',
        payloadSize: JSON.stringify(payload).length,
        errorDetails
      });
      
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json() as { fields?: { Test?: string } };
    console.log("Airtable Test Link Update Result:", JSON.stringify(result.fields?.Test || 'No Test field in response'));
    
    // If we get here, we successfully updated the record
    return true;
  } catch (error) {
    console.error('Error uploading link to Airtable Test field:', error);
    return false;
  }
}

/**
 * Helper function to migrate existing articles with attachments to use the link field approach
 * This can be used to migrate all articles or just test a single article
 */
export async function migrateArticleImagesToLinks(
  articleId?: number, 
  testOnly: boolean = true
): Promise<{ success: boolean; migrated: number; failed: number; }> {
  try {
    // Get all articles, or just the specific article if an ID is provided
    const articles = articleId 
      ? [await storage.getArticle(articleId)].filter(Boolean) as any[]
      : await storage.getArticles();
    
    // Filter to only include Airtable articles with images
    const airtableArticles = articles.filter(article => 
      article && 
      article.source === 'airtable' && 
      article.externalId && 
      (article.imageUrl || article.instagramImageUrl)
    ) as {
      id: number;
      title: string;
      externalId: string;
      imageUrl?: string;
      instagramImageUrl?: string;
      source: string;
    }[];
    
    console.log(`Found ${airtableArticles.length} Airtable articles with images to process`);
    
    let migrated = 0;
    let failed = 0;
    
    // Process each article
    for (const article of airtableArticles) {
      try {
        console.log(`Processing article: ${article.id} - ${article.title}`);
        
        // Check for main image
        if (article.imageUrl && article.externalId) {
          const mainImageSuccess = await uploadLinkToAirtableTestField(
            article.imageUrl,
            article.externalId,
            `main-image-${article.id}.jpg`
          );
          
          if (mainImageSuccess) {
            console.log(`Successfully updated Test field with main image for article ${article.id}`);
            migrated++;
          } else {
            console.error(`Failed to update Test field with main image for article ${article.id}`);
            failed++;
          }
          
          // If testing only, just process one article to avoid overloading
          if (testOnly) {
            break;
          }
        }
        
        // Check for Instagram image
        if (!testOnly && article.instagramImageUrl && article.externalId) {
          const instaImageSuccess = await uploadLinkToAirtableTestField(
            article.instagramImageUrl,
            article.externalId,
            `insta-image-${article.id}.jpg`
          );
          
          if (instaImageSuccess) {
            console.log(`Successfully updated Test field with Instagram image for article ${article.id}`);
            migrated++;
          } else {
            console.error(`Failed to update Test field with Instagram image for article ${article.id}`);
            failed++;
          }
        }
        
      } catch (error) {
        console.error(`Error processing article ${article.id}:`, error);
        failed++;
      }
    }
    
    return {
      success: migrated > 0 && failed === 0,
      migrated,
      failed
    };
  } catch (error) {
    console.error('Error in migrateArticleImagesToLinks:', error);
    return {
      success: false,
      migrated: 0,
      failed: 1
    };
  }
}