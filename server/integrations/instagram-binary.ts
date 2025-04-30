/**
 * Instagram Binary Image Upload
 * This implements a direct binary upload approach for images
 * to avoid issues with URL access restrictions
 */

import { Request, Response } from 'express';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { log } from '../vite';
import { storage } from '../storage';
import { getInstagramAccountId } from './instagram';
import { downloadImage, cleanupImage } from '../utils/imageDownloader';

/**
 * Create a new Instagram media container using direct binary upload
 * This bypasses URL restrictions by sending the actual image binary data
 * 
 * @param imageUrl URL of the image to publish
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
export async function createInstagramMediaContainerBinary(imageUrl: string, caption: string): Promise<string> {
  // Download the image first
  let downloadedImagePath: string | null = null;
  
  try {
    log(`Downloading image for Instagram binary post: ${imageUrl}`, 'instagram');
    
    // Download the image to local filesystem
    downloadedImagePath = await downloadImage(imageUrl);
    
    // Get Instagram account ID
    const instagramAccountId = await getInstagramAccountId();
    if (!instagramAccountId) {
      throw new Error('Instagram account ID not found');
    }
    
    // Get user access token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    if (!tokenSetting?.value) {
      throw new Error('User access token missing');
    }
    
    const accessToken = tokenSetting.value;
    
    // Create a FormData instance for the multipart request
    const formData = new FormData();
    
    // Add the necessary parameters
    formData.append('access_token', accessToken);
    formData.append('caption', caption);
    
    // Read the image file and attach it as binary data
    const imageBuffer = fs.readFileSync(downloadedImagePath);
    formData.append('image_file', imageBuffer, {
      filename: path.basename(downloadedImagePath),
      contentType: 'image/jpeg', // Safe default
    });
    
    log(`Sending binary image to Instagram API with caption: ${caption}`, 'instagram');
    
    // Make the API request with the binary data
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        // No need to set Content-Type header as FormData sets it with boundary
        body: formData as any // The 'as any' is needed due to type compatibility issues
      }
    );
    
    // Check for errors
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned from API');
    }
    
    log(`Successfully created Instagram media container with ID: ${data.id}`, 'instagram');
    return data.id;
  } catch (error) {
    log(`Error creating Instagram media container with binary upload: ${error}`, 'instagram');
    throw error;
  } finally {
    // Clean up the downloaded image
    if (downloadedImagePath) {
      try {
        await cleanupImage(downloadedImagePath);
      } catch (cleanupError) {
        log(`Error cleaning up image: ${cleanupError}`, 'instagram');
        // Continue even if cleanup fails
      }
    }
  }
}

/**
 * Create a media container with an embedded local image
 * This uses a local file from the public directory instead of downloading
 * 
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
export async function createInstagramMediaContainerWithLocalImage(caption: string): Promise<string> {
  try {
    // Use a default local image file
    const localImagePath = path.join(process.cwd(), 'client/public/assets/images/pink-background.png');
    
    if (!fs.existsSync(localImagePath)) {
      throw new Error(`Local fallback image not found at ${localImagePath}`);
    }
    
    // Get Instagram account ID
    const instagramAccountId = await getInstagramAccountId();
    if (!instagramAccountId) {
      throw new Error('Instagram account ID not found');
    }
    
    // Get user access token
    const tokenSetting = await storage.getIntegrationSettingByKey("facebook", "access_token");
    if (!tokenSetting?.value) {
      throw new Error('User access token missing');
    }
    
    const accessToken = tokenSetting.value;
    
    // Create a FormData instance for the multipart request
    const formData = new FormData();
    
    // Add the necessary parameters
    formData.append('access_token', accessToken);
    formData.append('caption', caption);
    
    // Read the image file and attach it as binary data
    const imageBuffer = fs.readFileSync(localImagePath);
    formData.append('image_file', imageBuffer, {
      filename: 'pink-background.png',
      contentType: 'image/png',
    });
    
    log(`Sending local fallback image to Instagram API with caption: ${caption}`, 'instagram');
    
    // Make the API request with the binary data
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        // No need to set Content-Type header as FormData sets it with boundary
        body: formData as any // The 'as any' is needed due to type compatibility issues
      }
    );
    
    // Check for errors
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    if (!data.id) {
      throw new Error('No container ID returned from API');
    }
    
    log(`Successfully created Instagram media container with fallback image, ID: ${data.id}`, 'instagram');
    return data.id;
  } catch (error) {
    log(`Error creating Instagram media container with local image: ${error}`, 'instagram');
    throw error;
  }
}