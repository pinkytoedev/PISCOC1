import { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { upload } from '../utils/fileUpload';
import { uploadImageToImgBB, uploadImageUrlToImgBB } from '../utils/imgbbUploader';
import { cleanupUploadedFile, uploadImageUrlToAirtable, uploadImageUrlAsLinkField } from '../utils/imageUploader';

export function setupImgBBRoutes(app: Express) {
  // Get ImgBB integration settings
  app.get('/api/imgbb/settings', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const settings = await storage.getIntegrationSettings('imgbb');
      res.json(settings);
    } catch (error) {
      console.error('Error fetching ImgBB settings:', error);
      res.status(500).json({ 
        message: 'Failed to fetch ImgBB settings',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update ImgBB integration setting
  app.post('/api/imgbb/settings/:key', async (req: Request, res: Response) => {
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
      const setting = await storage.getIntegrationSettingByKey('imgbb', key);
      
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
          details: { service: 'imgbb', key }
        });
        
        res.json(updated);
      } else {
        // Create new setting
        const created = await storage.createIntegrationSetting({
          service: 'imgbb',
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
          details: { service: 'imgbb', key }
        });
        
        res.json(created);
      }
    } catch (error) {
      console.error('Error updating ImgBB setting:', error);
      res.status(500).json({ 
        message: 'Failed to update ImgBB setting',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image to ImgBB and then to Airtable
  app.post('/api/imgbb/upload-to-airtable/:articleId/:fieldName', upload.single('image'), async (req: Request, res: Response) => {
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
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: 'No image file uploaded' });
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
      
      // Step 1: Upload image to ImgBB
      const file = {
        path: req.file.path,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
      
      const imgbbResult = await uploadImageToImgBB(file);
      
      // Always cleanup the uploaded file after processing
      cleanupUploadedFile(file.path);
      
      if (!imgbbResult) {
        return res.status(500).json({ message: 'Failed to upload image to ImgBB' });
      }
      
      // Map target field name for Airtable
      const targetFieldName = fieldName === 'instaPhoto' ? 'InstaPhoto' : 'MainImage';
      
      // Step 2: Upload to Airtable using link field
      const airtableResult = await uploadImageUrlAsLinkField(
        imgbbResult.url,
        article.externalId,
        targetFieldName
      );
      
      if (!airtableResult) {
        return res.status(500).json({ 
          message: 'Image uploaded to ImgBB but failed to update Airtable',
          imgbbUrl: imgbbResult.url
        });
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgbbResult.url;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgbbResult.url;
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
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename: file.filename
        }
      });
      
      res.json({
        message: `Image uploaded successfully to ImgBB and then to ${fieldName}`,
        imgbb: {
          id: imgbbResult.id,
          url: imgbbResult.url,
          display_url: imgbbResult.display_url
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in ImgBB to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Upload an image URL to ImgBB and then to Airtable
  app.post('/api/imgbb/upload-url-to-airtable/:articleId/:fieldName', async (req: Request, res: Response) => {
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
      
      // Step 1: Upload URL to ImgBB
      const imgbbResult = await uploadImageUrlToImgBB(imageUrl, filename);
      
      if (!imgbbResult) {
        return res.status(500).json({ message: 'Failed to upload image URL to ImgBB' });
      }
      
      // Map target field name for Airtable
      const targetFieldName = fieldName === 'instaPhoto' ? 'InstaPhoto' : 'MainImage';
      
      // Step 2: Upload to Airtable using link field
      const airtableResult = await uploadImageUrlAsLinkField(
        imgbbResult.url,
        article.externalId,
        targetFieldName
      );
      
      if (!airtableResult) {
        return res.status(500).json({ 
          message: 'Image uploaded to ImgBB but failed to update Airtable',
          imgbbUrl: imgbbResult.url 
        });
      }
      
      // Step 3: Update the article in the database with the new image URL
      const updateData: any = {};
      
      if (fieldName === 'MainImage') {
        updateData.imageUrl = imgbbResult.url;
        updateData.imageType = 'url';
      } else if (fieldName === 'instaPhoto') {
        updateData.instagramImageUrl = imgbbResult.url;
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
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename
        }
      });
      
      res.json({
        message: `Image URL uploaded successfully to ImgBB and then to ${fieldName}`,
        imgbb: {
          id: imgbbResult.id,
          url: imgbbResult.url,
          display_url: imgbbResult.display_url
        },
        airtable: airtableResult
      });
    } catch (error) {
      console.error('Error in ImgBB URL to Airtable upload:', error);
      res.status(500).json({ 
        message: 'Failed to process image URL upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}