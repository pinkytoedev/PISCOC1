/**
 * Instagram Image Processor
 * 
 * Handles image processing and preparation specifically for Instagram API
 * Includes downloading, local hosting, and cleanup of images
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { log } from '../vite';
import { storage } from '../storage';

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'instagram');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Process image for Instagram by downloading it to the server
 * and serving it from our domain
 * 
 * @param imageUrl Original image URL (from ImgBB, Imgur, etc.)
 * @returns URL accessible by Instagram API (hosted on our server)
 */
export async function processImageForInstagram(imageUrl: string): Promise<string> {
  try {
    log(`Processing image for Instagram: ${imageUrl}`, 'instagram-image');
    
    // Generate unique filename
    const timestamp = Date.now();
    const urlParts = imageUrl.split('/');
    let originalFilename = urlParts[urlParts.length - 1];
    
    // Clean up filename and ensure it has an extension
    originalFilename = originalFilename.split('?')[0]; // Remove query params
    if (!originalFilename.match(/\.(jpg|jpeg|png)$/i)) {
      originalFilename += '.jpg'; // Default to jpg if no extension
    }
    
    const filename = `instagram_${timestamp}_${originalFilename}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get image as buffer and write to file
    const buffer = await response.buffer();
    fs.writeFileSync(filePath, buffer);
    
    // URL to access the image (adjust based on your server setup)
    // This uses Express static serving from /uploads directory
    const baseUrl = await getBaseUrl();
    const imageAccessUrl = `${baseUrl}/uploads/instagram/${filename}`;
    
    log(`Image processed and accessible at: ${imageAccessUrl}`, 'instagram-image');
    
    // Log this operation
    await storage.createActivityLog({
      action: 'process_image',
      resourceType: 'instagram_image',
      resourceId: filename,
      details: {
        originalUrl: imageUrl,
        processedUrl: imageAccessUrl,
        filePath
      }
    });
    
    return imageAccessUrl;
  } catch (error) {
    log(`Error processing image for Instagram: ${error}`, 'instagram-image');
    throw error;
  }
}

/**
 * Clean up processed images
 * Call this periodically or after successful Instagram posting
 * 
 * @param filePath Optional specific file path to clean up
 * @param olderThanHours Optional age threshold in hours
 */
export async function cleanupProcessedImages(filePath?: string, olderThanHours: number = 24): Promise<void> {
  try {
    if (filePath && fs.existsSync(filePath)) {
      // Delete specific file
      fs.unlinkSync(filePath);
      log(`Cleaned up specific processed image: ${filePath}`, 'instagram-image');
      return;
    }
    
    // Clean up old files
    const files = fs.readdirSync(UPLOAD_DIR);
    const now = Date.now();
    const threshold = olderThanHours * 60 * 60 * 1000; // Convert hours to milliseconds
    
    let cleanedCount = 0;
    
    for (const file of files) {
      if (file.startsWith('instagram_')) {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > threshold) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      log(`Cleaned up ${cleanedCount} old processed images`, 'instagram-image');
    }
  } catch (error) {
    log(`Error cleaning up processed images: ${error}`, 'instagram-image');
  }
}

/**
 * Get base URL for the application
 * Handles development vs production environments
 */
async function getBaseUrl(): Promise<string> {
  // Always use the production domain for Instagram images
  // as Instagram cannot access localhost or Replit preview domains
  return 'https://piscoc.pinkytoepaper.com';
}