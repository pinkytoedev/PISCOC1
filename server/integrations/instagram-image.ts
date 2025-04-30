import { Request, Response } from 'express';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
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
    
    // Create a server URL for the locally downloaded file
    // This creates a URL that Facebook servers can access
    const serverUrl = `${process.env.SERVER_URL || 'https://' + process.env.REPL_SLUG + '.replit.dev'}/uploads/${path.basename(downloadedImagePath)}`;
    log(`Using server URL for Instagram API: ${serverUrl}`, 'instagram');
    
    // Using FormData for multipart/form-data upload
    const formData = new URLSearchParams();
    
    // Add the image URL (now a URL that Facebook servers can access)
    formData.append('image_url', serverUrl);
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
    // For Instagram uploads, we need to keep the image file accessible
    // until the media is published. We'll clean it up in a scheduled task.
    log(`Keeping downloaded image for Instagram access: ${downloadedImagePath}`, 'instagram');
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
    
    // Create a URL that Instagram/Facebook servers can access
    // Format the URL with the correct domain based on environment
    const baseUrl = process.env.SERVER_URL || 
                   (process.env.REPL_SLUG ? 
                    `https://${process.env.REPL_SLUG}.replit.dev` : 
                    'http://localhost:5000');
    
    const publicImageUrl = `${baseUrl}/uploads/${path.basename(downloadedImagePath)}`;
    log(`Using public image URL: ${publicImageUrl}`, 'instagram');
    
    // Use URL-based approach as it's more reliable than direct file upload with FormData
    const urlParams = new URLSearchParams();
    urlParams.append('image_url', publicImageUrl);
    urlParams.append('caption', caption);
    urlParams.append('access_token', accessToken);
    
    // Make the API request
    log(`Creating Instagram media container with image URL: ${publicImageUrl}`, 'instagram');
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: urlParams.toString()
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
    
    // We'll keep the downloaded image file until the container is published
    // to ensure it remains accessible to Instagram
    
    return data.id;
  } catch (error) {
    log(`Error creating Instagram media container: ${error}`, 'instagram');
    
    // Clean up the downloaded image if there was an error
    if (downloadedImagePath) {
      await cleanupImage(downloadedImagePath);
    }
    
    throw error;
  }
}