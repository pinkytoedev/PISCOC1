import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { storage } from '../storage';
import fetch from 'node-fetch';

interface UploadedFileInfo {
  path: string;
  filename: string;
  mimetype: string;
  size: number;
}

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small: { url: string; width: number; height: number };
    large: { url: string; width: number; height: number };
    full: { url: string; width: number; height: number };
  };
}

// Response type for Airtable API
interface AirtableResponse {
  id: string;
  createdTime?: string;
  fields: Record<string, any>;
}

/**
 * Creates a temporary public URL for a file that can be accessed by Airtable
 * This simulates what the article mentions about needing a publicly accessible URL
 * In a production environment, you would upload to S3, Cloudinary, or similar services
 */
async function getTemporaryPublicUrl(fileInfo: UploadedFileInfo): Promise<string | null> {
  try {
    // In a real implementation, we'd upload to S3, Cloudinary, etc.
    // For this demo/prototype, we're simulating by having direct access to the file
    return `file://${fileInfo.path}`;
  } catch (error) {
    console.error('Error creating temporary public URL:', error);
    return null;
  }
}

/**
 * Creates an Airtable attachment object structure from a file
 */
export async function createAirtableAttachmentFromFile(
  file: UploadedFileInfo
): Promise<AirtableAttachment | null> {
  try {
    // In a real implementation, we'd host the file somewhere and provide a public URL
    // For now, we'll read the file and use a data URL
    const fileData = fs.readFileSync(file.path);
    const base64Data = fileData.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64Data}`;
    
    return {
      id: `file_${Date.now()}`,
      url: dataUrl,
      filename: file.filename,
      size: file.size,
      type: file.mimetype
    };
  } catch (error) {
    console.error('Error creating Airtable attachment from file:', error);
    return null;
  }
}

/**
 * Directly uploads an image to Airtable using the Airtable API
 * This is the main function that implements the logic described in the article
 */
export async function uploadImageToAirtable(
  file: UploadedFileInfo,
  recordId: string,
  fieldName: string
): Promise<AirtableAttachment | null> {
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
    console.log("Airtable Upload Config:", {
      baseId,
      tableName,
      recordId,
      fieldName
    });
    
    // Step 1: Create a temporary URL where the file can be accessed
    // In a production environment, upload to S3, Cloudinary, etc.
    const fileBuffer = fs.readFileSync(file.path);
    
    // Create form data with the image file
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: file.filename,
      contentType: file.mimetype
    });
    
    // Make sure table name is URL encoded for special characters
    const encodedTableName = encodeURIComponent(tableName);
    
    // Upload to Airtable directly - use encoded table name
    const url = `https://api.airtable.com/v0/${baseId}/${encodedTableName}/${recordId}`;
    
    // Create the fields update payload
    // Based on Airtable API documentation and our testing, Airtable requires a valid URL for attachments
    // We need to either:
    // 1. Host the file somewhere and provide the URL
    // 2. Use a data URL for small images (which may not always work with Airtable)
    
    // In a production environment, we'd upload to S3 or similar storage
    // For this prototype, we'll try using a direct data URL but note this is not recommended
    // for large files and may not work in all cases
    
    // Check if file is over 1MB - if so, warn that it might not work via data URL
    if (fileBuffer.length > 1 * 1024 * 1024) {
      console.warn("Large file detected. Data URLs are not recommended for files over 1MB.");
    }
    
    // Create the attachment object with a data URL
    // While this isn't ideal for production, it's a simple approach for prototyping
    const dataUrl = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
    
    // For Airtable, we need to provide *just the URL* in a special format
    // According to Airtable docs, the correct format for attachment fields is different
    // We need to send URLs in this format: { "url": "https://example.com/image.jpg" }
    
    // Create the proper attachment format - just the URL property
    const attachment = {
      url: dataUrl
    };
    
    const payload = {
      fields: {
        [fieldName]: [attachment]
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
        fieldName,
        method: 'PATCH',
        payloadSize: JSON.stringify(payload).length,
        fieldValue: fieldName,
        errorDetails
      });
      
      // Specific handling for 403 errors
      if (response.status === 403) {
        throw new Error(`Airtable API permission error (403): This could be due to invalid API key, incorrect permissions, or an invalid table name/record ID. Check your Airtable configuration and record IDs. Full error: ${errorText}`);
      }
      
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json() as AirtableResponse;
    
    // Return the Airtable attachment object if it exists
    if (result.fields && result.fields[fieldName] && Array.isArray(result.fields[fieldName])) {
      return result.fields[fieldName][0] as AirtableAttachment;
    }
    return null;
  } catch (error) {
    console.error('Error uploading image to Airtable:', error);
    return null;
  }
}

/**
 * Directly uploads an image to Airtable using the Airtable API with a remote URL
 */
export async function uploadImageUrlToAirtable(
  imageUrl: string,
  recordId: string,
  fieldName: string,
  filename: string
): Promise<AirtableAttachment | null> {
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
    console.log("Airtable Image URL Upload Config:", {
      baseId,
      tableName,
      recordId,
      fieldName
    });
    
    // Make sure table name is URL encoded for special characters
    const encodedTableName = encodeURIComponent(tableName);
    
    // Create the URL for the API request
    const url = `https://api.airtable.com/v0/${baseId}/${encodedTableName}/${recordId}`;
    
    // Create the fields update payload
    // For URL-based uploads, Airtable will fetch the image from the provided URL
    // The URL must be publicly accessible
    
    // Determine MIME type based on URL and filename
    let mimeType = "image/jpeg"; // Default
    const urlLower = imageUrl.toLowerCase();
    const filenameLower = filename.toLowerCase();
    
    if (urlLower.endsWith('.png') || filenameLower.endsWith('.png')) {
      mimeType = "image/png";
    } else if (urlLower.endsWith('.gif') || filenameLower.endsWith('.gif')) {
      mimeType = "image/gif";
    } else if (urlLower.endsWith('.webp') || filenameLower.endsWith('.webp')) {
      mimeType = "image/webp";
    }
    
    // For Airtable, we need to provide *just the URL* in a special format
    // According to Airtable docs, the correct format for attachment fields is different
    // We need to send URLs in this format: { "url": "https://example.com/image.jpg" }
    
    // Log URL being used (helps with debugging)
    console.log(`Using URL for Airtable attachment: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    
    // Create the proper attachment format - just the URL property
    const attachment = {
      url: imageUrl
    };
    
    const payload = {
      fields: {
        [fieldName]: [attachment]
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
        fieldName,
        method: 'PATCH',
        payloadSize: JSON.stringify(payload).length,
        fieldValue: fieldName,
        errorDetails
      });
      
      // Specific handling for 403 errors
      if (response.status === 403) {
        throw new Error(`Airtable API permission error (403): This could be due to invalid API key, incorrect permissions, or an invalid table name/record ID. Check your Airtable configuration and record IDs. Full error: ${errorText}`);
      }
      
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json() as AirtableResponse;
    
    // Return the Airtable attachment object if it exists
    if (result.fields && result.fields[fieldName] && Array.isArray(result.fields[fieldName])) {
      return result.fields[fieldName][0] as AirtableAttachment;
    }
    return null;
  } catch (error) {
    console.error('Error uploading image URL to Airtable:', error);
    return null;
  }
}

/**
 * Cleanup uploaded files after processing
 */
export function cleanupUploadedFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error cleaning up file ${filePath}:`, error);
  }
}