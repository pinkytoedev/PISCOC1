import { 
  users, teamMembers, articles, carouselQuotes, 
  imageAssets, integrationSettings, activityLogs, adminRequests,
  uploadTokens
} from "@shared/schema";
import type { 
  User, InsertUser, TeamMember, InsertTeamMember, 
  Article, InsertArticle, CarouselQuote, InsertCarouselQuote, 
  ImageAsset, InsertImageAsset, IntegrationSetting, 
  InsertIntegrationSetting, ActivityLog, InsertActivityLog,
  AdminRequest, InsertAdminRequest, UploadToken, InsertUploadToken
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { eq, and, lt, gt } from "drizzle-orm";
import { pgPool } from './db';

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastLogin(id: number): Promise<User | undefined>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Team member operations
  getTeamMembers(): Promise<TeamMember[]>;
  getTeamMember(id: number): Promise<TeamMember | undefined>;
  getTeamMemberByExternalId(externalId: string): Promise<TeamMember | undefined>;
  createTeamMember(teamMember: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, teamMember: Partial<InsertTeamMember>): Promise<TeamMember | undefined>;
  deleteTeamMember(id: number): Promise<boolean>;
  
  // Article operations
  getArticles(): Promise<Article[]>;
  getArticle(id: number): Promise<Article | undefined>;
  getArticleByExternalId(externalId: string): Promise<Article | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  updateArticle(id: number, article: Partial<InsertArticle>): Promise<Article | undefined>;
  deleteArticle(id: number): Promise<boolean>;
  getFeaturedArticles(): Promise<Article[]>;
  getArticlesByStatus(status: string): Promise<Article[]>;
  
  // Carousel quote operations
  getCarouselQuotes(): Promise<CarouselQuote[]>;
  getCarouselQuote(id: number): Promise<CarouselQuote | undefined>;
  createCarouselQuote(quote: InsertCarouselQuote): Promise<CarouselQuote>;
  updateCarouselQuote(id: number, quote: Partial<InsertCarouselQuote>): Promise<CarouselQuote | undefined>;
  deleteCarouselQuote(id: number): Promise<boolean>;
  getQuotesByCarousel(carousel: string): Promise<CarouselQuote[]>;
  
  // Admin request operations
  getAdminRequests(): Promise<AdminRequest[]>;
  getAdminRequest(id: number): Promise<AdminRequest | undefined>;
  createAdminRequest(request: InsertAdminRequest): Promise<AdminRequest>;
  updateAdminRequest(id: number, request: Partial<InsertAdminRequest>): Promise<AdminRequest | undefined>;
  deleteAdminRequest(id: number): Promise<boolean>;
  getAdminRequestsByStatus(status: string): Promise<AdminRequest[]>;
  getAdminRequestsByCategory(category: string): Promise<AdminRequest[]>;
  getAdminRequestsByUrgency(urgency: string): Promise<AdminRequest[]>;
  
  // Upload token operations
  getUploadTokens(): Promise<UploadToken[]>;
  getUploadToken(id: number): Promise<UploadToken | undefined>;
  getUploadTokenByToken(token: string): Promise<UploadToken | undefined>;
  getUploadTokensByArticle(articleId: number): Promise<UploadToken[]>;
  createUploadToken(token: InsertUploadToken): Promise<UploadToken>;
  updateUploadToken(id: number, token: Partial<InsertUploadToken>): Promise<UploadToken | undefined>;
  incrementUploadTokenUses(id: number): Promise<UploadToken | undefined>;
  deleteUploadToken(id: number): Promise<boolean>;
  inactivateExpiredTokens(): Promise<number>; // Returns count of inactivated tokens
  
  // Image asset operations
  getImageAssets(): Promise<ImageAsset[]>;
  getImageAsset(id: number): Promise<ImageAsset | undefined>;
  createImageAsset(asset: InsertImageAsset): Promise<ImageAsset>;
  deleteImageAsset(id: number): Promise<boolean>;
  
  // Integration settings operations
  getIntegrationSettings(service: string): Promise<IntegrationSetting[]>;
  getIntegrationSetting(id: number): Promise<IntegrationSetting | undefined>;
  getIntegrationSettingByKey(service: string, key: string): Promise<IntegrationSetting | undefined>;
  createIntegrationSetting(setting: InsertIntegrationSetting): Promise<IntegrationSetting>;
  updateIntegrationSetting(id: number, setting: Partial<InsertIntegrationSetting>): Promise<IntegrationSetting | undefined>;
  deleteIntegrationSetting(id: number): Promise<boolean>;
  
  // Activity log operations
  getActivityLogs(): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  
  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool: pgPool,
      createTableIfMissing: true,
      tableName: 'session',
      schemaName: 'public'
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }
  
  async updateUserLastLogin(id: number): Promise<User | undefined> {
    const lastLogin = new Date();
    const [updatedUser] = await db
      .update(users)
      .set({ lastLogin })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    const deleted = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return deleted.length > 0;
  }

  // Team member operations
  async getTeamMembers(): Promise<TeamMember[]> {
    return await db.select().from(teamMembers);
  }

  async getTeamMember(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }
  
  async getTeamMemberByExternalId(externalId: string): Promise<TeamMember | undefined> {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.externalId, externalId));
    return member;
  }

  async createTeamMember(teamMember: InsertTeamMember): Promise<TeamMember> {
    const [newMember] = await db
      .insert(teamMembers)
      .values(teamMember)
      .returning();
    return newMember;
  }

  async updateTeamMember(id: number, teamMember: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const [updatedMember] = await db
      .update(teamMembers)
      .set(teamMember)
      .where(eq(teamMembers.id, id))
      .returning();
    return updatedMember;
  }

  async deleteTeamMember(id: number): Promise<boolean> {
    const deleted = await db
      .delete(teamMembers)
      .where(eq(teamMembers.id, id))
      .returning();
    return deleted.length > 0;
  }

  // Article operations
  async getArticles(): Promise<Article[]> {
    return await db.select().from(articles);
  }

  async getArticle(id: number): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.id, id));
    return article;
  }
  
  async getArticleByExternalId(externalId: string): Promise<Article | undefined> {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.externalId, externalId));
    return article;
  }

  async createArticle(article: InsertArticle): Promise<Article> {
    const [newArticle] = await db
      .insert(articles)
      .values({
        ...article,
        createdAt: new Date()
      })
      .returning();
    return newArticle;
  }

  async updateArticle(id: number, article: Partial<InsertArticle>): Promise<Article | undefined> {
    const [updatedArticle] = await db
      .update(articles)
      .set(article)
      .where(eq(articles.id, id))
      .returning();
    return updatedArticle;
  }

  async deleteArticle(id: number): Promise<boolean> {
    const deleted = await db
      .delete(articles)
      .where(eq(articles.id, id))
      .returning();
    return deleted.length > 0;
  }
  
  async getFeaturedArticles(): Promise<Article[]> {
    return await db
      .select()
      .from(articles)
      .where(eq(articles.featured, 'yes'));
  }
  
  async getArticlesByStatus(status: string): Promise<Article[]> {
    return await db
      .select()
      .from(articles)
      .where(eq(articles.status, status));
  }

  // Carousel quote operations
  async getCarouselQuotes(): Promise<CarouselQuote[]> {
    return await db.select().from(carouselQuotes);
  }

  async getCarouselQuote(id: number): Promise<CarouselQuote | undefined> {
    const [quote] = await db.select().from(carouselQuotes).where(eq(carouselQuotes.id, id));
    return quote;
  }

  async createCarouselQuote(quote: InsertCarouselQuote): Promise<CarouselQuote> {
    const [newQuote] = await db
      .insert(carouselQuotes)
      .values(quote)
      .returning();
    return newQuote;
  }

  async updateCarouselQuote(id: number, quote: Partial<InsertCarouselQuote>): Promise<CarouselQuote | undefined> {
    const [updatedQuote] = await db
      .update(carouselQuotes)
      .set(quote)
      .where(eq(carouselQuotes.id, id))
      .returning();
    return updatedQuote;
  }

  async deleteCarouselQuote(id: number): Promise<boolean> {
    const deleted = await db
      .delete(carouselQuotes)
      .where(eq(carouselQuotes.id, id))
      .returning();
    return deleted.length > 0;
  }
  
  async getQuotesByCarousel(carousel: string): Promise<CarouselQuote[]> {
    return await db
      .select()
      .from(carouselQuotes)
      .where(eq(carouselQuotes.carousel, carousel));
  }

  // Image asset operations
  async getImageAssets(): Promise<ImageAsset[]> {
    return await db.select().from(imageAssets);
  }

  async getImageAsset(id: number): Promise<ImageAsset | undefined> {
    const [asset] = await db.select().from(imageAssets).where(eq(imageAssets.id, id));
    return asset;
  }

  async createImageAsset(asset: InsertImageAsset): Promise<ImageAsset> {
    const [newAsset] = await db
      .insert(imageAssets)
      .values({
        ...asset,
        createdAt: new Date()
      })
      .returning();
    return newAsset;
  }

  async deleteImageAsset(id: number): Promise<boolean> {
    const deleted = await db
      .delete(imageAssets)
      .where(eq(imageAssets.id, id))
      .returning();
    return deleted.length > 0;
  }

  // Integration settings operations
  async getIntegrationSettings(service: string): Promise<IntegrationSetting[]> {
    return await db
      .select()
      .from(integrationSettings)
      .where(eq(integrationSettings.service, service));
  }

  async getIntegrationSetting(id: number): Promise<IntegrationSetting | undefined> {
    const [setting] = await db
      .select()
      .from(integrationSettings)
      .where(eq(integrationSettings.id, id));
    return setting;
  }
  
  async getIntegrationSettingByKey(service: string, key: string): Promise<IntegrationSetting | undefined> {
    const [setting] = await db
      .select()
      .from(integrationSettings)
      .where(and(
        eq(integrationSettings.service, service),
        eq(integrationSettings.key, key)
      ));
    return setting;
  }

  async createIntegrationSetting(setting: InsertIntegrationSetting): Promise<IntegrationSetting> {
    const [newSetting] = await db
      .insert(integrationSettings)
      .values(setting)
      .returning();
    return newSetting;
  }

  async updateIntegrationSetting(id: number, setting: Partial<InsertIntegrationSetting>): Promise<IntegrationSetting | undefined> {
    const [updatedSetting] = await db
      .update(integrationSettings)
      .set(setting)
      .where(eq(integrationSettings.id, id))
      .returning();
    return updatedSetting;
  }

  async deleteIntegrationSetting(id: number): Promise<boolean> {
    const deleted = await db
      .delete(integrationSettings)
      .where(eq(integrationSettings.id, id))
      .returning();
    return deleted.length > 0;
  }

  // Activity log operations
  async getActivityLogs(): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs);
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db
      .insert(activityLogs)
      .values({
        ...log,
        timestamp: new Date()
      })
      .returning();
    return newLog;
  }
  
  // Admin request operations
  async getAdminRequests(): Promise<AdminRequest[]> {
    return await db.select().from(adminRequests);
  }

  async getAdminRequest(id: number): Promise<AdminRequest | undefined> {
    const [request] = await db.select().from(adminRequests).where(eq(adminRequests.id, id));
    return request;
  }

  async createAdminRequest(request: InsertAdminRequest): Promise<AdminRequest> {
    const [newRequest] = await db
      .insert(adminRequests)
      .values({
        ...request,
        createdAt: new Date()
      })
      .returning();
    return newRequest;
  }

  async updateAdminRequest(id: number, request: Partial<InsertAdminRequest>): Promise<AdminRequest | undefined> {
    const [updatedRequest] = await db
      .update(adminRequests)
      .set({
        ...request,
        updatedAt: new Date()
      })
      .where(eq(adminRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async deleteAdminRequest(id: number): Promise<boolean> {
    const deleted = await db
      .delete(adminRequests)
      .where(eq(adminRequests.id, id))
      .returning();
    return deleted.length > 0;
  }
  
  async getAdminRequestsByStatus(status: string): Promise<AdminRequest[]> {
    return await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.status, status));
  }
  
  async getAdminRequestsByCategory(category: string): Promise<AdminRequest[]> {
    return await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.category, category));
  }
  
  async getAdminRequestsByUrgency(urgency: string): Promise<AdminRequest[]> {
    return await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.urgency, urgency));
  }

  // Upload token operations
  async getUploadTokens(): Promise<UploadToken[]> {
    return await db.select().from(uploadTokens);
  }

  async getUploadToken(id: number): Promise<UploadToken | undefined> {
    const [token] = await db.select().from(uploadTokens).where(eq(uploadTokens.id, id));
    return token;
  }

  async getUploadTokenByToken(token: string): Promise<UploadToken | undefined> {
    const [uploadToken] = await db
      .select()
      .from(uploadTokens)
      .where(eq(uploadTokens.token, token));
    return uploadToken;
  }

  async getUploadTokensByArticle(articleId: number): Promise<UploadToken[]> {
    return await db
      .select()
      .from(uploadTokens)
      .where(eq(uploadTokens.articleId, articleId));
  }

  async createUploadToken(token: InsertUploadToken): Promise<UploadToken> {
    const [newToken] = await db
      .insert(uploadTokens)
      .values({
        ...token,
        createdAt: new Date()
      })
      .returning();
    return newToken;
  }

  async updateUploadToken(id: number, token: Partial<InsertUploadToken>): Promise<UploadToken | undefined> {
    const [updatedToken] = await db
      .update(uploadTokens)
      .set(token)
      .where(eq(uploadTokens.id, id))
      .returning();
    return updatedToken;
  }

  async incrementUploadTokenUses(id: number): Promise<UploadToken | undefined> {
    const token = await this.getUploadToken(id);
    if (!token) return undefined;
    
    // Handle null values safely
    const currentUses = token.uses ?? 0;
    const maxUses = token.maxUses ?? 0;
    
    const [updatedToken] = await db
      .update(uploadTokens)
      .set({ 
        uses: currentUses + 1,
        active: maxUses > 0 ? currentUses + 1 < maxUses : true 
      })
      .where(eq(uploadTokens.id, id))
      .returning();
    
    return updatedToken;
  }

  async deleteUploadToken(id: number): Promise<boolean> {
    const deleted = await db
      .delete(uploadTokens)
      .where(eq(uploadTokens.id, id))
      .returning();
    return deleted.length > 0;
  }

  async inactivateExpiredTokens(): Promise<number> {
    const now = new Date();
    const result = await db
      .update(uploadTokens)
      .set({ active: false })
      .where(
        and(
          eq(uploadTokens.active, true),
          lt(uploadTokens.expiresAt, now)
        )
      )
      .returning();
    
    return result.length;
  }
}

export const storage = new DatabaseStorage();
