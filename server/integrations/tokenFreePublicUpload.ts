/**
 * Token-Free Public Upload API
 * Allows direct uploads without authentication tokens for simplified workflow
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';
import { processZipFile } from '../utils/zipProcessor';

// Simple in-memory rate limiting (should be replaced with Redis in production)
const uploadAttempts = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10;
  
  const record = uploadAttempts.get(ip);
  
  if (!record || now > record.resetTime) {
    uploadAttempts.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxAttempts) {
    return false;
  }
  
  record.count++;
  return true;
};

// Rate limiting middleware
const rateLimitMiddleware = (req: Request, res: Response, next: Function) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      message: 'Too many upload attempts from this IP, please try again later.'
    });
  }
  
  next();
};

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate secure filename - remove path traversal attempts
    const sanitizedOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + sanitizedOriginalName);
  }
});

// Image upload middleware (10MB limit)
const imageUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Strictly validate image files
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 
      'image/gif', 'image/webp'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

// ZIP upload middleware (50MB limit)
const zipUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validate ZIP files
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP files are allowed.'));
    }
  }
});

// Input validation middleware
const validateArticleId = (req: Request, res: Response, next: Function) => {
  const articleId = parseInt(req.body.articleId);
  
  if (!articleId || isNaN(articleId)) {
    return res.status(400).json({ 
      message: 'Valid article ID is required' 
    });
  }
  
  req.body.articleId = articleId;
  next();
};

// Article existence validation
const validateArticleExists = async (req: Request, res: Response, next: Function) => {
  try {
    const article = await storage.getArticle(req.body.articleId);
    
    if (!article) {
      return res.status(404).json({ 
        message: 'Article not found' 
      });
    }
    
    // Don't allow uploads to published articles for security
    if (article.status === 'published') {
      return res.status(400).json({ 
        message: 'Cannot upload to published articles' 
      });
    }
    
    // Attach article to request for use in handlers
    (req as any).targetArticle = article;
    next();
  } catch (error) {
    console.error('Error validating article:', error);
    return res.status(500).json({ 
      message: 'Failed to validate article' 
    });
  }
};

/**
 * Setup token-free public upload routes
 */
export function setupTokenFreePublicUploadRoutes(app: Express) {
  
  // Get uploadable articles (non-published articles)
  app.get('/api/articles/uploadable', async (req: Request, res: Response) => {
    try {
      const articles = await storage.getArticles();
      
      // Filter out published articles and only return essential fields
      const uploadableArticles = articles
        .filter(article => article.status !== 'published')
        .map(article => ({
          id: article.id,
          title: article.title,
          status: article.status
        }));
      
      return res.json(uploadableArticles);
      
    } catch (error) {
      console.error('Error fetching uploadable articles:', error);
      return res.status(500).json({
        message: 'Failed to fetch articles'
      });
    }
  });
  
  // Main image upload
  app.post('/api/public-upload/image', 
    rateLimitMiddleware,
    imageUpload.single('file'), 
    validateArticleId,
    validateArticleExists,
    async (req: Request, res: Response) => {
      try {
        const article = (req as any).targetArticle;
        
        if (!req.file) {
          return res.status(400).json({ message: 'No image file uploaded' });
        }

        // Upload to ImgBB
        const imgbbResult = await uploadImageToImgBB(req.file.path, req.file.originalname);
        
        if (!imgbbResult.success) {
          throw new Error('Failed to upload image to storage service');
        }

        // Update article in database
        await storage.updateArticle(article.id, {
          imageUrl: imgbbResult.url
        });

        // Try to update Airtable if the article has an external ID
        if (article.externalId) {
          try {
            const { uploadImageUrlAsLinkField } = require('../utils/airtableLink');
            await uploadImageUrlAsLinkField(
              imgbbResult.url,
              article.externalId,
              'ImageField'
            );
          } catch (airtableError) {
            // Log error but don't fail the upload
            console.warn('Failed to update Airtable:', airtableError);
          }
        }

        // Log activity
        await storage.createActivityLog({
          action: 'upload',
          resourceType: 'image',
          resourceId: article.id.toString(),
          details: {
            uploadType: 'image',
            filename: req.file.originalname,
            source: 'public-upload'
          }
        });

        // Cleanup temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.json({
          success: true,
          message: 'Main image uploaded successfully',
          imageUrl: imgbbResult.url,
          article: {
            id: article.id,
            title: article.title
          }
        });

      } catch (error) {
        console.error('Error in public image upload:', error);
        
        // Cleanup file on error
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({
          message: 'Failed to process image upload'
        });
      }
    }
  );
  
  // Instagram image upload
  app.post('/api/public-upload/instagram-image', 
    rateLimitMiddleware,
    imageUpload.single('file'), 
    validateArticleId,
    validateArticleExists,
    async (req: Request, res: Response) => {
      try {
        const article = (req as any).targetArticle;
        
        if (!req.file) {
          return res.status(400).json({ message: 'No image file uploaded' });
        }

        // Upload to ImgBB
        const imgbbResult = await uploadImageToImgBB(req.file.path, req.file.originalname);
        
        if (!imgbbResult.success) {
          throw new Error('Failed to upload image to storage service');
        }

        // Update article in database
        await storage.updateArticle(article.id, {
          instagramImageUrl: imgbbResult.url
        });

        // Try to update Airtable if the article has an external ID
        if (article.externalId) {
          try {
            const { uploadImageUrlAsLinkField } = require('../utils/airtableLink');
            await uploadImageUrlAsLinkField(
              imgbbResult.url,
              article.externalId,
              'InstaPhotoLink'
            );
          } catch (airtableError) {
            console.warn('Failed to update Airtable Instagram field:', airtableError);
          }
        }

        // Log activity
        await storage.createActivityLog({
          action: 'upload',
          resourceType: 'instagram-image',
          resourceId: article.id.toString(),
          details: {
            uploadType: 'instagram-image',
            filename: req.file.originalname,
            source: 'public-upload'
          }
        });

        // Cleanup temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.json({
          success: true,
          message: 'Instagram image uploaded successfully',
          imageUrl: imgbbResult.url,
          article: {
            id: article.id,
            title: article.title
          }
        });

      } catch (error) {
        console.error('Error in public Instagram image upload:', error);
        
        // Cleanup file on error
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({
          message: 'Failed to process Instagram image upload'
        });
      }
    }
  );
  
  // HTML ZIP upload
  app.post('/api/public-upload/html-zip', 
    rateLimitMiddleware,
    zipUpload.single('file'), 
    validateArticleId,
    validateArticleExists,
    async (req: Request, res: Response) => {
      try {
        const article = (req as any).targetArticle;
        
        if (!req.file) {
          return res.status(400).json({ message: 'No ZIP file uploaded' });
        }

        // Process the ZIP file
        const result = await processZipFile(req.file.path, article.id);

        // Log activity
        await storage.createActivityLog({
          action: 'upload',
          resourceType: 'html',
          resourceId: article.id.toString(),
          details: {
            uploadType: 'html-zip',
            filename: req.file.originalname,
            source: 'public-upload'
          }
        });

        // Cleanup temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.json({
          success: true,
          message: 'HTML ZIP uploaded and processed successfully',
          result,
          article: {
            id: article.id,
            title: article.title
          }
        });

      } catch (error) {
        console.error('Error in public HTML ZIP upload:', error);
        
        // Cleanup file on error
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({
          message: 'Failed to process HTML ZIP upload'
        });
      }
    }
  );
}