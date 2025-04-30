import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, uniqueIndex } from "drizzle-orm/pg-core";
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
  description: text("description"), // Made optional
  excerpt: text("excerpt"),
  content: text("content"), // Made optional
  contentFormat: text("content_format").notNull().default("plaintext"),
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull().default("url"),
  imagePath: text("image_path"),
  instagramImageUrl: text("instagram_image_url"), // For Airtable instaPhoto field
  featured: text("featured").notNull().default("no"),
  publishedAt: timestamp("published_at"),
  date: text("date"), // Airtable Date field for creation timestamp (stored as string)
  Scheduled: text("scheduled"), // Airtable Scheduled field for publication scheduling (stored as string)
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

export type UploadToken = typeof uploadTokens.$inferSelect;
export type InsertUploadToken = z.infer<typeof insertUploadTokenSchema>;

// Admin requests table
export const adminRequests = pgTable("admin_requests", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'pinkytoe', 'piscoc', 'misc'
  urgency: text("urgency").notNull(), // 'low', 'medium', 'high', 'critical'
  status: varchar("status", { length: 50 }).notNull().default("open"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  assignedTo: integer("assigned_to").references(() => users.id),
  discordUserId: varchar("discord_user_id", { length: 255 }),
  discordUserName: varchar("discord_user_name", { length: 255 }),
  notes: text("notes"),
});

export const insertAdminRequestSchema = createInsertSchema(adminRequests, {
  // Exclude these fields as they're generated automatically
  id: undefined,
  createdAt: undefined,
  updatedAt: undefined,
});

export type AdminRequest = typeof adminRequests.$inferSelect;
export type InsertAdminRequest = z.infer<typeof insertAdminRequestSchema>;

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
  description: z.string().optional(), // Made optional
  excerpt: z.string().optional(),
  content: z.string().optional(), // Made optional
  contentFormat: z.enum(["rtf", "markdown", "plaintext", "html"]).default("plaintext"),
  imageUrl: z.string(),
  imageType: z.enum(["url", "file"]),
  imagePath: z.string().nullable(),
  instagramImageUrl: z.string().optional(), // Airtable instaPhoto field
  featured: z.string(),
  publishedAt: z.date().optional(),
  date: z.string().optional(), // Airtable Date field (creation timestamp)
  Scheduled: z.string().optional(), // Airtable Scheduled field (publication date)
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

// Public upload tokens table
export const uploadTokens = pgTable("upload_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: 'cascade' }),
  uploadType: varchar("upload_type", { length: 50 }).notNull(), // 'image', 'instagram-image', 'html-zip'
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  maxUses: integer("max_uses").default(1),
  uses: integer("uses").default(0),
  active: boolean("active").default(true),
  name: varchar("name", { length: 255 }),
  notes: text("notes"),
}, (table) => {
  return {
    tokenIdx: uniqueIndex('token_idx').on(table.token),
  }
});

export const insertUploadTokenSchema = createInsertSchema(uploadTokens).omit({
  id: true,
  createdAt: true,
  uses: true,
}).extend({
  expiresAt: z.union([
    z.string().transform((val) => new Date(val)),
    z.date()
  ]),
});
