/**
 * Helper functions for processing Airtable data
 * Specifically focused on handling both old attachment fields and new link fields
 */

import { Attachment } from "../integrations/airtable";

/**
 * Get the best image URL from an Airtable record, checking both attachment and link fields
 * @param fields - The fields from an Airtable record
 * @param attachmentFieldName - The name of the attachment field (e.g., 'MainImage')
 * @param linkFieldName - The name of the link field (e.g., 'MainImageLink')
 * @returns The best image URL available, or null if none found
 */
export function getBestImageUrl(
  fields: any, 
  attachmentFieldName: string, 
  linkFieldName: string
): string | null {
  // First check if we have the link field, as this is preferred
  if (fields[linkFieldName] && typeof fields[linkFieldName] === 'string') {
    return fields[linkFieldName];
  }
  
  // Then check if we have an attachment field
  if (fields[attachmentFieldName] && 
      Array.isArray(fields[attachmentFieldName]) && 
      fields[attachmentFieldName].length > 0) {
    
    // Get the first attachment
    const attachment = fields[attachmentFieldName][0] as Attachment;
    
    // Return the URL from the attachment
    if (attachment.url) {
      return attachment.url;
    }
    
    // Try the thumbnails if the direct URL is not available
    if (attachment.thumbnails) {
      if (attachment.thumbnails.full) {
        return attachment.thumbnails.full.url;
      } else if (attachment.thumbnails.large) {
        return attachment.thumbnails.large.url;
      } else if (attachment.thumbnails.small) {
        return attachment.thumbnails.small.url;
      }
    }
  }
  
  // No image found
  return null;
}

/**
 * Updates an article with the best image URL from Airtable record fields
 * @param article - The article object to update
 * @param fields - The fields from an Airtable record
 * @returns The updated article
 */
export function updateArticleWithBestImages(article: any, fields: any): any {
  // Process main image
  const mainImageUrl = getBestImageUrl(fields, 'MainImage', 'MainImageLink');
  if (mainImageUrl) {
    article.imageUrl = mainImageUrl;
    article.imageType = 'url';
  }
  
  // Process Instagram photo
  const instaPhotoUrl = getBestImageUrl(fields, 'instaPhoto', 'InstaPhotoLink');
  if (instaPhotoUrl) {
    article.instagramImageUrl = instaPhotoUrl;
  }
  
  return article;
}