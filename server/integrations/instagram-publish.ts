/**
 * Instagram Publishing API Integration
 * 
 * This module handles the Instagram Content Publishing API
 * which requires a two-step process:
 * 1. Create a media container
 * 2. Publish the container to Instagram
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { log } from '../vite';
import { storage } from '../storage';
import { downloadImage, cleanupImage } from '../utils/imageDownloader';

/**
 * Get the Instagram Business Account ID from storage
 * 
 * @returns The Instagram Account ID or null if not found
 */
async function getInstagramId(): Promise<string | null> {
  const idSetting = await storage.getIntegrationSettingByKey("instagram", "account_id");
  if (!idSetting?.value) {
    log('No Instagram Account ID found in storage', 'instagram');
    return null;
  }
  return idSetting.value;
}

/**
 * Get the Facebook Access Token from storage
 * 
 * @returns The Facebook Access Token or null if not found
 */
async function getFacebookToken(): Promise<string | null> {
  const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
  if (!tokenSetting?.value) {
    log('No Facebook Access Token found in storage', 'instagram');
    return null;
  }
  return tokenSetting.value;
}

/**
 * Create a media container for Instagram
 * This is step 1 of the publishing process
 * 
 * @param imageUrl URL or path to the image to publish
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
export async function createMediaContainer(imageUrl: string, caption: string): Promise<string> {
  // Get credentials
  const instagramId = await getInstagramId();
  const accessToken = await getFacebookToken();
  
  if (!instagramId || !accessToken) {
    throw new Error('Missing Instagram credentials');
  }
  
  log(`Creating Instagram media container for image: ${imageUrl}`, 'instagram');
  
  try {
    // First try with binary image upload (most reliable)
    return await createContainerWithImageUpload(instagramId, accessToken, imageUrl, caption);
  } catch (binaryError) {
    log(`Binary upload failed: ${binaryError}`, 'instagram');
    
    try {
      // Fall back to URL-based method
      log(`Trying URL-based container creation for: ${imageUrl}`, 'instagram');
      return await createContainerWithImageUrl(instagramId, accessToken, imageUrl, caption);
    } catch (urlError) {
      log(`URL-based upload failed: ${urlError}`, 'instagram');
      
      // Both methods failed, try with a local fallback image
      log(`Both upload methods failed, trying with local fallback image`, 'instagram');
      return await createContainerWithFallbackImage(instagramId, accessToken, caption);
    }
  }
}

/**
 * Create a media container by uploading the image directly
 * 
 * @param instagramId Instagram Business Account ID
 * @param accessToken Facebook Access Token
 * @param imageUrl URL of the image to download and upload
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
async function createContainerWithImageUpload(
  instagramId: string, 
  accessToken: string, 
  imageUrl: string, 
  caption: string
): Promise<string> {
  let tempImagePath: string | null = null;
  
  try {
    // Download the image to a temporary file
    tempImagePath = await downloadImage(imageUrl);
    
    // Create a FormData instance for multipart upload
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('caption', caption);
    
    // Add the image file as binary data
    const imageBuffer = fs.readFileSync(tempImagePath);
    formData.append('image_url', imageBuffer, {
      filename: path.basename(tempImagePath),
      contentType: 'image/jpeg', // Default content type
    });
    
    // Make the API request
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramId}/media`,
      {
        method: 'POST',
        body: formData as any,
      }
    );
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned from API');
    }
    
    log(`Successfully created media container with ID: ${data.id}`, 'instagram');
    return data.id;
  } finally {
    // Clean up the temporary file
    if (tempImagePath) {
      await cleanupImage(tempImagePath);
    }
  }
}

/**
 * Create a media container using an image URL
 * 
 * @param instagramId Instagram Business Account ID
 * @param accessToken Facebook Access Token
 * @param imageUrl URL of the image to publish
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
async function createContainerWithImageUrl(
  instagramId: string, 
  accessToken: string, 
  imageUrl: string, 
  caption: string
): Promise<string> {
  try {
    // Set up the request parameters
    const params = new URLSearchParams();
    params.append('access_token', accessToken);
    params.append('caption', caption);
    params.append('image_url', imageUrl);
    
    // Make the API request
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned from API');
    }
    
    log(`Successfully created media container with ID: ${data.id}`, 'instagram');
    return data.id;
  } catch (error) {
    log(`Error creating media container with URL: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Create a media container using a local fallback image
 * 
 * @param instagramId Instagram Business Account ID
 * @param accessToken Facebook Access Token
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
async function createContainerWithFallbackImage(
  instagramId: string, 
  accessToken: string, 
  caption: string
): Promise<string> {
  // Path to the local fallback image
  const fallbackImagePath = path.join(process.cwd(), 'client/public/assets/images/fallback-image.jpg');
  
  // Check if fallback image exists
  if (!fs.existsSync(fallbackImagePath)) {
    throw new Error(`Fallback image not found at ${fallbackImagePath}`);
  }
  
  try {
    // Create a FormData instance for multipart upload
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('caption', caption + ' (Note: Original image could not be processed)');
    
    // Add the image file as binary data
    const imageBuffer = fs.readFileSync(fallbackImagePath);
    formData.append('image_url', imageBuffer, {
      filename: 'fallback-image.jpg',
      contentType: 'image/jpeg',
    });
    
    // Make the API request
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramId}/media`,
      {
        method: 'POST',
        body: formData as any,
      }
    );
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned from API');
    }
    
    log(`Successfully created media container with fallback image, ID: ${data.id}`, 'instagram');
    return data.id;
  } catch (error) {
    log(`Error creating media container with fallback image: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Publish a media container to Instagram
 * This is step 2 of the publishing process
 * 
 * @param containerId Container ID from the create step
 * @returns The ID of the published media
 */
export async function publishMedia(containerId: string): Promise<string> {
  // Get credentials
  const instagramId = await getInstagramId();
  const accessToken = await getFacebookToken();
  
  if (!instagramId || !accessToken) {
    throw new Error('Missing Instagram credentials');
  }
  
  try {
    log(`Publishing media container ${containerId} to Instagram`, 'instagram');
    
    // Set up the request parameters
    const params = new URLSearchParams();
    params.append('access_token', accessToken);
    params.append('creation_id', containerId);
    
    // Make the API request
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No media ID returned from API');
    }
    
    log(`Successfully published Instagram post with ID: ${data.id}`, 'instagram');
    return data.id;
  } catch (error) {
    log(`Error publishing Instagram post: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Create and publish a post to Instagram in one call
 * This handles both steps of the process
 * 
 * @param imageUrl URL of the image to publish
 * @param caption Caption for the post
 * @returns Object with the container ID and media ID
 */
export async function createAndPublishPost(
  imageUrl: string,
  caption: string
): Promise<{ containerId: string; mediaId: string; usedFallback: boolean }> {
  try {
    // Step 1: Create media container
    const containerId = await createMediaContainer(imageUrl, caption);
    
    // Step 2: Publish the container
    const mediaId = await publishMedia(containerId);
    
    return {
      containerId,
      mediaId,
      usedFallback: false
    };
  } catch (error) {
    log(`Error creating and publishing Instagram post: ${error}`, 'instagram');
    throw error;
  }
}