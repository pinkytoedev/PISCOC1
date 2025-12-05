/**
 * ZIP File Processor
 * Extracts HTML content from ZIP files for articles
 */

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import extract from 'extract-zip';
import { uploadImageToImgBB, UploadedFileInfo, ImgBBUploadResponse } from './imgbbUploader';
import { InsertImageAsset } from '../../shared/schema';

// No external unzip binary required; we use extract-zip

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
 * Build a set of common path variations so we can find and replace references
 * regardless of leading `./`, `/`, or nested directory components.
 */
function getPathVariations(originalPath: string): string[] {
  const normalizedPath = originalPath.replace(/\\/g, '/');
  const basename = path.basename(normalizedPath);

  return [normalizedPath, `./${normalizedPath}`, `/${normalizedPath}`, basename];
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

    // Extract ZIP using extract-zip (works in Railway without system unzip)
    console.log(`Extracting ZIP file to ${tempDir} using extract-zip...`);
    await extract(filePath, { dir: tempDir });

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
        // Handle different path patterns (with or without leading ./, relative paths, etc.)
        const pathVariations = getPathVariations(originalPath);

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
        const tableNameSetting = await storage.getIntegrationSettingByKey('airtable', 'articles_table');

        if (apiKeySetting?.value && baseIdSetting?.value && tableNameSetting?.value) {
          // Prepare Airtable update
          const updatePayload = {
            fields: {
              content: finalHtmlContent,
              body: finalHtmlContent
            }
          };

          // Call Airtable API
          const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${tableNameSetting.value}/${article.externalId}`;
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