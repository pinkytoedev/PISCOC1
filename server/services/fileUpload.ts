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
    const fileData = fs.readFileSync(filePath);
    const form = new FormData();
    
    // Airtable API expects the data in this format
    // We need the "fields" key in the form directly, not in a metadata field
    const fields = {
      [fieldName]: [
        {
          url: "https://placeholder.com/image.jpg", // This will be replaced by Airtable
          filename: fileName
        }
      ]
    };
    
    // First append the fields
    form.append('fields', JSON.stringify(fields));
    
    // Then append the file
    form.append(fieldName, fileData, {
      filename: fileName,
      contentType: mimeType
    });

    // Airtable API for file attachment
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form as any,
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