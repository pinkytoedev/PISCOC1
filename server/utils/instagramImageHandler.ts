/**
 * Instagram Image Handler
 * Utilities for downloading and serving images for Instagram integration
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { log } from '../vite';

// Directory for storing Instagram images
const INSTAGRAM_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'instagram');

// Ensure upload directory exists
if (!fs.existsSync(INSTAGRAM_UPLOAD_DIR)) {
  fs.mkdirSync(INSTAGRAM_UPLOAD_DIR, { recursive: true });
  log(`Created Instagram image upload directory: ${INSTAGRAM_UPLOAD_DIR}`, 'instagramImage');
}

/**
 * Download an image from a URL and store it locally
 * @param imageUrl URL of the image to download
 * @returns Local URL where the image can be accessed
 */
export async function downloadAndStoreImage(imageUrl: string): Promise<string> {
  try {
    log(`Downloading image for Instagram from: ${imageUrl}`, 'instagramImage');
    
    // Generate a unique filename with original extension if possible
    const fileExtension = getFileExtensionFromUrl(imageUrl) || '.jpg';
    const filename = `instagram-${uuidv4()}${fileExtension}`;
    const filePath = path.join(INSTAGRAM_UPLOAD_DIR, filename);

    // Fetch the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image data as a buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Write to local file
    fs.writeFileSync(filePath, Buffer.from(imageBuffer));
    
    // Return the URL where this image can be accessed
    // This uses the express.static middleware to serve files from /uploads
    const publicUrl = `/uploads/instagram/${filename}`;
    
    log(`Image saved locally and available at: ${publicUrl}`, 'instagramImage');
    
    return publicUrl;
  } catch (error) {
    log(`Error downloading image: ${error}`, 'instagramImage');
    throw error;
  }
}

/**
 * Download an image from a URL, save it locally, and then upload to ImgBB
 * @param imageUrl URL of the image to download
 * @returns ImgBB URL that Instagram can access
 */
export async function downloadAndUploadToImgBB(imageUrl: string): Promise<string> {
  try {
    // First download the image locally
    const localPath = await downloadAndStoreImage(imageUrl);
    log(`Image downloaded locally at: ${localPath}`, 'instagramImage');
    
    // Get the full local file path
    const fullPath = path.join(process.cwd(), localPath.startsWith('/') ? localPath.substring(1) : localPath);
    
    // Read the image file
    const imageBuffer = fs.readFileSync(fullPath);
    
    // Create a form with multipart/form-data
    const formData = new URLSearchParams();
    
    // Base64 encode the image
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    formData.append('image', base64Image);
    
    // Upload to ImgBB
    log(`Uploading image to ImgBB...`, 'instagramImage');
    const imgbbApiKey = process.env.IMGBB_API_KEY;
    if (!imgbbApiKey) {
      throw new Error('ImgBB API key is missing, please set the IMGBB_API_KEY environment variable');
    }
    
    const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });
    
    if (!imgbbResponse.ok) {
      throw new Error(`ImgBB API error: ${imgbbResponse.status} ${imgbbResponse.statusText}`);
    }
    
    const imgbbResult = await imgbbResponse.json();
    
    if (!imgbbResult.success) {
      throw new Error('ImgBB upload failed');
    }
    
    const imgbbUrl = imgbbResult.data.url;
    log(`Successfully uploaded to ImgBB: ${imgbbUrl}`, 'instagramImage');
    
    return imgbbUrl;
  } catch (error) {
    log(`Error uploading to ImgBB: ${error}`, 'instagramImage');
    throw error;
  }
}

/**
 * Get the full public URL for a locally stored image
 * @param localPath Local path returned by downloadAndStoreImage
 * @returns Full public URL including hostname
 */
export function getPublicImageUrl(localPath: string): string {
  // For Replit environment, get the domain from headers
  let host = '';
  try {
    // Try to get the Replit domain which is publicly accessible
    const replitDomain = process.env.REPL_SLUG && process.env.REPL_OWNER
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : null;
      
    // Get any explicitly set PUBLIC_URL
    const publicUrl = process.env.PUBLIC_URL;
    
    // Use the first available option
    host = publicUrl || replitDomain || 'https://7a30f2f5-2a4f-4e84-af67-0ef7bd40c5dd-00-25j42tn9chhi0.picard.replit.dev';
  } catch (error) {
    // If we can't determine the host, use a fallback
    host = 'https://7a30f2f5-2a4f-4e84-af67-0ef7bd40c5dd-00-25j42tn9chhi0.picard.replit.dev';
  }
  
  // Ensure the path starts with a slash
  const normalizedPath = localPath.startsWith('/') ? localPath : `/${localPath}`;
  
  // Combine host and path
  return `${host}${normalizedPath}`;
}

/**
 * Clean up images older than a specified time
 * @param maxAgeHours Maximum age in hours (default: 24)
 * @returns Number of files deleted
 */
export function cleanupOldImages(maxAgeHours: number = 24): number {
  try {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;
    
    // Read all files in the directory
    const files = fs.readdirSync(INSTAGRAM_UPLOAD_DIR);
    
    for (const file of files) {
      const filePath = path.join(INSTAGRAM_UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Check if the file is older than maxAgeHours
      if (now - stats.mtime.getTime() > maxAgeMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      log(`Cleaned up ${deletedCount} old Instagram images`, 'instagramImage');
    }
    
    return deletedCount;
  } catch (error) {
    log(`Error cleaning up old images: ${error}`, 'instagramImage');
    return 0;
  }
}

/**
 * Extract file extension from URL
 * @param url URL to extract extension from
 * @returns File extension with dot or null if not found
 */
function getFileExtensionFromUrl(url: string): string | null {
  try {
    // Remove query parameters
    const cleanUrl = url.split('?')[0];
    
    // Get the last part of the URL (filename)
    const parts = cleanUrl.split('/');
    const filename = parts[parts.length - 1];
    
    // Extract extension
    const match = filename.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : null;
  } catch (error) {
    return null;
  }
}