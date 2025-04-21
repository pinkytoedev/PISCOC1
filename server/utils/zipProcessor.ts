/**
 * ZIP File Processor
 * Extracts HTML content from ZIP files for articles
 */

import fs from 'fs-extra';
import path from 'path';
import extract from 'extract-zip';
import fetch from 'node-fetch';
import { storage } from '../storage';
import type { Article } from '../../shared/schema';

/**
 * Process a zip file and extract HTML content
 * @param attachment File attachment information
 * @param articleId The ID of the article to update
 * @returns Status of the operation with a message
 */
export async function processZipFile(
  attachment: any,
  articleId: number
): Promise<{ success: boolean; message: string; content?: string }> {
  try {
    console.log('==== processZipFile STARTED ====');
    console.log('Attachment details:', {
      name: attachment.name,
      size: attachment.size,
      isLocalFile: !!attachment.isLocalFile
    });
    console.log('Processing for article ID:', articleId);
    
    // Validate the attachment is a ZIP file
    if (!attachment.name.toLowerCase().endsWith('.zip')) {
      return {
        success: false,
        message: `Invalid file type. Please upload a ZIP file. Received file: ${attachment.name}`
      };
    }
    
    // Get the article from storage
    const article = await storage.getArticle(articleId);
    
    if (!article) {
      console.error(`Article ID ${articleId} not found in database.`);
      return {
        success: false,
        message: `Article with ID ${articleId} not found.`
      };
    }
    
    console.log(`Processing zip file for article: "${article.title}" (ID: ${articleId})`);
    
    // Create a temporary directory
    const tempDir = path.join(process.cwd(), 'uploads', `zip_extract_${articleId}_${Date.now()}`);
    console.log(`Creating temporary directory: ${tempDir}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    let zipPath: string;
    
    // If this is a local file (direct upload), use the path directly
    if (attachment.isLocalFile) {
      zipPath = attachment.url; // In this case, url is the local file path
    } else {
      // Otherwise, download the file (Discord attachment)
      console.log(`Downloading ZIP file from: ${attachment.url}`);
      const response = await fetch(attachment.url);
      
      if (!response.ok) {
        throw new Error(`Failed to download ZIP file: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      
      // Save the downloaded file to disk
      zipPath = path.join(tempDir, `download_${Date.now()}.zip`);
      console.log(`Saving ZIP file to: ${zipPath}`);
      await fs.writeFile(zipPath, Buffer.from(buffer));
    }
    
    // Extract the ZIP file
    console.log('Extracting ZIP file to temporary directory');
    await extract(zipPath, { dir: tempDir });
    
    // Look for HTML files, prioritizing index.html
    console.log('Looking for HTML files in extracted content');
    const files = await fs.readdir(tempDir);
    
    let mainHtmlFile = '';
    let htmlContent = '';
    
    // First, look for index.html
    if (files.includes('index.html')) {
      mainHtmlFile = 'index.html';
      htmlContent = await fs.readFile(path.join(tempDir, mainHtmlFile), 'utf8');
    } 
    // If no index.html, look for any HTML file
    else {
      const htmlFiles = files.filter(file => file.endsWith('.html') || file.endsWith('.htm'));
      
      if (htmlFiles.length > 0) {
        mainHtmlFile = htmlFiles[0];
        htmlContent = await fs.readFile(path.join(tempDir, mainHtmlFile), 'utf8');
      }
    }
    
    // If no HTML file found
    if (!htmlContent) {
      console.error('No HTML file found in ZIP');
      
      // Cleanup
      try {
        await fs.remove(tempDir);
        console.log('Cleaned up temporary directory');
      } catch (cleanupError) {
        console.error('Error cleaning up:', cleanupError);
      }
      
      return {
        success: false,
        message: 'No HTML file found in the ZIP. Please ensure your ZIP contains an index.html file or at least one HTML file.'
      };
    }
    
    console.log(`Found HTML file: ${mainHtmlFile}, content length: ${htmlContent.length} characters`);
    
    // Update the article with the HTML content
    console.log('Updating article with HTML content');
    
    const updateData: Partial<Article> = {
      content: htmlContent,
      contentFormat: 'html'
    };
    
    // Update the article
    const updatedArticle = await storage.updateArticle(articleId, updateData);
    
    if (!updatedArticle) {
      console.error('Failed to update article with HTML content');
      
      // Cleanup
      try {
        await fs.remove(tempDir);
        console.log('Cleaned up temporary directory');
      } catch (cleanupError) {
        console.error('Error cleaning up:', cleanupError);
      }
      
      return {
        success: false,
        message: 'Failed to update article with the HTML content. Database error.'
      };
    }
    
    console.log('Article successfully updated with HTML content');
    
    // Sync to Airtable if needed
    if (article.source === 'airtable' && article.externalId) {
      console.log('Syncing HTML content to Airtable');
      
      try {
        // Get Airtable settings
        const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
        const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
        const tableIdSetting = await storage.getIntegrationSettingByKey("airtable", "article_table_id");
        
        if (apiKeySetting?.value && baseIdSetting?.value && tableIdSetting?.value && apiKeySetting.enabled !== false) {
          // Prepare Airtable update request
          const updateData = {
            fields: {
              Contents: htmlContent
            }
          };
          
          // Send update to Airtable
          const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${tableIdSetting.value}/${article.externalId}`;
          const response = await fetch(airtableUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiKeySetting.value}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
          });
          
          if (!response.ok) {
            console.error(`Failed to update Airtable: ${response.status} ${response.statusText}`);
            console.error(await response.text());
          } else {
            console.log('Successfully synced HTML content to Airtable');
          }
        } else {
          console.log('Airtable settings unavailable or disabled, skipping sync');
        }
      } catch (error) {
        console.error('Error syncing content to Airtable:', error);
        // Don't fail the whole operation if Airtable sync fails
      }
    }
    
    // Cleanup
    try {
      await fs.remove(tempDir);
      console.log('Cleaned up temporary directory');
    } catch (cleanupError) {
      console.error('Error cleaning up:', cleanupError);
    }
    
    console.log('==== processZipFile COMPLETED SUCCESSFULLY ====');
    
    return {
      success: true,
      message: `HTML content from ${mainHtmlFile} in the ZIP file has been successfully extracted and set as the article content.`,
      content: htmlContent
    };
    
  } catch (error) {
    console.error('==== processZipFile ERROR ====', error);
    return {
      success: false,
      message: `Error processing ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}