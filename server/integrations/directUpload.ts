/**
 * Direct Upload API for large files
 * Provides endpoints for uploading images and ZIP files directly through the web interface
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';

// Configure multer for file uploads with larger size limits
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup storage for multer
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer middleware for image uploads (10MB limit)
const imageUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Multer middleware for ZIP uploads (50MB limit)
const zipUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

/**
 * Setup direct upload routes
 * @param app Express application instance
 */
export function setupDirectUploadRoutes(app: Express) {
  // Upload main article image
  app.post('/api/direct-upload/image', imageUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get article ID from the request
      const articleId = parseInt(req.body.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      // Verify article exists
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      console.log(`Processing direct image upload for article: ${article.title} (ID: ${articleId})`);
      
      // Upload to ImgBB
      const imgbbResult = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
      
      if (!imgbbResult) {
        return res.status(500).json({ message: 'Failed to upload image to ImgBB' });
      }
      
      // Update article with image URL
      const updateData = {
        imageUrl: imgbbResult.url,
        imageType: 'url'
      };
      
      const updatedArticle = await storage.updateArticle(articleId, updateData);
      
      if (!updatedArticle) {
        return res.status(500).json({ message: 'Failed to update article with image URL' });
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
                MainImageLink: imgbbResult.url
              }
            };
            
            // Call Airtable API
            const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${tableIdSetting.value}/${article.externalId}`;
            console.log('Setting MainImageLink:', imgbbResult.url);
            console.log('Airtable API request:', 'PATCH', airtableUrl);
            
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
          console.error('Error syncing image to Airtable:', airtableError);
          // Don't fail the whole operation if Airtable sync fails
        }
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: 'image',
        resourceId: articleId.toString(),
        details: {
          fieldName: 'MainImage',
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename: req.file.originalname
        }
      });
      
      // Cleanup temporary file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.json({
        success: true,
        message: 'Image uploaded successfully',
        imgbb: {
          id: imgbbResult.id,
          url: imgbbResult.url,
          display_url: imgbbResult.display_url
        }
      });
      
    } catch (error) {
      console.error('Error in direct image upload:', error);
      
      // Clean up the temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        message: 'Failed to process image upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload Instagram image
  app.post('/api/direct-upload/instagram-image', imageUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get article ID from the request
      const articleId = parseInt(req.body.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      // Verify article exists
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      console.log(`Processing direct Instagram image upload for article: ${article.title} (ID: ${articleId})`);
      
      // Upload to ImgBB
      const imgbbResult = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
      
      if (!imgbbResult) {
        return res.status(500).json({ message: 'Failed to upload Instagram image to ImgBB' });
      }
      
      // Update article with Instagram image URL
      const updateData = {
        instagramImageUrl: imgbbResult.url
      };
      
      const updatedArticle = await storage.updateArticle(articleId, updateData);
      
      if (!updatedArticle) {
        return res.status(500).json({ message: 'Failed to update article with Instagram image URL' });
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
                InstaPhotoLink: imgbbResult.url
              }
            };
            
            // Call Airtable API
            const airtableUrl = `https://api.airtable.com/v0/${baseIdSetting.value}/${tableIdSetting.value}/${article.externalId}`;
            console.log('Setting InstaPhotoLink:', imgbbResult.url);
            console.log('Airtable API request:', 'PATCH', airtableUrl);
            
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
          console.error('Error syncing Instagram image to Airtable:', airtableError);
          // Don't fail the whole operation if Airtable sync fails
        }
      }
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: 'image',
        resourceId: articleId.toString(),
        details: {
          fieldName: 'InstaPhotoLink',
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename: req.file.originalname
        }
      });
      
      // Cleanup temporary file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.json({
        success: true,
        message: 'Instagram image uploaded successfully',
        imgbb: {
          id: imgbbResult.id,
          url: imgbbResult.url,
          display_url: imgbbResult.display_url
        }
      });
      
    } catch (error) {
      console.error('Error in direct Instagram image upload:', error);
      
      // Clean up the temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        message: 'Failed to process Instagram image upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload and process ZIP file with HTML content
  app.post('/api/direct-upload/html-zip', zipUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get article ID from the request
      const articleId = parseInt(req.body.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      // Verify article exists
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      console.log(`Processing direct ZIP upload for article: ${article.title} (ID: ${articleId})`);
      
      // Process the ZIP file
      const result = await processZipFile(req.file.path, articleId);
      
      // Log activity regardless of success
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: 'html',
        resourceId: articleId.toString(),
        details: {
          filename: req.file.originalname,
          success: result.success,
          message: result.message
        }
      });
      
      // Cleanup temporary file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      if (!result.success) {
        return res.status(400).json({
          message: result.message
        });
      }
      
      return res.json({
        success: true,
        message: result.message
      });
      
    } catch (error) {
      console.error('Error in direct ZIP upload:', error);
      
      // Clean up the temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        message: 'Failed to process ZIP file',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}