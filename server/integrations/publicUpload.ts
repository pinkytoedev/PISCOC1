/**
 * Public Direct Upload API
 * Allows non-authenticated users to upload files using secure tokens
 */

import { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';
import { generateUniqueToken, calculateExpirationDate } from '../utils/tokenGenerator';
import type { UploadToken, Article } from '../../shared/schema';

// Extend Request interface to include our custom properties
declare global {
  namespace Express {
    interface Request {
      uploadToken?: UploadToken;
      targetArticle?: Article;
      requestedUploadType?: string;
    }
  }
}

// Configure multer for file uploads (same configuration as directUpload.ts)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

// Token verification middleware
async function verifyUploadToken(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token || req.query.token;
  
  if (!token) {
    return res.status(401).json({ message: 'No upload token provided' });
  }
  
  try {
    // Check if token exists and is valid
    const uploadToken = await storage.getUploadTokenByToken(token as string);
    
    if (!uploadToken) {
      return res.status(401).json({ message: 'Invalid upload token' });
    }
    
    if (!uploadToken.active) {
      return res.status(401).json({ message: 'Upload token is inactive' });
    }
    
    const now = new Date();
    if (uploadToken.expiresAt < now) {
      // Update token status to inactive
      await storage.updateUploadToken(uploadToken.id, { active: false });
      return res.status(401).json({ message: 'Upload token has expired' });
    }
    
    // Handle null values safely
    const maxUses = uploadToken.maxUses ?? 0;
    const uses = uploadToken.uses ?? 0;
    
    if (maxUses > 0 && uses >= maxUses) {
      return res.status(401).json({ message: 'Upload token has reached maximum uses' });
    }
    
    // Check if article still exists
    const article = await storage.getArticle(uploadToken.articleId);
    if (!article) {
      return res.status(404).json({ message: 'Target article not found' });
    }
    
    // Attach token and article to the request for use in handlers
    req.uploadToken = uploadToken;
    req.targetArticle = article;
    
    next();
  } catch (error) {
    console.error('Error verifying upload token:', error);
    return res.status(500).json({ message: 'Server error validating upload token' });
  }
}

// Token verification middleware with upload type validation
async function verifyUploadTokenWithType(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token || req.query.token;
  const uploadType = req.params.uploadType;
  
  if (!token) {
    return res.status(401).json({ message: 'No upload token provided' });
  }
  
  if (!uploadType) {
    return res.status(400).json({ message: 'Upload type is required' });
  }
  
  try {
    // Check if token exists and is valid
    const uploadToken = await storage.getUploadTokenByToken(token as string);
    
    if (!uploadToken) {
      return res.status(401).json({ message: 'Invalid upload token' });
    }
    
    if (!uploadToken.active) {
      return res.status(401).json({ message: 'Upload token is inactive' });
    }
    
    const now = new Date();
    if (uploadToken.expiresAt < now) {
      // Update token status to inactive
      await storage.updateUploadToken(uploadToken.id, { active: false });
      return res.status(401).json({ message: 'Upload token has expired' });
    }
    
    // Handle null values safely
    const maxUses = uploadToken.maxUses ?? 0;
    const uses = uploadToken.uses ?? 0;
    
    if (maxUses > 0 && uses >= maxUses) {
      return res.status(401).json({ message: 'Upload token has reached maximum uses' });
    }
    
    // Check if the requested upload type is supported by this token
    const uploadTypes = Array.isArray(uploadToken.uploadTypes) ? uploadToken.uploadTypes : [];
    if (!uploadTypes.includes(uploadType)) {
      return res.status(403).json({ 
        message: `This token does not support ${uploadType} uploads. Supported types: ${uploadTypes.join(', ')}` 
      });
    }
    
    // Check if article still exists
    const article = await storage.getArticle(uploadToken.articleId);
    if (!article) {
      return res.status(404).json({ message: 'Target article not found' });
    }
    
    // Attach token and article to the request for use in handlers
    req.uploadToken = uploadToken;
    req.targetArticle = article;
    req.requestedUploadType = uploadType;
    
    next();
  } catch (error) {
    console.error('Error verifying upload token:', error);
    return res.status(500).json({ message: 'Server error validating upload token' });
  }
}

/**
 * Setup public direct upload routes
 * @param app Express application instance
 */
export function setupPublicUploadRoutes(app: Express) {
  // DEPRECATED: Token generation endpoint (requires authentication)
  // Consider migrating integrations to use the new token-free endpoints
  app.post('/api/public-upload/generate-token', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { 
        articleId, 
        uploadTypes = ['image'], // Now accepts array of upload types
        expirationDays = 7, 
        maxUses = 1,
        name, 
        notes 
      } = req.body;
      
      if (!articleId) {
        return res.status(400).json({ message: 'Article ID is required' });
      }
      
      // Valid upload types
      const validUploadTypes = ['image', 'instagram-image', 'html-zip'];
      
      // Validate uploadTypes is an array
      if (!Array.isArray(uploadTypes) || uploadTypes.length === 0) {
        return res.status(400).json({ 
          message: 'uploadTypes must be a non-empty array' 
        });
      }
      
      // Validate each upload type
      const invalidTypes = uploadTypes.filter(type => !validUploadTypes.includes(type));
      if (invalidTypes.length > 0) {
        return res.status(400).json({ 
          message: `Invalid upload types: ${invalidTypes.join(', ')}. Must be one of: ${validUploadTypes.join(', ')}`
        });
      }
      
      // Verify article exists
      const article = await storage.getArticle(parseInt(articleId));
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Generate unique token
      const token = await generateUniqueToken(async (token) => {
        const existingToken = await storage.getUploadTokenByToken(token);
        return !!existingToken;
      });
      
      // Calculate expiration date
      const expiresAt = calculateExpirationDate(expirationDays);
      
      // Create token record
      const uploadToken = await storage.createUploadToken({
        token,
        articleId: article.id,
        uploadTypes,
        createdById: req.user?.id,
        expiresAt,
        maxUses,
        active: true,
        name: name || `Multi-upload for ${article.title}`,
        notes: notes || ''
      });
      
      // Log activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'create',
        resourceType: 'upload-token',
        resourceId: uploadToken.id.toString(),
        details: {
          articleId: article.id,
          articleTitle: article.title,
          uploadTypes,
          expiresAt,
          maxUses
        }
      });
      
      return res.json({
        success: true,
        token: uploadToken.token,
        uploadUrl: `/public-upload/${uploadToken.token}`, // New unified URL
        uploadTypes: uploadToken.uploadTypes,
        expiresAt: uploadToken.expiresAt,
        maxUses: uploadToken.maxUses
      });
      
    } catch (error) {
      console.error('Error generating upload token:', error);
      return res.status(500).json({
        message: 'Failed to generate upload token',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // List tokens for an article (requires authentication)
  app.get('/api/public-upload/tokens/:articleId', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      // Verify article exists
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Get tokens for this article
      const tokens = await storage.getUploadTokensByArticle(articleId);
      
      // Cleanup by inactivating any expired tokens
      await storage.inactivateExpiredTokens();
      
      return res.json({
        articleId,
        articleTitle: article.title,
        tokens: tokens.map(token => ({
          id: token.id,
          token: token.token,
          uploadTypes: token.uploadTypes,
          uploadUrl: `/public-upload/${token.token}`, // New unified URL
          createdAt: token.createdAt,
          expiresAt: token.expiresAt,
          maxUses: token.maxUses,
          uses: token.uses,
          active: token.active,
          name: token.name,
          notes: token.notes
        }))
      });
      
    } catch (error) {
      console.error('Error retrieving upload tokens:', error);
      return res.status(500).json({
        message: 'Failed to retrieve upload tokens',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete a token (requires authentication)
  app.delete('/api/public-upload/tokens/:id', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const tokenId = parseInt(req.params.id);
      if (isNaN(tokenId)) {
        return res.status(400).json({ message: 'Invalid token ID' });
      }
      
      // Get token for logging purposes
      const token = await storage.getUploadToken(tokenId);
      if (!token) {
        return res.status(404).json({ message: 'Token not found' });
      }
      
      // Delete the token
      const success = await storage.deleteUploadToken(tokenId);
      
      if (success) {
        // Log activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'delete',
          resourceType: 'upload-token',
          resourceId: tokenId.toString(),
          details: {
            articleId: token.articleId,
            uploadTypes: token.uploadTypes
          }
        });
        
        return res.status(200).json({ success: true });
      } else {
        return res.status(500).json({ message: 'Failed to delete token' });
      }
      
    } catch (error) {
      console.error('Error deleting upload token:', error);
      return res.status(500).json({
        message: 'Failed to delete upload token',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // New unified upload endpoint that handles all upload types
  app.post('/api/public-upload/:token/:uploadType', verifyUploadTokenWithType, (req: Request, res: Response, next: NextFunction) => {
    // Determine which multer middleware to use based on upload type
    const uploadType = req.params.uploadType;
    
    if (uploadType === 'image' || uploadType === 'instagram-image') {
      return imageUpload.single('file')(req, res, next);
    } else if (uploadType === 'html-zip') {
      return zipUpload.single('file')(req, res, next);
    } else {
      return res.status(400).json({ message: 'Invalid upload type' });
    }
  }, async (req: Request, res: Response) => {
    try {
      // Token, article, and upload type are attached by verifyUploadTokenWithType middleware
      if (!req.uploadToken || !req.targetArticle || !req.requestedUploadType) {
        return res.status(500).json({ message: 'Internal server error - token data missing' });
      }
      
      const uploadToken = req.uploadToken;
      const article = req.targetArticle;
      const uploadType = req.requestedUploadType;
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      console.log(`Processing unified public upload for type '${uploadType}' - article: ${article.title} (ID: ${article.id}) with token: ${uploadToken.token}`);
      
      let result;
      
      // Handle different upload types
      if (uploadType === 'image') {
        // Upload to ImgBB for main article image
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
        
        const updatedArticle = await storage.updateArticle(article.id, updateData);
        
        if (!updatedArticle) {
          return res.status(500).json({ message: 'Failed to update article with image URL' });
        }
        
        result = {
          success: true,
          message: 'Main image uploaded successfully',
          imgbb: {
            id: imgbbResult.id,
            url: imgbbResult.url,
            display_url: imgbbResult.display_url
          }
        };
        
      } else if (uploadType === 'instagram-image') {
        // Upload to ImgBB for Instagram image
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
        
        const updatedArticle = await storage.updateArticle(article.id, updateData);
        
        if (!updatedArticle) {
          return res.status(500).json({ message: 'Failed to update article with Instagram image URL' });
        }
        
        result = {
          success: true,
          message: 'Instagram image uploaded successfully',
          imgbb: {
            id: imgbbResult.id,
            url: imgbbResult.url,
            display_url: imgbbResult.display_url
          }
        };
        
      } else if (uploadType === 'html-zip') {
        // Process ZIP file with HTML content
        const zipResult = await processZipFile(req.file.path, article.id);
        
        if (!zipResult.success) {
          return res.status(500).json({ 
            message: 'Failed to process ZIP file',
            details: zipResult.message
          });
        }
        
        // The processZipFile function already updates the article with the HTML content
        // So we don't need to do it here again
        
        result = {
          success: true,
          message: 'HTML ZIP file processed successfully',
          details: zipResult.message,
          html: zipResult.html
        };
      }
      
      // Increment token usage
      await storage.incrementUploadTokenUses(uploadToken.id);
      
      // Log activity (without userId since it's a public upload)
      await storage.createActivityLog({
        action: 'upload',
        resourceType: uploadType,
        resourceId: article.id.toString(),
        details: {
          uploadType: uploadType,
          filename: req.file.originalname,
          uploadToken: uploadToken.token
        }
      });
      
      // Cleanup temporary file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.json(result);
      
    } catch (error) {
      console.error('Error in unified public upload:', error);
      
      // Clean up the temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        message: 'Failed to process upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Public upload endpoints (require valid token)
  
  // Upload main article image with token
  app.post('/api/public-upload/image/:token', verifyUploadToken, imageUpload.single('file'), async (req: Request, res: Response) => {
    try {
      // Token and article are attached by verifyUploadToken middleware
      if (!req.uploadToken || !req.targetArticle) {
        return res.status(500).json({ message: 'Internal server error - token data missing' });
      }
      
      const uploadToken = req.uploadToken;
      const article = req.targetArticle;
      
      if (!Array.isArray(uploadToken.uploadTypes) || !uploadToken.uploadTypes.includes('image')) {
        return res.status(400).json({ message: 'This token is not valid for image uploads' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      console.log(`Processing public image upload for article: ${article.title} (ID: ${article.id}) with token: ${uploadToken.token}`);
      
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
      
      const updatedArticle = await storage.updateArticle(article.id, updateData);
      
      if (!updatedArticle) {
        return res.status(500).json({ message: 'Failed to update article with image URL' });
      }
      
      // Increment token usage
      await storage.incrementUploadTokenUses(uploadToken.id);
      
      // Log activity (without userId since it's a public upload)
      await storage.createActivityLog({
        action: 'upload',
        resourceType: 'image',
        resourceId: article.id.toString(),
        details: {
          fieldName: 'MainImage',
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename: req.file.originalname,
          uploadToken: uploadToken.token
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
      console.error('Error in public image upload:', error);
      
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
  
  // Upload Instagram image with token
  app.post('/api/public-upload/instagram-image/:token', verifyUploadToken, imageUpload.single('file'), async (req: Request, res: Response) => {
    try {
      // Token and article are attached by verifyUploadToken middleware
      if (!req.uploadToken || !req.targetArticle) {
        return res.status(500).json({ message: 'Internal server error - token data missing' });
      }
      
      const uploadToken = req.uploadToken;
      const article = req.targetArticle;
      
      if (!Array.isArray(uploadToken.uploadTypes) || !uploadToken.uploadTypes.includes('instagram-image')) {
        return res.status(400).json({ message: 'This token is not valid for Instagram image uploads' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      console.log(`Processing public Instagram image upload for article: ${article.title} (ID: ${article.id}) with token: ${uploadToken.token}`);
      
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
      
      const updatedArticle = await storage.updateArticle(article.id, updateData);
      
      if (!updatedArticle) {
        return res.status(500).json({ message: 'Failed to update article with Instagram image URL' });
      }
      
      // For Airtable-sourced articles, update the Airtable link field
      if (article.source === 'airtable' && article.externalId) {
        try {
          console.log(`Updating Airtable with Instagram image URL for article: ${article.title} (${article.externalId})`);
          
          // Import the function to update Airtable link fields
          const { uploadImageUrlAsLinkField } = require('../utils/airtableLink');
          
          // Update the InstaPhotoLink field directly with the ImgBB URL
          const airtableResult = await uploadImageUrlAsLinkField(
            imgbbResult.url,
            article.externalId,
            'InstaPhotoLink' // Use InstaPhotoLink field instead of instaPhoto
          );
          
          if (airtableResult) {
            console.log(`Successfully updated Airtable InstaPhotoLink field for article: ${article.title}`);
          } else {
            console.error(`Failed to update Airtable InstaPhotoLink field for article: ${article.title}`);
          }
        } catch (airtableError) {
          console.error('Error updating Airtable with Instagram image URL:', airtableError);
          // Don't fail the overall process if Airtable update fails
        }
      }
      
      // Increment token usage
      await storage.incrementUploadTokenUses(uploadToken.id);
      
      // Log activity (without userId since it's a public upload)
      await storage.createActivityLog({
        action: 'upload',
        resourceType: 'image',
        resourceId: article.id.toString(),
        details: {
          fieldName: 'InstaPhotoLink',
          imgbbId: imgbbResult.id,
          imgbbUrl: imgbbResult.url,
          filename: req.file.originalname,
          uploadToken: uploadToken.token
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
      console.error('Error in public Instagram image upload:', error);
      
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
  
  // Upload and process ZIP file with HTML content with token
  app.post('/api/public-upload/html-zip/:token', verifyUploadToken, zipUpload.single('file'), async (req: Request, res: Response) => {
    try {
      // Token and article are attached by verifyUploadToken middleware
      if (!req.uploadToken || !req.targetArticle) {
        return res.status(500).json({ message: 'Internal server error - token data missing' });
      }
      
      const uploadToken = req.uploadToken;
      const article = req.targetArticle;
      
      if (!Array.isArray(uploadToken.uploadTypes) || !uploadToken.uploadTypes.includes('html-zip')) {
        return res.status(400).json({ message: 'This token is not valid for HTML ZIP uploads' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      console.log(`Processing public ZIP upload for article: ${article.title} (ID: ${article.id}) with token: ${uploadToken.token}`);
      
      // Process the ZIP file
      const result = await processZipFile(req.file.path, article.id);
      
      // Increment token usage
      await storage.incrementUploadTokenUses(uploadToken.id);
      
      // Log activity (without userId since it's a public upload)
      await storage.createActivityLog({
        action: 'upload',
        resourceType: 'html',
        resourceId: article.id.toString(),
        details: {
          filename: req.file.originalname,
          success: result.success,
          message: result.message,
          uploadToken: uploadToken.token
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
      console.error('Error in public ZIP upload:', error);
      
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
  
  // Simple landing page for token uploads
  app.get('/api/public-upload/info/:token', verifyUploadToken, async (req: Request, res: Response) => {
    try {
      // Token and article are attached by verifyUploadToken middleware
      if (!req.uploadToken || !req.targetArticle) {
        return res.status(500).json({ message: 'Internal server error - token data missing' });
      }
      
      const uploadToken = req.uploadToken;
      const article = req.targetArticle;
      
      // Return information about this upload token and its target
      return res.json({
        success: true,
        token: {
          id: uploadToken.id,
          uploadTypes: uploadToken.uploadTypes,
          expiresAt: uploadToken.expiresAt,
          maxUses: uploadToken.maxUses,
          uses: uploadToken.uses,
          active: uploadToken.active,
          name: uploadToken.name,
          notes: uploadToken.notes,
          uploadUrl: `/public-upload/${uploadToken.token}` // New unified URL
        },
        article: {
          id: article.id,
          title: article.title,
          status: article.status
        }
      });
      
    } catch (error) {
      console.error('Error fetching token info:', error);
      return res.status(500).json({
        message: 'Failed to fetch token information',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
