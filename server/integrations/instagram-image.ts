import { Request, Response } from 'express';
import FormData from 'form-data';
import fs from 'fs';
import { log } from '../vite';
import { storage } from '../storage';
import { getInstagramAccountId } from './instagram';
import { downloadImage, cleanupImage } from '../utils/imageDownloader';

/**
 * Create a new Instagram media container using a downloaded image
 * This is an enhanced version that handles downloading the image first
 * 
 * @param imageUrl URL of the image to publish
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
export async function createInstagramMediaContainerWithDownload(imageUrl: string, caption: string): Promise<string> {
  // Download the image first
  let downloadedImagePath: string | null = null;
  
  try {
    log(`Downloading image for Instagram post: ${imageUrl}`, 'instagram');
    
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
    
    // Using FormData for multipart/form-data upload
    const formData = new FormData();
    
    // Add the image file
    formData.append('image_url', imageUrl);
    formData.append('caption', caption);
    formData.append('access_token', accessToken);
    
    // Make the API request
    log(`Sending image to Instagram API with caption: ${caption}`, 'instagram');
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
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
    
    return data.id;
  } catch (error) {
    log(`Error creating Instagram media container: ${error}`, 'instagram');
    throw error;
  } finally {
    // Clean up the downloaded image
    if (downloadedImagePath) {
      await cleanupImage(downloadedImagePath);
    }
  }
}

/**
 * Create a new Instagram media container using a direct file upload
 * This is a more reliable method for Instagram posting
 * 
 * @param imageUrl URL of the image to publish
 * @param caption Caption for the post
 * @returns Container ID to use in the publish step
 */
export async function createMediaContainerWithDirectUpload(imageUrl: string, caption: string): Promise<string> {
  // Download the image first
  let downloadedImagePath: string | null = null;
  
  try {
    log(`Downloading image for Instagram post: ${imageUrl}`, 'instagram');
    
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
    
    // Create a proper multipart form data
    const formData = new FormData();
    
    // Add the caption and access token
    formData.append('caption', caption);
    formData.append('access_token', accessToken);
    
    // Add the image file as actual file data
    const fileStream = fs.createReadStream(downloadedImagePath);
    formData.append('image', fileStream);
    
    // Make the API request using the FormData object
    log(`Uploading image directly to Instagram API with caption: ${caption}`, 'instagram');
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        body: formData as any, // The 'as any' is needed due to type compatibility issues
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
    log(`Error creating Instagram media container: ${error}`, 'instagram');
    throw error;
  } finally {
    // Clean up the downloaded image
    if (downloadedImagePath) {
      await cleanupImage(downloadedImagePath);
    }
  }
}