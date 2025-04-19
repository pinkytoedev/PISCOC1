/**
 * Utility functions for uploading images to ImgBB
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { storage } from '../storage';

// Interface for uploaded file information
export interface UploadedFileInfo {
  path: string;
  filename: string;
  size: number;
  mimetype: string;
}

// ImgBB upload response interface
export interface ImgBBUploadResponse {
  id: string;
  url: string;
  display_url: string;
  delete_url?: string;
  title?: string;
  time?: string;
  expiration?: string;
  medium?: {
    filename: string;
    name: string;
    mime: string;
    extension: string;
    url: string;
  };
  thumb?: {
    filename: string;
    name: string;
    mime: string;
    extension: string;
    url: string;
  };
}

/**
 * Get ImgBB integration settings
 * @returns ImgBB settings from storage
 */
async function getImgBBSettings() {
  const settings = await storage.getIntegrationSettings('imgbb');
  return {
    apiKey: settings.find(s => s.key === 'api_key')?.value,
    enabled: settings.find(s => s.key === 'api_key')?.enabled !== false
  };
}

/**
 * Uploads an image file to ImgBB
 * @param file Information about the file to upload
 * @returns Promise with the ImgBB upload response or null if failed
 */
export async function uploadImageToImgBB(file: UploadedFileInfo): Promise<ImgBBUploadResponse | null> {
  try {
    // Get ImgBB settings including API key
    const settings = await getImgBBSettings();
    
    if (!settings.apiKey || !settings.enabled) {
      throw new Error('ImgBB API key is not configured or disabled');
    }
    
    // Read file as base64
    const fileBuffer = fs.readFileSync(file.path);
    const base64Image = fileBuffer.toString('base64');
    
    // Upload to ImgBB
    console.log(`Uploading image to ImgBB: ${file.filename}`);
    
    // Create form data for the request
    const formData = new FormData();
    formData.append('key', settings.apiKey);
    formData.append('image', base64Image);
    formData.append('name', file.filename);
    
    // Make API request to ImgBB
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`ImgBB upload failed: ${response.status} ${await response.text()}`);
    }
    
    const result = await response.json() as { data: ImgBBUploadResponse; success: boolean; status: number };
    
    if (!result.success) {
      throw new Error(`ImgBB upload failed: ${JSON.stringify(result)}`);
    }
    
    // Return the ImgBB response data
    return result.data;
  } catch (error) {
    console.error('Error in uploadImageToImgBB:', error);
    return null;
  }
}

/**
 * Uploads an image from URL to ImgBB
 * @param imageUrl URL of the image to upload
 * @param filename Original filename for reference
 * @returns Promise with the ImgBB upload response or null if failed
 */
export async function uploadImageUrlToImgBB(imageUrl: string, filename: string): Promise<ImgBBUploadResponse | null> {
  try {
    // Get ImgBB settings including API key
    const settings = await getImgBBSettings();
    
    if (!settings.apiKey || !settings.enabled) {
      throw new Error('ImgBB API key is not configured or disabled');
    }
    
    // Upload to ImgBB
    console.log(`Uploading image URL to ImgBB: ${imageUrl}`);
    
    // Create form data for the request
    const formData = new FormData();
    formData.append('key', settings.apiKey);
    formData.append('image', imageUrl);
    formData.append('name', filename);
    
    // Make API request to ImgBB
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`ImgBB URL upload failed: ${response.status} ${await response.text()}`);
    }
    
    const result = await response.json() as { data: ImgBBUploadResponse; success: boolean; status: number };
    
    if (!result.success) {
      throw new Error(`ImgBB URL upload failed: ${JSON.stringify(result)}`);
    }
    
    // Return the ImgBB response data
    return result.data;
  } catch (error) {
    console.error('Error in uploadImageUrlToImgBB:', error);
    return null;
  }
}