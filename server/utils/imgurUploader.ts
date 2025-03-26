import fs from 'fs';
import { ImgurClient } from 'imgur';
import { storage } from '../storage';

interface UploadedFileInfo {
  path: string;
  filename: string;
  mimetype: string;
  size: number;
}

// Type to represent the raw data from imgur client response
type ImgurResponseData = any;

// This interface represents our processed/normalized response
// from Imgur that we'll use throughout the application
interface ImgurUploadResponse {
  id: string;
  title: string | null;
  description: string | null;
  datetime: number;
  type: string;
  animated: boolean;
  width: number;
  height: number;
  size: number;
  views: number;
  bandwidth: number;
  vote: null;
  favorite: boolean;
  nsfw: boolean | null;
  section: string | null;
  account_url: string | null;
  account_id: number;
  is_ad: boolean;
  in_most_viral: boolean;
  has_sound: boolean;
  tags: string[];
  ad_type: number;
  ad_url: string;
  edited: string;
  in_gallery: boolean;
  deletehash: string;
  name: string;
  link: string;
}

// Helper function to convert any tags to string array
function normalizeTagsArray(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag || ''));
  }
  return [];
}

/**
 * Uploads an image file to Imgur
 * @param file Information about the file to upload
 * @returns Promise with the Imgur upload response or null if failed
 */
export async function uploadImageToImgur(file: UploadedFileInfo): Promise<ImgurUploadResponse | null> {
  try {
    // Get Imgur client ID from storage
    const clientIdSetting = await storage.getIntegrationSettingByKey('imgur', 'client_id');
    
    if (!clientIdSetting?.value || !clientIdSetting.enabled) {
      throw new Error('Imgur client ID is not configured or disabled');
    }
    
    const clientId = clientIdSetting.value;
    
    // Create Imgur client
    const client = new ImgurClient({ clientId });
    
    // Read file as base64
    const fileBuffer = fs.readFileSync(file.path);
    const base64Image = fileBuffer.toString('base64');
    
    // Upload to Imgur
    console.log(`Uploading image to Imgur: ${file.filename}`);
    
    const response = await client.upload({
      image: base64Image,
      type: 'base64',
      name: file.filename,
      title: `Uploaded from integration system - ${file.filename}`,
      description: 'Uploaded via Discord-Airtable Integration System'
    });
    
    if (!response.success) {
      console.error('Imgur upload failed:', response.status, response.data);
      return null;
    }
    
    console.log('Imgur upload successful:', {
      id: response.data.id,
      link: response.data.link,
      size: response.data.size,
      type: response.data.type
    });
    
    // Create a normalized response that matches our interface
    const result: ImgurUploadResponse = {
      id: response.data.id || '',
      title: response.data.title || null,
      description: response.data.description || null,
      datetime: response.data.datetime || Date.now(),
      type: response.data.type || 'image/jpeg',
      animated: Boolean(response.data.animated),
      width: Number(response.data.width) || 0,
      height: Number(response.data.height) || 0,
      size: Number(response.data.size) || 0,
      views: Number(response.data.views) || 0,
      bandwidth: Number(response.data.bandwidth) || 0,
      vote: null,
      favorite: Boolean(response.data.favorite),
      nsfw: response.data.nsfw === true ? true : response.data.nsfw === false ? false : null,
      section: response.data.section || null,
      account_url: response.data.account_url || null,
      account_id: typeof response.data.account_id === 'string' 
        ? parseInt(response.data.account_id, 10) || 0 
        : Number(response.data.account_id) || 0,
      is_ad: Boolean(response.data.is_ad),
      in_most_viral: Boolean(response.data.in_most_viral),
      has_sound: Boolean(response.data.has_sound),
      tags: normalizeTagsArray(response.data.tags),
      ad_type: Number(response.data.ad_type) || 0,
      ad_url: response.data.ad_url || '',
      edited: response.data.edited || '',
      in_gallery: Boolean(response.data.in_gallery),
      deletehash: response.data.deletehash || '',
      name: response.data && 'name' in response.data ? String(response.data.name) : file.filename,
      link: response.data.link || ''
    };
    
    return result;
  } catch (error) {
    console.error('Error uploading to Imgur:', error);
    return null;
  }
}

/**
 * Uploads an image from URL to Imgur
 * @param imageUrl URL of the image to upload
 * @param filename Original filename for reference
 * @returns Promise with the Imgur upload response or null if failed
 */
export async function uploadImageUrlToImgur(imageUrl: string, filename: string): Promise<ImgurUploadResponse | null> {
  try {
    // Get Imgur client ID from storage
    const clientIdSetting = await storage.getIntegrationSettingByKey('imgur', 'client_id');
    
    if (!clientIdSetting?.value || !clientIdSetting.enabled) {
      throw new Error('Imgur client ID is not configured or disabled');
    }
    
    const clientId = clientIdSetting.value;
    
    // Create Imgur client
    const client = new ImgurClient({ clientId });
    
    // Upload URL to Imgur
    console.log(`Uploading image URL to Imgur: ${imageUrl}`);
    
    const response = await client.upload({
      image: imageUrl,
      type: 'url',
      name: filename,
      title: `Uploaded from integration system - ${filename}`,
      description: 'Uploaded via Discord-Airtable Integration System'
    });
    
    if (!response.success) {
      console.error('Imgur URL upload failed:', response.status, response.data);
      return null;
    }
    
    console.log('Imgur URL upload successful:', {
      id: response.data.id,
      link: response.data.link,
      size: response.data.size,
      type: response.data.type
    });
    
    // Create a normalized response that matches our interface
    const result: ImgurUploadResponse = {
      id: response.data.id || '',
      title: response.data.title || null,
      description: response.data.description || null,
      datetime: response.data.datetime || Date.now(),
      type: response.data.type || 'image/jpeg',
      animated: Boolean(response.data.animated),
      width: Number(response.data.width) || 0,
      height: Number(response.data.height) || 0,
      size: Number(response.data.size) || 0,
      views: Number(response.data.views) || 0,
      bandwidth: Number(response.data.bandwidth) || 0,
      vote: null,
      favorite: Boolean(response.data.favorite),
      nsfw: response.data.nsfw === true ? true : response.data.nsfw === false ? false : null,
      section: response.data.section || null,
      account_url: response.data.account_url || null,
      account_id: typeof response.data.account_id === 'string' 
        ? parseInt(response.data.account_id, 10) || 0 
        : Number(response.data.account_id) || 0,
      is_ad: Boolean(response.data.is_ad),
      in_most_viral: Boolean(response.data.in_most_viral),
      has_sound: Boolean(response.data.has_sound),
      tags: normalizeTagsArray(response.data.tags),
      ad_type: Number(response.data.ad_type) || 0,
      ad_url: response.data.ad_url || '',
      edited: response.data.edited || '',
      in_gallery: Boolean(response.data.in_gallery),
      deletehash: response.data.deletehash || '',
      name: response.data && 'name' in response.data ? String(response.data.name) : filename,
      link: response.data.link || ''
    };
    
    return result;
  } catch (error) {
    console.error('Error uploading URL to Imgur:', error);
    return null;
  }
}