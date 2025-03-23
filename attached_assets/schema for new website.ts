import { z } from "zod";
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Schema Definitions and Types for the Blog Platform
 * This file contains all data models, their validation rules, and database table definitions.
 */
/**
 * Team Member Schema
 * Defines the structure for team member profiles
 * Supports both URL-based and file-based image storage
 * @property {string} id - Unique identifier (Airtable ID format)
 * @property {string} imageType - Specifies whether the image is stored as URL or file
 * @property {string} imagePath - Local file path for stored images (null for URL-based)
 */
export const teamSchema = z.object({
  id: z.string(), // Changed to string for Airtable IDs
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  imageUrl: z.string(),
  imageType: z.enum(["url", "file"]),
  imagePath: z.string().nullable(),
});

export type Team = z.infer<typeof teamSchema>;

/**
 * Article Schema
 * Defines the structure for blog articles
 * Supports rich text content and image management
 * @property {string} id - Unique identifier (Airtable ID format)
 * @property {string} excerpt - Short summary of the article
 * @property {string} content - Main article content in RTF format
 * @property {string} featured - Featured status of the article
 * @property {Date} publishedAt - Publication timestamp
 * @property {string} photoCredit - Attribution for article images
 */
export const articleSchema = z.object({
  id: z.string(), // Changed to string for Airtable IDs
  title: z.string(),
  description: z.string(),
  excerpt: z.string().optional(), // Added excerpt field
  content: z.string(),
  contentFormat: z
    .enum(["rtf", "markdown", "plaintext", "html"])
    .default("plaintext"),
  imageUrl: z.string(),
  imageType: z.enum(["url", "file"]),
  imagePath: z.string().nullable(),
  featured: z.string(),
  publishedAt: z.date(),
  author: z.string(),
  photo: z.string(),
  photoCredit: z.string().optional(), // Added photo credit field
  status: z.string().optional(),
  createdAt: z.date().optional(),
  hashtags: z.string().optional(),
});

export type Article = z.infer<typeof articleSchema>;

/**
 * Carousel Quote Schema
 * Defines the structure for testimonials and quotes displayed in carousels
 * @property {number} id - Unique identifier
 * @property {string} carousel - Identifier for the carousel this quote belongs to
 * @property {string} quote - The actual quote text
 */
export const carouselQuoteSchema = z.object({
  id: z.number(),
  carousel: z.string(),
  quote: z.string(),
});

export type CarouselQuote = z.infer<typeof carouselQuoteSchema>;

// Admin schema definition for authentication
export const adminSchema = z.object({
  id: z.number(),
  username: z.string(),
  password: z.string(),
  lastLogin: z.date().optional(),
});

export type Admin = z.infer<typeof adminSchema>;

// Form validation schema for admin login
export const insertAdminSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const imageAssets = pgTable("image_assets", {
  id: serial("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  isDefault: boolean("is_default").default(false),
  category: text("category").default("general"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});

export type ImageAsset = typeof imageAssets.$inferSelect;
export type InsertImageAsset = typeof imageAssets.$inferInsert;

export const carouselQuotes = pgTable("carousel_quotes", {
  id: serial("id").primaryKey(),
  carousel: text("carousel").notNull(),
  quote: text("quote").notNull(),
});
