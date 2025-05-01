/**
 * Instagram Image Processor
 * 
 * Specialized utility for handling and processing images specifically for Instagram
 * Instagram has strict requirements for image URLs and formats:
 * 1. Images must be in JPEG format
 * 2. URLs must be publicly accessible
 * 3. Image dimensions must meet Instagram's requirements
 * 
 * This processor handles these requirements by:
 * - Converting images to JPEG format
 * - Processing image dimensions
 * - Ensuring URLs are publicly accessible from Instagram's servers
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { log } from '../vite';

// Directory for storing temporary Instagram images
const INSTAGRAM_TEMP_DIR = path.join(process.cwd(), 'uploads', 'instagram-temp');

// Ensure upload directories exist
if (!fs.existsSync(INSTAGRAM_TEMP_DIR)) {
  fs.mkdirSync(INSTAGRAM_TEMP_DIR, { recursive: true });
}

/**
 * Process an image for Instagram posting
 * This function takes an image URL and prepares it for Instagram by:
 * 1. Downloading the image
 * 2. Converting it to JPEG format
 * 3. Resizing it to meet Instagram requirements
 * 4. Returning a base64 encoded data URL
 * 
 * @param imageUrl The original image URL
 * @returns A base64 data URL ready for Instagram
 */
export async function processImageForInstagram(imageUrl: string): Promise<string> {
  try {
    log(`Processing image for Instagram: ${imageUrl}`, 'instagram-image');
    
    // Download the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image data as a buffer
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Process the image using sharp
    const processedImageBuffer = await sharp(imageBuffer)
      // Convert to JPEG format
      .jpeg({ quality: 90 })
      // Ensure dimensions meet Instagram requirements (square aspect ratio works best)
      .resize({
        width: 1080,  // Instagram recommended width
        height: 1080, // Square format is safest
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();
    
    // Create a base64 data URL
    const base64Image = processedImageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;
    
    log(`Image processed successfully for Instagram`, 'instagram-image');
    return dataUrl;
  } catch (error) {
    log(`Error processing image for Instagram: ${error}`, 'instagram-image');
    throw error;
  }
}

/**
 * Clean up old temporary files
 * @param maxAgeHours Maximum age in hours
 * @returns Number of files deleted
 */
export function cleanupTempFiles(maxAgeHours: number = 24): number {
  try {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;
    
    if (fs.existsSync(INSTAGRAM_TEMP_DIR)) {
      const files = fs.readdirSync(INSTAGRAM_TEMP_DIR);
      
      for (const file of files) {
        const filePath = path.join(INSTAGRAM_TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAgeMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        log(`Cleaned up ${deletedCount} temporary Instagram image files`, 'instagram-image');
      }
    }
    
    return deletedCount;
  } catch (error) {
    log(`Error cleaning up temporary files: ${error}`, 'instagram-image');
    return 0;
  }
}