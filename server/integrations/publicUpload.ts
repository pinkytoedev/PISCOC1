/**
 * Public Direct Upload API
 * Allows non-authenticated users to upload files using secure tokens
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';
import { generateUniqueToken, calculateExpirationDate } from '../utils/tokenGenerator';

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
async function verifyUploadToken(req: Request, res: Response, next: Function) {
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

/**
 * Setup public direct upload routes
 * @param app Express application instance
 */
export function setupPublicUploadRoutes(app: Express) {
  // Token generation endpoint (requires authentication)
  app.post('/api/public-upload/generate-token', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { 
        articleId, 
        uploadType = 'image', 
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
      if (!validUploadTypes.includes(uploadType)) {
        return res.status(400).json({ 
          message: 'Invalid upload type. Must be one of: ' + validUploadTypes.join(', ')
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
        uploadType,
        createdById: req.user?.id,
        expiresAt,
        maxUses,
        active: true,
        name: name || `${uploadType} upload for ${article.title}`,
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
          uploadType,
          expiresAt,
          maxUses
        }
      });
      
      return res.json({
        success: true,
        token: uploadToken.token,
        uploadUrl: `/api/public-upload/${uploadToken.uploadType}/${uploadToken.token}`,
        uploadType: uploadToken.uploadType,
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
          uploadType: token.uploadType,
          uploadUrl: `/api/public-upload/${token.uploadType}/${token.token}`,
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
            uploadType: token.uploadType
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
      
      if (uploadToken.uploadType !== 'image') {
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
      
      if (uploadToken.uploadType !== 'instagram-image') {
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
      
      // Increment token usage
      await storage.incrementUploadTokenUses(uploadToken.id);
      
      // Log activity (without userId since it's a public upload)
      await storage.createActivityLog({
        action: 'upload',
        resourceType: 'image',
        resourceId: article.id.toString(),
        details: {
          fieldName: 'instaPhoto',
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
      
      if (uploadToken.uploadType !== 'html-zip') {
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
          uploadType: uploadToken.uploadType,
          expiresAt: uploadToken.expiresAt,
          maxUses: uploadToken.maxUses,
          uses: uploadToken.uses,
          active: uploadToken.active,
          name: uploadToken.name,
          notes: uploadToken.notes,
          uploadUrl: `/api/public-upload/${uploadToken.uploadType}/${uploadToken.token}`
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