/**
 * ZIP File Processor
 * Extracts HTML content from ZIP files for articles
 */

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import * as util from 'util';
import { exec } from 'child_process';

// Promisify exec
const execPromise = util.promisify(exec);

/**
 * Process a zip file and extract HTML content
 * @param filePath Path to the uploaded ZIP file
 * @param articleId ID of the article to update with HTML content
 * @returns Result of the operation
 */
export async function processZipFile(filePath: string, articleId: number): Promise<{ success: boolean; message: string }> {
  const tempDir = path.join(process.cwd(), 'temp', `article-${articleId}-${Date.now()}`);
  
  try {
    // Make sure temp directory exists
    if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
      fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
    }
    
    // Create temp extraction directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Extract ZIP using unzip command
    console.log(`Extracting ZIP file to ${tempDir}...`);
    await execPromise(`unzip -o "${filePath}" -d "${tempDir}"`);
    
    // Look for HTML files recursively
    const findHtmlFiles = (dir: string): string[] => {
      let results: string[] = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          results = results.concat(findHtmlFiles(itemPath));
        } else if (item.endsWith('.html')) {
          results.push(itemPath);
        }
      }
      
      return results;
    };
    
    // Find all HTML files in the extracted ZIP
    const htmlFiles = findHtmlFiles(tempDir);
    
    if (htmlFiles.length === 0) {
      throw new Error('No HTML files found in ZIP archive');
    }
    
    // Prioritize index.html if it exists, otherwise use the first HTML file
    let mainHtmlFile = htmlFiles.find(file => path.basename(file).toLowerCase() === 'index.html') || htmlFiles[0];
    console.log(`Using HTML file: ${mainHtmlFile}`);
    
    // Read HTML content
    const htmlContent = fs.readFileSync(mainHtmlFile, 'utf-8');
    if (!htmlContent) {
      throw new Error(`HTML file is empty: ${path.basename(mainHtmlFile)}`);
    }
    
    // Update article content
    const article = await storage.getArticle(articleId);
    if (!article) {
      throw new Error(`Article with ID ${articleId} not found`);
    }
    
    const updatedArticle = await storage.updateArticle(articleId, {
      content: htmlContent
    });
    
    if (!updatedArticle) {
      throw new Error('Failed to update article with HTML content');
    }
    
    // If article has an external ID (Airtable), update it there as well
    if (article.source === 'airtable' && article.externalId) {
      try {
        // Get Airtable settings
        const apiKeySetting = await storage.getIntegrationSettingByKey('airtable', 'api_key');
        const baseIdSetting = await storage.getIntegrationSettingByKey('airtable', 'base_id');
        const tableIdSetting = await storage.getIntegrationSettingByKey('airtable', 'article_table_id');
        
        if (apiKeySetting?.value && baseIdSetting?.value && tableIdSetting?.value) {
          // Prepare Airtable update
          const updatePayload = {
            fields: {
              content: htmlContent
            }
          };
          
          // Call Airtable API
          const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${tableIdSetting.value}/${article.externalId}`;
          console.log('Setting HTML content in Airtable');
          
          const airtableResponse = await fetch(airtableUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiKeySetting.value}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatePayload)
          });
          
          if (!airtableResponse.ok) {
            console.error('Failed to update Airtable:', await airtableResponse.text());
          }
        }
      } catch (airtableError) {
        console.error('Error syncing HTML content to Airtable:', airtableError);
        // Don't fail the whole operation if Airtable sync fails
      }
    }
    
    // Log activity
    await storage.createActivityLog({
      userId: 1, // Default to system user
      action: 'upload',
      resourceType: 'html_content',
      resourceId: articleId.toString(),
      details: {
        fieldName: 'content',
        contentSize: htmlContent.length,
        sourceFile: path.basename(filePath)
      }
    });
    
    return {
      success: true,
      message: 'HTML content extracted and set as article content'
    };
    
  } catch (error) {
    console.error('Error processing ZIP file:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Clean up
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp directory:', cleanupError);
    }
  }
}