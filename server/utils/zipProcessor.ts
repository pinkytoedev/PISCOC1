/**
 * ZIP File Processor
 * Extracts HTML content from ZIP files for articles
 */

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import * as util from 'util';
import { exec } from 'child_process';
import { uploadImageToImgBB, UploadedFileInfo, ImgBBUploadResponse } from './imgbbUploader';
import { InsertImageAsset } from '../../shared/schema';

// Promisify exec
const execPromise = util.promisify(exec);

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(extension: string): string {
  const ext = extension.toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp'
  };
  
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Escape string for use in regular expressions
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build common path variations for matching asset references
 */
function getPathVariations(filePath: string): string[] {
  const variations = new Set<string>();
  const normalized = filePath.split(path.sep).join('/');
  const withLeadingDot = normalized.startsWith('./') ? normalized : `./${normalized}`;
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const basename = path.basename(normalized);
  const encoded = encodeURI(normalized);
  const encodedWithDot = encodeURI(withLeadingDot);
  const encodedWithSlash = encodeURI(withLeadingSlash);

  [
    filePath,
    normalized,
    normalized.replace(/\\/g, '/'),
    withLeadingDot,
    withLeadingSlash,
    basename,
    encoded,
    encodedWithDot,
    encodedWithSlash
  ].forEach(variant => {
    const trimmed = variant.replace(/^\.\//, './');
    if (trimmed) {
      variations.add(trimmed);
      if (!trimmed.startsWith('/')) {
        variations.add(`/${trimmed}`);
      }
    }
  });

  return Array.from(variations);
}

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
    
    // Recursive file finder helper function
    const findFiles = (dir: string, extensions: string[]): string[] => {
      let results: string[] = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          results = results.concat(findFiles(itemPath, extensions));
        } else if (extensions.some(ext => item.toLowerCase().endsWith(ext.toLowerCase()))) {
          results.push(itemPath);
        }
      }
      
      return results;
    };
    
    // Look for HTML files recursively
    const findHtmlFiles = (dir: string): string[] => {
      return findFiles(dir, ['.html']);
    };
    
    // Look for image files recursively
    const findImageFiles = (dir: string): string[] => {
      return findFiles(dir, ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
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
    let htmlContent = fs.readFileSync(mainHtmlFile, 'utf-8');
    if (!htmlContent) {
      throw new Error(`HTML file is empty: ${path.basename(mainHtmlFile)}`);
    }

    // Find all CSS files in the extracted ZIP
    const cssFiles = findFiles(tempDir, ['.css']);

    // Find all image files in the extracted ZIP
    const imageFiles = findImageFiles(tempDir);
    console.log(`Found ${imageFiles.length} image files in ZIP archive`);
    
    // Upload images to ImgBB and build a mapping of original paths to new URLs
    const imageMapping: Record<string, string> = {};
    
    if (imageFiles.length > 0) {
      for (const imagePath of imageFiles) {
        const relativePath = path.relative(tempDir, imagePath);
        const mimeType = getMimeTypeFromExtension(path.extname(imagePath));
        
        // Prepare for ImgBB upload
        const fileInfo: UploadedFileInfo = {
          path: imagePath,
          filename: path.basename(imagePath),
          size: fs.statSync(imagePath).size,
          mimetype: mimeType
        };
        
        // Upload to ImgBB
        console.log(`Uploading image: ${relativePath}`);
        const uploadResult = await uploadImageToImgBB(fileInfo);
        
        if (uploadResult) {
          // Store the mapping of original path to ImgBB URL
          imageMapping[relativePath] = uploadResult.display_url;
          console.log(`Uploaded image ${relativePath} to ImgBB: ${uploadResult.display_url}`);
          
          // Also store the image in our database
          const imageAsset: InsertImageAsset = {
            originalFilename: path.basename(imagePath),
            storagePath: uploadResult.url,
            mimeType: fileInfo.mimetype,
            size: fileInfo.size,
            hash: uploadResult.id,
            isDefault: false,
            category: 'article',
            metadata: {
              articleId,
              originalPath: relativePath,
              displayUrl: uploadResult.display_url,
              imgbbData: uploadResult
            }
          };
          await storage.createImageAsset(imageAsset);
        } else {
          console.warn(`Failed to upload image: ${relativePath}`);
        }
      }
      
      // Replace image paths in HTML content
      Object.entries(imageMapping).forEach(([originalPath, newUrl]) => {
       
        // Replace all variations of the path with the new URL
        const pathVariations = getPathVariations(originalPath);

        pathVariations.forEach(pathVar => {
          const attributeRegex = new RegExp(`(src|href|data-src)=['"](${escapeRegExp(pathVar)})['"']`, 'gi');
          const inlineStyleRegex = new RegExp(`url\(\s*(['"])${escapeRegExp(pathVar)}\\1\s*\)`, 'gi');
          const inlineStyleNoQuoteRegex = new RegExp(`url\(\s*${escapeRegExp(pathVar)}\s*\)`, 'gi');

          htmlContent = htmlContent
            .replace(attributeRegex, `$1="${newUrl}"`)
            .replace(inlineStyleRegex, `url(${newUrl})`)
            .replace(inlineStyleNoQuoteRegex, `url(${newUrl})`);
        });
      });
    }

    // Inline CSS references and update asset URLs within stylesheets
    let combinedCss = '';

    if (cssFiles.length > 0) {
      console.log(`Inlining ${cssFiles.length} CSS files from ZIP archive`);

      for (const cssFile of cssFiles) {
        const relativeCssPath = path.relative(tempDir, cssFile).split(path.sep).join('/');
        let cssContent = fs.readFileSync(cssFile, 'utf-8');

        Object.entries(imageMapping).forEach(([originalPath, newUrl]) => {
          const pathVariations = getPathVariations(originalPath);

          pathVariations.forEach(pathVar => {
            const cssUrlRegex = new RegExp(`url\(\s*(['"])${escapeRegExp(pathVar)}\\1\s*\)`, 'gi');
            const cssUrlRegexNoQuote = new RegExp(`url\(\s*${escapeRegExp(pathVar)}\s*\)`, 'gi');
            cssContent = cssContent
              .replace(cssUrlRegex, `url(${newUrl})`)
              .replace(cssUrlRegexNoQuote, `url(${newUrl})`);
          });
        });

        combinedCss += `\n/* ${relativeCssPath} */\n${cssContent}\n`;

        // Remove link tags referencing this stylesheet from HTML content
        const cssVariations = getPathVariations(relativeCssPath);
        cssVariations.forEach(pathVar => {
          const linkRegex = new RegExp(`<link[^>]+href=['"]${escapeRegExp(pathVar)}['"][^>]*>`, 'gi');
          htmlContent = htmlContent.replace(linkRegex, '');
        });
      }
    }

    if (combinedCss.trim().length > 0) {
      const styleTag = `<style>${combinedCss}\n</style>`;
      if (/<head[^>]*>/i.test(htmlContent)) {
        htmlContent = htmlContent.replace(/<head[^>]*>/i, match => `${match}\n${styleTag}\n`);
      } else {
        htmlContent = `${styleTag}\n${htmlContent}`;
      }
    }

    // Extract meaningful content from the HTML document
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let finalHtmlContent = bodyMatch ? bodyMatch[1] : htmlContent;

    if (!bodyMatch) {
      const htmlMatch = htmlContent.match(/<html[^>]*>([\s\S]*?)<\/html>/i);
      if (htmlMatch) {
        finalHtmlContent = htmlMatch[1];
      }
    }

    const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      let headContent = headMatch[1];
      headContent = headContent.replace(/<title[\s\S]*?<\/title>/gi, '');
      headContent = headContent.replace(/<meta[^>]*>/gi, '');

      if (headContent.trim()) {
        finalHtmlContent = `${headContent}\n${finalHtmlContent}`;
      }
    }

    finalHtmlContent = finalHtmlContent.replace(/<!DOCTYPE[^>]*>/gi, '').trim();
    
    // Update article content
    const article = await storage.getArticle(articleId);
    if (!article) {
      throw new Error(`Article with ID ${articleId} not found`);
    }
    
    const updatedArticle = await storage.updateArticle(articleId, {
      content: finalHtmlContent,
      contentFormat: 'html'
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
              body: htmlContent
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
        contentSize: finalHtmlContent.length,
        sourceFile: path.basename(filePath)
      }
    });
    
    return {
      success: true,
      message: `HTML content extracted and set as article content. ${Object.keys(imageMapping).length} images processed and uploaded to ImgBB.`
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