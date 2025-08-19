import { Express, Request, Response } from 'express';
import fetch from 'node-fetch';
import FormData from 'form-data';
import multer from 'multer';
import fs from 'fs';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Helper function to get ImgBB settings
async function getImgBBSettings() {
  const settings = await storage.getIntegrationSettings('imgbb');
  const dbApiKey = settings.find(s => s.key === 'api_key')?.value;
  const dbEnabled = settings.find(s => s.key === 'api_key')?.enabled !== false;
  
  // Fallback to environment variable if not configured in database
  const apiKey = dbApiKey || process.env.IMGBB_API_KEY;
  
  // If we have an API key from environment but no database entry or disabled database entry,
  // consider it enabled
  const enabled = !!apiKey && (dbEnabled || !dbApiKey);
  
  return {
    apiKey,
    enabled,
  };
}

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
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get ImgBB settings
      const settings = await getImgBBSettings();
      
      // Make sure ImgBB integration is enabled and has an API key
      if (!settings.enabled || !settings.apiKey) {
        return res.status(400).json({ message: 'ImgBB integration is not enabled or not configured properly' });
      }
      
      // Upload to ImgBB
      const imgbbResult = await uploadImageToImgBB({
        path: req.file.path,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
      
      if (!imgbbResult) {
        throw new Error('Failed to upload to ImgBB');
      }
      
      // Update Airtable with the new ImgBB URL
      const article = await storage.getArticle(articleId);
      if (!article) {
        throw new Error(`Article with ID ${articleId} not found`);
      }
      
      // Make sure article has an external ID (Airtable ID)
      if (!article.externalId) {
        throw new Error(`Article with ID ${articleId} does not have an external ID`);
      }
      
      // Get Airtable settings
      const airtableSettings = await storage.getIntegrationSettings('airtable');
      const apiKey = airtableSettings.find(s => s.key === 'api_key')?.value;
      const baseId = airtableSettings.find(s => s.key === 'base_id')?.value;
      const tableName = airtableSettings.find(s => s.key === 'articles_table')?.value;
      
      if (!apiKey || !baseId || !tableName) {
        throw new Error('Airtable integration is not configured properly');
      }
      
      // Instead of updating the Airtable attachment field, we'll update the URL field for the image
      // Use MainImageLink for MainImage and InstaPhotoLink for instaPhoto
      const linkFieldName = fieldName === 'MainImage' ? 'MainImageLink' : 'InstaPhotoLink';
      
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${article.externalId}`;
      
      const updates = {
        fields: {
          [linkFieldName]: imgbbResult.url
        }
      };
      
      const airtableResponse = await fetch(airtableUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.error('Airtable Error:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: 'Unknown error' };
        }
        
        // Check if this is a field error (field doesn't exist)
        if (airtableResponse.status === 422 && errorData.error?.type === 'UNKNOWN_FIELD_NAME') {
          throw new Error(`The field "${linkFieldName}" does not exist in your Airtable table. You need to create a URL or Text field with this name in your Airtable table.`);
        }
        
        throw new Error(`Failed to update Airtable: ${errorText}`);
      }
      
      const airtableResult = await airtableResponse.json();
      
      // Clean up the temporary file
      fs.unlinkSync(req.file.path);
      
      // Return success response
      res.json({
        success: true,
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
      
      // Clean up the temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
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
      
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }
      
      // Get ImgBB settings
      const settings = await getImgBBSettings();
      
      // Make sure ImgBB integration is enabled and has an API key
      if (!settings.enabled || !settings.apiKey) {
        return res.status(400).json({ message: 'ImgBB integration is not enabled or not configured properly' });
      }
      
      // Upload to ImgBB
      const formData = new FormData();
      formData.append('key', settings.apiKey);
      formData.append('image', imageUrl);
      
      const imgbbResponse = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!imgbbResponse.ok) {
        const errorText = await imgbbResponse.text();
        throw new Error(`Failed to upload to ImgBB: ${errorText}`);
      }
      
      const imgbbResult = await imgbbResponse.json();
      
      if (!imgbbResult.success) {
        throw new Error('ImgBB upload failed: ' + (imgbbResult.error?.message || 'Unknown error'));
      }
      
      // Update Airtable with the new ImgBB URL
      const article = await storage.getArticle(articleId);
      if (!article) {
        throw new Error(`Article with ID ${articleId} not found`);
      }
      
      // Make sure article has an external ID (Airtable ID)
      if (!article.externalId) {
        throw new Error(`Article with ID ${articleId} does not have an external ID`);
      }
      
      // Get Airtable settings
      const airtableSettings = await storage.getIntegrationSettings('airtable');
      const apiKey = airtableSettings.find(s => s.key === 'api_key')?.value;
      const baseId = airtableSettings.find(s => s.key === 'base_id')?.value;
      const tableName = airtableSettings.find(s => s.key === 'articles_table')?.value;
      
      if (!apiKey || !baseId || !tableName) {
        throw new Error('Airtable integration is not configured properly');
      }
      
      // Instead of updating the Airtable attachment field, we'll update the URL field
      const linkFieldName = fieldName === 'MainImage' ? 'MainImageLink' : 'InstaPhotoLink';
      
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${article.externalId}`;
      
      const updates = {
        fields: {
          [linkFieldName]: imgbbResult.data.url
        }
      };
      
      const airtableResponse = await fetch(airtableUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.error('Airtable Error:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: 'Unknown error' };
        }
        
        // Check if this is a field error (field doesn't exist)
        if (airtableResponse.status === 422 && errorData.error?.type === 'UNKNOWN_FIELD_NAME') {
          throw new Error(`The field "${linkFieldName}" does not exist in your Airtable table. You need to create a URL or Text field with this name in your Airtable table.`);
        }
        
        throw new Error(`Failed to update Airtable: ${errorText}`);
      }
      
      const airtableResult = await airtableResponse.json();
      
      // Return success response
      res.json({
        success: true,
        message: `Image URL uploaded successfully to ImgBB and then to ${fieldName}`,
        imgbb: {
          id: imgbbResult.data.id,
          url: imgbbResult.data.url,
          display_url: imgbbResult.data.display_url
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