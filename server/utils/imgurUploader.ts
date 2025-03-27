import fs from 'fs';
import { ImgurClient } from 'imgur';
import { storage } from '../storage';
import fetch from 'node-fetch';

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

// Helper function to get imgur settings including OAuth status
async function getImgurSettings() {
  const settings = await storage.getIntegrationSettings('imgur');
  return {
    clientId: settings.find(s => s.key === 'client_id')?.value,
    clientSecret: settings.find(s => s.key === 'client_secret')?.value,
    enabled: settings.find(s => s.key === 'client_id')?.enabled !== false,
    useOAuth: settings.find(s => s.key === 'use_oauth')?.value === 'true',
    accessToken: settings.find(s => s.key === 'access_token')?.value,
    refreshToken: settings.find(s => s.key === 'refresh_token')?.value,
    expiresAt: settings.find(s => s.key === 'expires_at')?.value
  };
}

// Interface for OAuth token response
interface ImgurOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  account_username?: string;
  account_id?: number;
}

// Helper function to refresh access token if needed
async function refreshAccessTokenIfNeeded() {
  const settings = await getImgurSettings();
  
  if (!settings.refreshToken || !settings.clientId || !settings.clientSecret) {
    return false;
  }
  
  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = settings.expiresAt ? new Date(settings.expiresAt).getTime() : 0;
  const now = Date.now();
  const isExpired = !expiresAt || expiresAt - now < 5 * 60 * 1000;
  
  if (isExpired) {
    try {
      const response = await fetch('https://api.imgur.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          refresh_token: settings.refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      });
      
      if (!response.ok) {
        console.error('Failed to refresh Imgur access token:', await response.text());
        return false;
      }
      
      const tokens = await response.json() as ImgurOAuthTokens;
      
      // Calculate expires_at based on current time + expires_in
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      
      // Save each token as a separate setting
      const tokenPairs: [string, string][] = [
        ['access_token', tokens.access_token],
        ['refresh_token', tokens.refresh_token],
        ['expires_at', expiresAt]
      ];
      
      for (const [key, value] of tokenPairs) {
        const setting = await storage.getIntegrationSettingByKey('imgur', key);
        
        if (setting) {
          await storage.updateIntegrationSetting(setting.id, { value });
        } else {
          await storage.createIntegrationSetting({
            service: 'imgur',
            key,
            value,
            enabled: true
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error refreshing Imgur access token:', error);
      return false;
    }
  }
  
  return true; // Token is still valid
}

/**
 * Uploads an image file to Imgur
 * @param file Information about the file to upload
 * @returns Promise with the Imgur upload response or null if failed
 */
export async function uploadImageToImgur(file: UploadedFileInfo): Promise<ImgurUploadResponse | null> {
  try {
    // Get Imgur settings including OAuth status
    const settings = await getImgurSettings();
    
    if (!settings.clientId || !settings.enabled) {
      throw new Error('Imgur client ID is not configured or disabled');
    }
    
    // Check if we should use OAuth authentication
    let response;
    
    // Read file as base64
    const fileBuffer = fs.readFileSync(file.path);
    const base64Image = fileBuffer.toString('base64');
    
    // Upload to Imgur
    console.log(`Uploading image to Imgur: ${file.filename}`);
    
    if (settings.useOAuth && settings.accessToken) {
      // Try to refresh token first if needed
      const tokenValid = await refreshAccessTokenIfNeeded();
      
      if (tokenValid) {
        // Use OAuth authentication for upload
        console.log('Using OAuth authentication for Imgur upload');
        
        // Create form data for the request
        const formData = new URLSearchParams();
        formData.append('image', base64Image);
        formData.append('type', 'base64');
        formData.append('name', file.filename);
        formData.append('title', `Uploaded from integration system - ${file.filename}`);
        formData.append('description', 'Uploaded via Discord-Airtable Integration System');
        
        // Make direct API request with OAuth token
        const oauthResponse = await fetch('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.accessToken}`
          },
          body: formData
        });
        
        if (!oauthResponse.ok) {
          throw new Error(`Imgur OAuth upload failed: ${oauthResponse.status} ${await oauthResponse.text()}`);
        }
        
        const data = await oauthResponse.json() as { data: any, success: boolean, status: number };
        
        response = {
          success: data.success,
          status: data.status,
          data: data.data
        };
      } else {
        // Fall back to client ID if token refresh failed
        console.warn('OAuth token refresh failed, falling back to client ID');
        const client = new ImgurClient({ clientId: settings.clientId });
        
        response = await client.upload({
          image: base64Image,
          type: 'base64',
          name: file.filename,
          title: `Uploaded from integration system - ${file.filename}`,
          description: 'Uploaded via Discord-Airtable Integration System'
        });
      }
    } else {
      // Use regular client ID authentication
      const client = new ImgurClient({ clientId: settings.clientId });
      
      response = await client.upload({
        image: base64Image,
        type: 'base64',
        name: file.filename,
        title: `Uploaded from integration system - ${file.filename}`,
        description: 'Uploaded via Discord-Airtable Integration System'
      });
    }
    
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
    // Get Imgur settings including OAuth status
    const settings = await getImgurSettings();
    
    if (!settings.clientId || !settings.enabled) {
      throw new Error('Imgur client ID is not configured or disabled');
    }
    
    // Check if we should use OAuth authentication
    let response;
    
    // Upload to Imgur
    console.log(`Uploading image URL to Imgur: ${imageUrl}`);
    
    if (settings.useOAuth && settings.accessToken) {
      // Try to refresh token first if needed
      const tokenValid = await refreshAccessTokenIfNeeded();
      
      if (tokenValid) {
        // Use OAuth authentication for upload
        console.log('Using OAuth authentication for Imgur URL upload');
        
        // Create form data for the request
        const formData = new URLSearchParams();
        formData.append('image', imageUrl);
        formData.append('type', 'url');
        formData.append('name', filename);
        formData.append('title', `Uploaded from integration system - ${filename}`);
        formData.append('description', 'Uploaded via Discord-Airtable Integration System');
        
        // Make direct API request with OAuth token
        const oauthResponse = await fetch('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.accessToken}`
          },
          body: formData
        });
        
        if (!oauthResponse.ok) {
          throw new Error(`Imgur OAuth URL upload failed: ${oauthResponse.status} ${await oauthResponse.text()}`);
        }
        
        const data = await oauthResponse.json() as { data: any, success: boolean, status: number };
        
        response = {
          success: data.success,
          status: data.status,
          data: data.data
        };
      } else {
        // Fall back to client ID if token refresh failed
        console.warn('OAuth token refresh failed, falling back to client ID');
        const client = new ImgurClient({ clientId: settings.clientId });
        
        response = await client.upload({
          image: imageUrl,
          type: 'url',
          name: filename,
          title: `Uploaded from integration system - ${filename}`,
          description: 'Uploaded via Discord-Airtable Integration System'
        });
      }
    } else {
      // Use regular client ID authentication
      const client = new ImgurClient({ clientId: settings.clientId });
      
      response = await client.upload({
        image: imageUrl,
        type: 'url',
        name: filename,
        title: `Uploaded from integration system - ${filename}`,
        description: 'Uploaded via Discord-Airtable Integration System'
      });
    }
    
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