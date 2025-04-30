import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../vite';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

/**
 * Downloads an image from a URL and saves it to the uploads directory
 * 
 * @param imageUrl URL of the image to download
 * @returns Local file path of the downloaded image
 */
export async function downloadImage(imageUrl: string): Promise<string> {
  try {
    // Generate a unique file name
    const fileExtension = getFileExtension(imageUrl);
    const fileName = `image-${uuidv4().replace(/-/g, '')}.${fileExtension}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, fileName);
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Download the image
    log(`Downloading image from ${imageUrl}`, 'instagram');
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    
    // Check mime type to ensure it's an image
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`URL does not point to an image. Content-Type: ${contentType}`);
    }
    
    // Get image buffer
    const imageBuffer = await response.arrayBuffer();
    
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