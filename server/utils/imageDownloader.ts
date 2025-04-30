import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../vite';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

/**
 * Fix ImgBB URLs - they sometimes come in malformed from the frontend
 * @param url The URL to fix
 * @returns Fixed URL
 */
function fixImgBBUrl(url: string): string {
  // Check if it's an ImgBB URL with an issue
  if (url.includes('i.ibb.co')) {
    // Some common patterns to fix
    // Example: https://i.ibb.co/8LB9VcyM/Threesome-jpg.jpg might be:
    // - Missing characters in the ID
    // - Mixed up ID with filename
    
    // Extract parts
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // Check if it looks malformed
      if (pathParts.length >= 2) {
        const idPart = pathParts[0];
        const filename = pathParts[1];
        
        // Common known ImgBB formats
        if (idPart.length > 8 && idPart.includes('M')) {
          // This might be a malformed ID, try to fix the common case
          // ImgBB IDs are typically 7-8 characters
          const fixedUrl = `https://i.ibb.co/${idPart.substring(0, 7)}/${filename}`;
          log(`Fixing ImgBB URL from ${url} to ${fixedUrl}`, 'instagram');
          return fixedUrl;
        }
      }
    } catch (e) {
      // If URL parsing fails, just return the original
      return url;
    }
  }
  
  return url;
}

/**
 * Downloads an image from a URL and saves it to the uploads directory
 * Handles various edge cases and attempts to fix known problematic URLs
 * 
 * @param imageUrl URL of the image to download
 * @returns Local file path of the downloaded image
 */
export async function downloadImage(imageUrl: string): Promise<string> {
  try {
    // Fix potentially problematic URLs
    imageUrl = fixImgBBUrl(imageUrl);
    
    // Generate a unique file name
    const fileExtension = getFileExtension(imageUrl);
    const fileName = `image-${uuidv4().replace(/-/g, '')}.${fileExtension}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, fileName);
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Try to download the image
    log(`Downloading image from ${imageUrl}`, 'instagram');
    let response;
    
    try {
      response = await fetch(imageUrl, { 
        timeout: 10000, // 10 seconds timeout
        headers: {
          // Add standard browser headers to avoid being blocked
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
    } catch (error) {
      const fetchError = error as Error;
      throw new Error(`Network error downloading image: ${fetchError.message}`);
    }
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    // Check mime type to ensure it's an image
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`URL does not point to an image. Content-Type: ${contentType}`);
    }
    
    // Get image buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Verify we actually got image data
    if (!imageBuffer || imageBuffer.byteLength < 100) {
      throw new Error(`Downloaded file is too small (${imageBuffer?.byteLength || 0} bytes) to be a valid image`);
    }
    
    // Save image to file
    await writeFileAsync(filePath, Buffer.from(imageBuffer));
    log(`Image downloaded and saved to ${filePath}`, 'instagram');
    
    return filePath;
  } catch (error) {
    log(`Error downloading image: ${error}`, 'instagram');
    throw error;
  }
}

/**
 * Cleans up a downloaded image file
 * 
 * @param filePath Path to the image file to clean up
 */
export async function cleanupImage(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await unlinkAsync(filePath);
      log(`Deleted temporary image file: ${filePath}`, 'instagram');
    }
  } catch (error) {
    log(`Error cleaning up image file: ${error}`, 'instagram');
    // Don't throw the error, just log it
  }
}

/**
 * Gets the file extension from a URL
 * 
 * @param url URL to extract file extension from
 * @returns File extension (without the dot) or jpg as fallback
 */
function getFileExtension(url: string): string {
  try {
    // Remove query parameters
    const urlWithoutQuery = url.split('?')[0];
    
    // Extract extension
    const extension = path.extname(urlWithoutQuery).toLowerCase();
    
    // If extension is valid, return it (without the dot)
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
      return extension.substring(1);
    }
    
    // Default to jpg for unknown extensions
    return 'jpg';
  } catch (error) {
    // Default to jpg on error
    return 'jpg';
  }
}