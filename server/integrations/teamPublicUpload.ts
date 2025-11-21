/**
 * Team Public Upload API
 * Allows public access to update team member profiles via a toggleable link
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { storage } from '../storage';
import { uploadImageToImgBB } from '../utils/imgbbUploader';

// Simple in-memory rate limiting
const uploadAttempts = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 20; // Higher limit for team updates
  
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
      message: 'Too many attempts from this IP, please try again later.'
    });
  }
  
  next();
};

// Authentication middleware
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
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
    const sanitizedOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + sanitizedOriginalName);
  }
});

const imageUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
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

const SERVICE_NAME = 'team_upload';
const SETTING_KEY = 'public_link_active';

// Helper function to get available roles
// This list is based on the Airtable configuration found in server/integrations/airtable.ts
const getAvailableRoles = () => {
  return [
    'Special Projects',
    'Photo',
    'Dev',
    'E-Board',
    'Writer',
  ];
};

export function setupTeamPublicUploadRoutes(app: Express) {
  
  // Get public upload status (Open to public to check if page should render)
  app.get('/api/public/team-upload-status', async (req, res) => {
    try {
      const setting = await storage.getIntegrationSettingByKey(SERVICE_NAME, SETTING_KEY);
      res.json({ enabled: setting ? setting.value === 'true' : false });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch status" });
    }
  });

  // Get available team roles (Public)
  app.get('/api/public/team-roles', async (req, res) => {
    try {
      const setting = await storage.getIntegrationSettingByKey(SERVICE_NAME, SETTING_KEY);
      if (!setting || setting.value !== 'true') {
        return res.status(403).json({ message: "Public upload is currently disabled" });
      }
      
      const roles = getAvailableRoles();
      res.json(roles);
    } catch (error) {
      console.error('Error fetching team roles:', error);
      res.status(500).json({ message: "Failed to fetch team roles" });
    }
  });

  // Toggle public upload status (Admin only)
  app.post('/api/public/team-upload-status', isAuthenticated, async (req, res) => {
    try {
      const { enabled } = req.body;
      let setting = await storage.getIntegrationSettingByKey(SERVICE_NAME, SETTING_KEY);
      
      if (setting) {
        await storage.updateIntegrationSetting(setting.id, { value: String(enabled) });
      } else {
        await storage.createIntegrationSetting({
          service: SERVICE_NAME,
          key: SETTING_KEY,
          value: String(enabled),
          enabled: true
        });
      }
      
      res.json({ enabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Get team members list (Public but guarded by status)
  app.get('/api/public/team-members-list', async (req, res) => {
    try {
      const setting = await storage.getIntegrationSettingByKey(SERVICE_NAME, SETTING_KEY);
      if (!setting || setting.value !== 'true') {
        return res.status(403).json({ message: "Public upload is currently disabled" });
      }

      const members = await storage.getTeamMembers();
      // Return only necessary info
      const simplifiedMembers = members.map(m => ({
        id: m.id,
        name: m.name,
        role: m.role,
        bio: m.bio, // Include bio/role so they can see current values
        imageUrl: m.imageUrl
      }));

      res.json(simplifiedMembers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Update team member (Public but guarded by status)
  app.post('/api/public/team-member-update', 
    rateLimitMiddleware,
    imageUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        // 1. Check if feature is enabled
        const setting = await storage.getIntegrationSettingByKey(SERVICE_NAME, SETTING_KEY);
        if (!setting || setting.value !== 'true') {
          // Clean up uploaded file if feature is disabled
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(403).json({ message: "Public upload is currently disabled" });
        }

        const { memberId, name, role, bio } = req.body;
        
        if (!memberId) {
           if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(400).json({ message: "Member ID is required" });
        }

        const member = await storage.getTeamMember(parseInt(memberId));
        if (!member) {
           if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(404).json({ message: "Team member not found" });
        }

        // Prepare update data
        const updateData: any = {
          name: name || member.name,
          role: role || member.role,
          bio: bio || member.bio,
        };

        // 2. Handle Image Upload if present
        if (req.file) {
          try {
            const imgbbResult = await uploadImageToImgBB({
              path: req.file.path,
              filename: req.file.originalname,
              size: req.file.size,
              mimetype: req.file.mimetype
            });

            if (imgbbResult) {
              updateData.imageUrl = imgbbResult.url;
              updateData.imageType = 'url';
            }
          } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
             // Don't fail the whole request, just log it? Or fail?
             // If image was provided but failed, we probably should tell the user.
             if (fs.existsSync(req.file.path)) {
               fs.unlinkSync(req.file.path);
             }
             return res.status(500).json({ message: "Failed to upload image" });
          } finally {
             // Cleanup
             if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          }
        }

        // 3. Update Database
        const updatedMember = await storage.updateTeamMember(member.id, updateData);

        // 4. Log Activity
        await storage.createActivityLog({
          action: "update",
          resourceType: "team_member",
          resourceId: member.id.toString(),
          details: {
            source: "public-link",
            updatedFields: Object.keys(updateData)
          }
        });

        res.json(updatedMember);

      } catch (error) {
        console.error('Error processing team member update:', error);
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );
}
