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
 * Upload image to ImgBB service
 * This ensures the image is hosted on a reliable and Instagram-friendly service
 * 
 * @param imageUrl URL of image to re-host
 * @returns URL of the uploaded image on ImgBB
 */
export async function uploadToImgBB(imageUrl: string): Promise<string> {
  try {
    log(`Uploading image to ImgBB from: ${imageUrl}`, 'imageDownloader');
    
    // First, fetch the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image data as an array buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Create form data with base64 encoded image
    const urlParams = new URLSearchParams();
    // Convert the buffer to base64 string that ImgBB API accepts
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    urlParams.append('image', base64Image);
    
    // Use a reliable image hosting service API
    // ImgBB provides direct image URLs that Instagram can access
    const imgbbApiKey = process.env.IMGBB_API_KEY;
    if (!imgbbApiKey) {
      throw new Error('ImgBB API key is missing, please set the IMGBB_API_KEY environment variable');
    }
    
    const apiResponse = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlParams.toString()
    });
    
    if (!apiResponse.ok) {
      throw new Error(`ImgBB API error: ${apiResponse.status} ${apiResponse.statusText}`);
    }
    
    const result = await apiResponse.json();
    
    if (!result.success) {
      throw new Error('ImgBB upload failed');
    }
    
    log(`Image successfully uploaded to ImgBB: ${result.data.url}`, 'imageDownloader');
    
    // Return the direct image URL from ImgBB
    return result.data.url;
  } catch (error) {
    log(`Error uploading to ImgBB: ${error}`, 'imageDownloader');
    throw error;
  }
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
  
  // Use Replit's domain for serving static files - this is publicly accessible
  // Get the REPL_SLUG and REPL_OWNER from environment variables
  const replSlug = process.env.REPL_SLUG || '';
  const replOwner = process.env.REPL_OWNER || '';
  
  // If we have the Replit environment variables, use the Replit domain
  if (replSlug && replOwner) {
    // Construct a public Replit URL
    const host = `${replSlug}.${replOwner}.repl.co`;
    // Ensure the path starts with a slash
    const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `https://${host}${path}`;
  }
  
  // Fallback to using request headers to determine host
  // This is more reliable than hardcoding localhost
  try {
    // Get domain from whatever is in the request URL
    // This will include subdomains like "7a30f2f5-2a4f-4e84-af67-0ef7bd40c5dd-00-25j42tn9chhi0.picard.replit.dev"
    const requestUrl = new URL(globalThis.location?.href || '');
    const host = requestUrl.host;
    const protocol = 'https'; // Always use HTTPS for public URLs
    
    // Ensure the path starts with a slash
    const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `${protocol}://${host}${path}`;
  } catch (error) {
    // Final fallback to using a dynamically determined host
    const possibleHostnameEnvVars = ['REPLIT_CLUSTER_HOST', 'HOSTNAME', 'HOST'];
    let host = '';
    
    for (const envVar of possibleHostnameEnvVars) {
      if (process.env[envVar]) {
        host = process.env[envVar] || '';
        break;
      }
    }
    
    // If we couldn't determine host from env vars, use the current domain
    if (!host) {
      host = '7a30f2f5-2a4f-4e84-af67-0ef7bd40c5dd-00-25j42tn9chhi0.picard.replit.dev'; // Current domain from logs
    }
    
    const protocol = 'https'; // Always use HTTPS for public URLs
    const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `${protocol}://${host}${path}`;
  }
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