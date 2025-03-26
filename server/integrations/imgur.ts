import { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { upload } from '../utils/fileUpload';
import { uploadImageToImgur, uploadImageUrlToImgur } from '../utils/imgurUploader';
import { cleanupUploadedFile } from '../utils/imageUploader';
import { uploadImageUrlToAirtable } from '../utils/imageUploader';

export function setupImgurRoutes(app: Express) {
  // Get Imgur integration settings
  app.get('/api/imgur/settings', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const settings = await storage.getIntegrationSettings('imgur');
      res.json(settings);
    } catch (error) {
      console.error('Error fetching Imgur settings:', error);
      res.status(500).json({ 
        message: 'Failed to fetch Imgur settings',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update Imgur integration setting
  app.post('/api/imgur/settings/:key', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { key } = req.params;
      const { value, enabled } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ message: 'Value is required' });
      }
      
      // Check if setting already exists
      const setting = await storage.getIntegrationSettingByKey('imgur', key);
      
      if (setting) {
        // Update existing setting
        const updated = await storage.updateIntegrationSetting(setting.id, {
          value,
          enabled: enabled !== undefined ? enabled : setting.enabled
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'update',
          resourceType: 'integration_setting',
          resourceId: setting.id.toString(),
          details: { service: 'imgur', key }
        });
        
        res.json(updated);
      } else {
        // Create new setting
        const created = await storage.createIntegrationSetting({
          service: 'imgur',
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'create',
          resourceType: 'integration_setting',
          resourceId: created.id.toString(),
          details: { service: 'imgur', key }
        });
        
        res.json(created);
      }
    } catch (error) {
      console.error('Error updating Imgur setting:', error);
      res.status(500).json({ 
        message: 'Failed to update Imgur setting',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image to Imgur and then to Airtable
  app.post('/api/imgur/upload-to-airtable/:articleId/:fieldName', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage' or 'instaPhoto'" });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Check if this is an Airtable article
      if (article.source !== 'airtable' || !article.externalId) {
        return res.status(400).json({ message: 'This article is not from Airtable' });
      }
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: 'No image file uploaded' });
      }
      
      const file = {
        path: req.file.path,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
      
      // Step 1: Upload to Imgur
      const imgurResult = await uploadImageToImgur(file);
      
      // Always cleanup the uploaded file after processing
      cleanupUploadedFile(file.path);
      
      if (!imgurResult) {
        return res.status(500).json({ message: 'Failed to upload image to Imgur' });
      }
      
      // Step 2: Upload Imgur URL to Airtable
      const airtableResult = await uploadImageUrlToAirtable(
        imgurResult.link,
        article.externalId,
        fieldName,
        file.filename
      );
      
      if (!airtableResult) {
        return res.status(500).json({ 
          message: 'Image uploaded to Imgur but failed to update Airtable',
          imgurLink: imgurResult.link 
        });
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgurResult.link;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgurResult.link;
      }
      
      await storage.updateArticle(articleId, updateData);
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: 'image',
        resourceId: articleId.toString(),
        details: {
          fieldName,
          imgurId: imgurResult.id,
          imgurLink: imgurResult.link,
          filename: file.filename
        }
      });
      
      res.json({
        message: `Image uploaded successfully to Imgur and then to ${fieldName}`,
        imgur: {
          id: imgurResult.id,
          link: imgurResult.link,
          deletehash: imgurResult.deletehash
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in Imgur to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image URL to Imgur and then to Airtable
  app.post('/api/imgur/upload-url-to-airtable/:articleId/:fieldName', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      const fieldName = req.params.fieldName;
      if (!fieldName || (fieldName !== 'MainImage' && fieldName !== 'instaPhoto')) {
        return res.status(400).json({ message: "Invalid field name. Must be 'MainImage' or 'instaPhoto'" });
      }
      
      const { imageUrl, filename } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }
      
      if (!filename) {
        return res.status(400).json({ message: 'Filename is required' });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Check if this is an Airtable article
      if (article.source !== 'airtable' || !article.externalId) {
        return res.status(400).json({ message: 'This article is not from Airtable' });
      }
      
      // Step 1: Upload URL to Imgur
      const imgurResult = await uploadImageUrlToImgur(imageUrl, filename);
      
      if (!imgurResult) {
        return res.status(500).json({ message: 'Failed to upload image URL to Imgur' });
      }
      
      // Step 2: Upload Imgur URL to Airtable
      const airtableResult = await uploadImageUrlToAirtable(
        imgurResult.link,
        article.externalId,
        fieldName,
        filename
      );
      
      if (!airtableResult) {
        return res.status(500).json({ 
          message: 'Image uploaded to Imgur but failed to update Airtable',
          imgurLink: imgurResult.link 
        });
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgurResult.link;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgurResult.link;
      }
      
      await storage.updateArticle(articleId, updateData);
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'upload',
        resourceType: 'image_url',
        resourceId: articleId.toString(),
        details: {
          fieldName,
          originalUrl: imageUrl,
          imgurId: imgurResult.id,
          imgurLink: imgurResult.link,
          filename
        }
      });
      
      res.json({
        message: `Image URL uploaded successfully to Imgur and then to ${fieldName}`,
        imgur: {
          id: imgurResult.id,
          link: imgurResult.link,
          deletehash: imgurResult.deletehash
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in Imgur URL to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image URL upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}