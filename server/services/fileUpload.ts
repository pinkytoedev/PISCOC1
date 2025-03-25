import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { Express, Request, Response } from 'express';

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniquePrefix = crypto.randomBytes(8).toString('hex');
    const fileExtension = path.extname(file.originalname);
    cb(null, `${uniquePrefix}${fileExtension}`);
  }
});

// Configure upload limits and file types
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Upload image to Airtable
export async function uploadImageToAirtable(
  apiKey: string,
  baseId: string,
  tableId: string,
  recordId: string,
  fieldName: string,
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<any> {
  try {
    // Read the file and convert to base64 encoding
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    
    // Create the request body according to Airtable's API documentation
    // Airtable expects attachments in a specific format
    const requestBody = {
      fields: {
        [fieldName]: [
          {
            url: `data:${mimeType};base64,${base64Data}`,
            filename: fileName
          }
        ]
      }
    };

    console.log(`Uploading image to Airtable: ${fileName}`);
    
    // Airtable API for record update
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading to Airtable:', error);
    throw error;
  }
}

export { upload };