/**
 * Utility functions for working with Airtable link fields
 * These functions handle uploading images to Imgur and updating Airtable link fields
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

/**
 * Uploads an image URL to Imgur and returns the new URL
 * @param imageUrl - The source image URL to upload
 * @param imgurClientId - The Imgur API client ID
 * @returns The new Imgur URL
 */
export async function uploadImageToImgur(imageUrl: string, imgurClientId: string): Promise<string> {
  try {
    console.log(`Uploading image to Imgur: ${imageUrl}`);
    
    const formData = new FormData();
    formData.append('image', imageUrl);
    
    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': `Client-ID ${imgurClientId}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error('Imgur API error:', data);
      throw new Error(`Failed to upload image to Imgur: ${data.data?.error || 'Unknown error'}`);
    }
    
    console.log(`Imgur upload successful: ${data.data.link}`);
    return data.data.link;
  } catch (error) {
    console.error('Error in uploadImageToImgur:', error);
    throw error;
  }
}

/**
 * Updates an Airtable record with image links
 * @param apiKey - The Airtable API key
 * @param baseId - The Airtable base ID
 * @param tableName - The Airtable table name
 * @param recordId - The ID of the record to update
 * @param fieldName - The field name to update (MainImageLink or InstaPhotoLink)
 * @param imageUrl - The URL to set in the field
 */
export async function updateAirtableLinkField(
  apiKey: string,
  baseId: string,
  tableName: string,
  recordId: string,
  fieldName: string,
  imageUrl: string
): Promise<any> {
  try {
    console.log(`Updating Airtable record ${recordId} field ${fieldName} with image link`);
    
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    const updates = {
      fields: {
        [fieldName]: imageUrl
      }
    };
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = null;
      
      try {
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        // If we can't parse the error, just use the text
      }
      
      // Special handling for field not found errors (UNKNOWN_FIELD_NAME)
      if (response.status === 422 && 
          errorDetails?.error?.type === 'UNKNOWN_FIELD_NAME' && 
          (fieldName === 'MainImageLink' || fieldName === 'InstaPhotoLink')) {
        throw new Error(`The field "${fieldName}" does not exist in your Airtable table. You need to create URL or Text fields named "MainImageLink" and "InstaPhotoLink" in your Airtable table before using this feature.`);
      }
      
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }
    
    console.log(`Record ${recordId} field ${fieldName} updated successfully`);
    return await response.json();
  } catch (error) {
    console.error(`Error updating Airtable link field:`, error);
    throw error;
  }
}

/**
 * Complete process to upload an image to Imgur and update an Airtable record with the link
 * @param imageUrl - The source image URL to upload
 * @param airtableApiKey - The Airtable API key
 * @param airtableBaseId - The Airtable base ID
 * @param airtableTableName - The Airtable table name
 * @param recordId - The ID of the record to update
 * @param fieldName - The field name to update (MainImageLink or InstaPhotoLink)
 * @param imgurClientId - The Imgur API client ID
 */
export async function processImageAndUpdateLinkField(
  imageUrl: string,
  airtableApiKey: string,
  airtableBaseId: string,
  airtableTableName: string,
  recordId: string,
  fieldName: string,
  imgurClientId: string
): Promise<string> {
  try {
    // Step 1: Upload the image to Imgur
    const imgurUrl = await uploadImageToImgur(imageUrl, imgurClientId);
    
    // Step 2: Update the Airtable record with the new link
    await updateAirtableLinkField(
      airtableApiKey,
      airtableBaseId,
      airtableTableName,
      recordId,
      fieldName,
      imgurUrl
    );
    
    return imgurUrl;
  } catch (error) {
    console.error('Error in processImageAndUpdateLinkField:', error);
    throw error;
  }
}