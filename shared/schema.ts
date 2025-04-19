import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  lastLogin: timestamp("last_login"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  isAdmin: true,
}).extend({
  isAdmin: z.boolean().default(false),
});

// Team Members table
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio").notNull(),
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull().default("url"),
  imagePath: text("image_path"),
  externalId: text("external_id"), // For Airtable ID reference
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
});

// Articles table
export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  contentFormat: text("content_format").notNull().default("plaintext"),
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull().default("url"),
  imagePath: text("image_path"),
  instagramImageUrl: text("instagram_image_url"), // For Airtable instaPhoto field
  featured: text("featured").notNull().default("no"),
  publishedAt: timestamp("published_at"),
  date: text("date"), // Airtable Date field for creation timestamp (stored as string)
  scheduled: text("scheduled"), // Airtable Scheduled field for publication scheduling (stored as string)
  finished: boolean("finished").default(false), // Maps to Airtable's Finished checkbox
  author: text("author").notNull(),
  photo: text("photo"),
  photoCredit: text("photo_credit"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  hashtags: text("hashtags"),
  externalId: text("external_id"), // For Airtable ID reference
  source: text("source").default("manual"), // Could be 'discord', 'airtable', 'instagram', or 'manual'
});

// Custom schema for article insert/update with publishedAt handling
export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
}).extend({
  // Override the publishedAt field to handle string or Date values
  publishedAt: z.union([
    z.string().transform((val) => new Date(val)),
    z.date(),
    z.null()
  ]).optional(),
});

// Carousel quotes table
export const carouselQuotes = pgTable("carousel_quotes", {
  id: serial("id").primaryKey(),
  carousel: text("carousel").notNull(), // Maps to main field in Airtable
  quote: text("quote").notNull(),     // Maps to philo field in Airtable
  main: text("main"),                 // Original main field from Airtable
  philo: text("philo"),               // Original philo field from Airtable
  externalId: text("external_id"),    // For Airtable ID reference
});

export const insertCarouselQuoteSchema = createInsertSchema(carouselQuotes).omit({
  id: true,
});

// Image assets table
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

export const insertImageAssetSchema = createInsertSchema(imageAssets).omit({
  id: true,
  createdAt: true,
});

// Integration settings table
export const integrationSettings = pgTable("integration_settings", {
  id: serial("id").primaryKey(),
  service: text("service").notNull(), // 'discord', 'airtable', 'instagram'
  key: text("key").notNull(),
  value: text("value").notNull(),
  enabled: boolean("enabled").default(true),
});

export const insertIntegrationSettingSchema = createInsertSchema(integrationSettings).omit({
  id: true,
});

// Activity log table
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  timestamp: timestamp("timestamp").defaultNow(),
  details: jsonb("details"),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  timestamp: true,
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;

export type CarouselQuote = typeof carouselQuotes.$inferSelect;
export type InsertCarouselQuote = z.infer<typeof insertCarouselQuoteSchema>;

export type ImageAsset = typeof imageAssets.$inferSelect;
export type InsertImageAsset = z.infer<typeof insertImageAssetSchema>;

export type IntegrationSetting = typeof integrationSettings.$inferSelect;
export type InsertIntegrationSetting = z.infer<typeof insertIntegrationSettingSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// Extended form validation schemas
export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  imageUrl: z.string(),
  imageType: z.enum(["url", "file"]),
  imagePath: z.string().nullable(),
});

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  excerpt: z.string().optional(),
  content: z.string(),
  contentFormat: z.enum(["rtf", "markdown", "plaintext", "html"]).default("plaintext"),
  imageUrl: z.string(),
  imageType: z.enum(["url", "file"]),
  imagePath: z.string().nullable(),
  instagramImageUrl: z.string().optional(), // Airtable instaPhoto field
  featured: z.string(),
  publishedAt: z.date().optional(),
  date: z.string().optional(), // Airtable Date field (creation timestamp)
  scheduled: z.string().optional(), // Airtable Scheduled field (publication date)
  finished: z.boolean().optional(), // Airtable Finished field
  author: z.string(),
  photo: z.string(),
  photoCredit: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.date().optional(),
  hashtags: z.string().optional(),
});

export const carouselQuoteSchema = z.object({
  id: z.number(),
  carousel: z.string(),
  quote: z.string(),
  main: z.string().optional(),
  philo: z.string().optional(),
  externalId: z.string().optional(),
});

export const adminSchema = z.object({
  id: z.number(),
  username: z.string(),
  password: z.string(),
  isAdmin: z.boolean().default(true),
  lastLogin: z.date().optional(),
});
