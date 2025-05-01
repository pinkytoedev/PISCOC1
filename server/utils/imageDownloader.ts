/**
 * Image Downloader Utility
 * 
 * Downloads images from URLs and saves them to the local filesystem.
 * Used for ensuring Instagram API compatibility with image uploads.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from '../vite';

// Directory for storing downloaded images
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'instagram');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  log(`Created upload directory: ${UPLOAD_DIR}`, 'imageDownloader');
}

/**
 * Download an image from a URL and save it locally
 * 
 * @param imageUrl URL of the image to download
 * @returns Local file path and URL for the downloaded image
 */
export async function downloadImage(imageUrl: string): Promise<{
  filePath: string;
  fileUrl: string;
}> {
  try {
    // Generate a unique filename based on URL and timestamp
    const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const timestamp = Date.now();
    const extension = getImageExtension(imageUrl);
    const filename = `${urlHash}-${timestamp}${extension}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    log(`Downloading image from ${imageUrl}`, 'imageDownloader');
    
    // Fetch the image data
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    // Check content type to confirm it's an image
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    // Get the image data as an array buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Write the image to disk
    fs.writeFileSync(filePath, Buffer.from(imageBuffer));
    
    log(`Image downloaded and saved to ${filePath}`, 'imageDownloader');
    
    // Generate a public URL for the image
    // This assumes we're serving static files from /uploads
    const fileUrl = `/uploads/instagram/${filename}`;
    
    return {
      filePath,
      fileUrl
    };
  } catch (error) {
    log(`Error downloading image: ${error}`, 'imageDownloader');
    throw error;
  }
}

/**
 * Get full absolute URL for an image, handling relative paths
 * 
 * @param relativeUrl The relative URL (e.g., /uploads/image.jpg)
 * @returns Full absolute URL including protocol, host, and path
 */
export function getFullImageUrl(relativeUrl: string): string {
  // Check if this is already a full URL
  if (relativeUrl.startsWith('http')) {
    return relativeUrl;
  }
  
  // Get server host from environment or use fallback
  const host = process.env.HOST || 'localhost:5000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  
  // Ensure the path starts with a slash
  const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  
  return `${protocol}://${host}${path}`;
}

/**
 * Extract image extension from URL
 * 
 * @param url URL of the image
 * @returns Image file extension including the dot (e.g., .jpg)
 */
function getImageExtension(url: string): string {
  // Try to extract extension from the URL
  const urlExtension = url.split('?')[0].split('#')[0].split('.').pop();
  
  if (urlExtension && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension.toLowerCase())) {
    return `.${urlExtension.toLowerCase()}`;
  }
  
  // If no valid extension found, default to .jpg
  return '.jpg';
}