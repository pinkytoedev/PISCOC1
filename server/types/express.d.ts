/**
 * Type definitions for Express
 * Custom extensions for the Request type
 */

import { Article, UploadToken, User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      uploadToken?: UploadToken;
      targetArticle?: Article; 
    }
  }
}