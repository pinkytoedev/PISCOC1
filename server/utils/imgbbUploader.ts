import fs from 'fs';
import { storage } from '../storage';
import fetch from 'node-fetch';
import FormData from 'form-data';

interface UploadedFileInfo {
  path: string;
  filename: string;
  mimetype: string;
  size: number;
}

// Interface for ImgBB upload response
export interface ImgBBUploadResponse {
  id: string;
  title: string | null;
  url_viewer: string;
  url: string;
  display_url: string;
  width: number;
  height: number;
  size: number;
  time: number;
  expiration: number;
  image: {
    filename: string;
    name: string;
    mime: string;
    extension: string;
    url: string;
  };
  thumb: {
    filename: string;
    name: string;
    mime: string;
    extension: string;
    url: string;
  };
  medium: {
    filename: string;
    name: string;
    mime: string;
    extension: string;
    url: string;
  };
  delete_url: string;
}

// Helper function to get ImgBB settings
async function getImgBBSettings() {
  const settings = await storage.getIntegrationSettings('imgbb');
  return {
    apiKey: settings.find(s => s.key === 'api_key')?.value,
    enabled: settings.find(s => s.key === 'api_key')?.enabled !== false,
  };
}

/**
 * Uploads an image file to ImgBB
 * @param file File information to upload
 * @returns Promise with the ImgBB upload response or null if failed
 */
export async function uploadImageToImgBB(file: UploadedFileInfo): Promise<ImgBBUploadResponse | null> {
  try {
    // Get ImgBB settings
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
    
    // Make API request
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`ImgBB upload failed: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json() as { data: ImgBBUploadResponse, success: boolean, status: number };
    
    if (!data.success) {
      console.error('ImgBB upload failed:', data.status, data.data);
      return null;
    }
    
    console.log('ImgBB upload successful:', {
      id: data.data.id,
      url: data.data.url,
      display_url: data.data.display_url,
      size: data.data.size
    });
    
    return data.data;
  } catch (error) {
    console.error('Error uploading to ImgBB:', error);
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
    // Get ImgBB settings
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
    
    // Make API request
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`ImgBB URL upload failed: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json() as { data: ImgBBUploadResponse, success: boolean, status: number };
    
    if (!data.success) {
      console.error('ImgBB URL upload failed:', data.status, data.data);
      return null;
    }
    
    console.log('ImgBB URL upload successful:', {
      id: data.data.id,
      url: data.data.url,
      display_url: data.data.display_url,
      size: data.data.size
    });
    
    return data.data;
  } catch (error) {
    console.error('Error uploading URL to ImgBB:', error);
    return null;
  }
}