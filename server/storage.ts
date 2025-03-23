import { users, teamMembers, articles, carouselQuotes, imageAssets, integrationSettings, activityLogs } from "@shared/schema";
import type { User, InsertUser, TeamMember, InsertTeamMember, Article, InsertArticle, CarouselQuote, InsertCarouselQuote, ImageAsset, InsertImageAsset, IntegrationSetting, InsertIntegrationSetting, ActivityLog, InsertActivityLog } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastLogin(id: number): Promise<User | undefined>;
  
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
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private teamMembers: Map<number, TeamMember>;
  private articles: Map<number, Article>;
  private carouselQuotes: Map<number, CarouselQuote>;
  private imageAssets: Map<number, ImageAsset>;
  private integrationSettings: Map<number, IntegrationSetting>;
  private activityLogs: Map<number, ActivityLog>;
  
  sessionStore: session.SessionStore;
  
  // ID counters
  private userIdCounter: number = 1;
  private teamMemberIdCounter: number = 1;
  private articleIdCounter: number = 1;
  private carouselQuoteIdCounter: number = 1;
  private imageAssetIdCounter: number = 1;
  private integrationSettingIdCounter: number = 1;
  private activityLogIdCounter: number = 1;

  constructor() {
    this.users = new Map();
    this.teamMembers = new Map();
    this.articles = new Map();
    this.carouselQuotes = new Map();
    this.imageAssets = new Map();
    this.integrationSettings = new Map();
    this.activityLogs = new Map();
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const newUser: User = { ...user, id, lastLogin: null };
    this.users.set(id, newUser);
    return newUser;
  }
  
  async updateUserLastLogin(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, lastLogin: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Team member operations
  async getTeamMembers(): Promise<TeamMember[]> {
    return Array.from(this.teamMembers.values());
  }

  async getTeamMember(id: number): Promise<TeamMember | undefined> {
    return this.teamMembers.get(id);
  }
  
  async getTeamMemberByExternalId(externalId: string): Promise<TeamMember | undefined> {
    return Array.from(this.teamMembers.values()).find(member => member.externalId === externalId);
  }

  async createTeamMember(teamMember: InsertTeamMember): Promise<TeamMember> {
    const id = this.teamMemberIdCounter++;
    const newTeamMember: TeamMember = { ...teamMember, id };
    this.teamMembers.set(id, newTeamMember);
    return newTeamMember;
  }

  async updateTeamMember(id: number, teamMember: Partial<InsertTeamMember>): Promise<TeamMember | undefined> {
    const existingMember = await this.getTeamMember(id);
    if (!existingMember) return undefined;
    
    const updatedMember = { ...existingMember, ...teamMember };
    this.teamMembers.set(id, updatedMember);
    return updatedMember;
  }

  async deleteTeamMember(id: number): Promise<boolean> {
    return this.teamMembers.delete(id);
  }

  // Article operations
  async getArticles(): Promise<Article[]> {
    return Array.from(this.articles.values());
  }

  async getArticle(id: number): Promise<Article | undefined> {
    return this.articles.get(id);
  }
  
  async getArticleByExternalId(externalId: string): Promise<Article | undefined> {
    return Array.from(this.articles.values()).find(article => article.externalId === externalId);
  }

  async createArticle(article: InsertArticle): Promise<Article> {
    const id = this.articleIdCounter++;
    const now = new Date();
    const newArticle: Article = { ...article, id, createdAt: now };
    this.articles.set(id, newArticle);
    return newArticle;
  }

  async updateArticle(id: number, article: Partial<InsertArticle>): Promise<Article | undefined> {
    const existingArticle = await this.getArticle(id);
    if (!existingArticle) return undefined;
    
    const updatedArticle = { ...existingArticle, ...article };
    this.articles.set(id, updatedArticle);
    return updatedArticle;
  }

  async deleteArticle(id: number): Promise<boolean> {
    return this.articles.delete(id);
  }
  
  async getFeaturedArticles(): Promise<Article[]> {
    return Array.from(this.articles.values()).filter(article => article.featured === 'yes');
  }
  
  async getArticlesByStatus(status: string): Promise<Article[]> {
    return Array.from(this.articles.values()).filter(article => article.status === status);
  }

  // Carousel quote operations
  async getCarouselQuotes(): Promise<CarouselQuote[]> {
    return Array.from(this.carouselQuotes.values());
  }

  async getCarouselQuote(id: number): Promise<CarouselQuote | undefined> {
    return this.carouselQuotes.get(id);
  }

  async createCarouselQuote(quote: InsertCarouselQuote): Promise<CarouselQuote> {
    const id = this.carouselQuoteIdCounter++;
    const newQuote: CarouselQuote = { ...quote, id };
    this.carouselQuotes.set(id, newQuote);
    return newQuote;
  }

  async updateCarouselQuote(id: number, quote: Partial<InsertCarouselQuote>): Promise<CarouselQuote | undefined> {
    const existingQuote = await this.getCarouselQuote(id);
    if (!existingQuote) return undefined;
    
    const updatedQuote = { ...existingQuote, ...quote };
    this.carouselQuotes.set(id, updatedQuote);
    return updatedQuote;
  }

  async deleteCarouselQuote(id: number): Promise<boolean> {
    return this.carouselQuotes.delete(id);
  }
  
  async getQuotesByCarousel(carousel: string): Promise<CarouselQuote[]> {
    return Array.from(this.carouselQuotes.values()).filter(quote => quote.carousel === carousel);
  }

  // Image asset operations
  async getImageAssets(): Promise<ImageAsset[]> {
    return Array.from(this.imageAssets.values());
  }

  async getImageAsset(id: number): Promise<ImageAsset | undefined> {
    return this.imageAssets.get(id);
  }

  async createImageAsset(asset: InsertImageAsset): Promise<ImageAsset> {
    const id = this.imageAssetIdCounter++;
    const now = new Date();
    const newAsset: ImageAsset = { ...asset, id, createdAt: now };
    this.imageAssets.set(id, newAsset);
    return newAsset;
  }

  async deleteImageAsset(id: number): Promise<boolean> {
    return this.imageAssets.delete(id);
  }

  // Integration settings operations
  async getIntegrationSettings(service: string): Promise<IntegrationSetting[]> {
    return Array.from(this.integrationSettings.values()).filter(setting => setting.service === service);
  }

  async getIntegrationSetting(id: number): Promise<IntegrationSetting | undefined> {
    return this.integrationSettings.get(id);
  }
  
  async getIntegrationSettingByKey(service: string, key: string): Promise<IntegrationSetting | undefined> {
    return Array.from(this.integrationSettings.values()).find(setting => setting.service === service && setting.key === key);
  }

  async createIntegrationSetting(setting: InsertIntegrationSetting): Promise<IntegrationSetting> {
    const id = this.integrationSettingIdCounter++;
    const newSetting: IntegrationSetting = { ...setting, id };
    this.integrationSettings.set(id, newSetting);
    return newSetting;
  }

  async updateIntegrationSetting(id: number, setting: Partial<InsertIntegrationSetting>): Promise<IntegrationSetting | undefined> {
    const existingSetting = await this.getIntegrationSetting(id);
    if (!existingSetting) return undefined;
    
    const updatedSetting = { ...existingSetting, ...setting };
    this.integrationSettings.set(id, updatedSetting);
    return updatedSetting;
  }

  async deleteIntegrationSetting(id: number): Promise<boolean> {
    return this.integrationSettings.delete(id);
  }

  // Activity log operations
  async getActivityLogs(): Promise<ActivityLog[]> {
    return Array.from(this.activityLogs.values());
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const id = this.activityLogIdCounter++;
    const now = new Date();
    const newLog: ActivityLog = { ...log, id, timestamp: now };
    this.activityLogs.set(id, newLog);
    return newLog;
  }
}

export const storage = new MemStorage();
