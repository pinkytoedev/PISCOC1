import { 
  Client, 
  Events, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  MessageComponentInteraction,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  Message,
  TextChannel,
  AttachmentPayload
} from 'discord.js';
import type { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { Article, InsertArticle } from '@shared/schema';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { uploadImageToImgur } from '../utils/imgurUploader';

// Store bot instance and message upload handlers
let client: Client | null = null;
let botStatus = {
  connected: false,
  status: 'Not initialized',
  username: '',
  id: '',
  guilds: 0
};

// Store collectors for images by user ID
interface UploadRequest {
  articleId: number;
  articleTitle: string;
  userId: string;
  channelId: string;
  fieldName: 'instaPhoto' | 'MainImage';
  timestamp: number;
}

// Track all pending upload requests
const pendingUploads: Map<string, UploadRequest> = new Map();

// Helper functions for image upload
async function processImageForArticle(
  message: Message, 
  uploadRequest: UploadRequest
) {
  try {
    // Check if we can send messages to this channel
    if (!message.channel.isTextBased()) {
      console.error('Channel is not text-based');
      return false;
    }
    
    // Validate there's an attachment
    const attachment = message.attachments.first();
    if (!attachment) {
      await message.channel.isTextBased() ? message.channel.send('No valid image attachment found. Please try again.');
      return false;
    }
    
    // Ensure it's an image
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      await message.channel.isTextBased() ? message.channel.send('The attachment must be an image file. Please try again with an image.');
      return false;
    }
    
    // Send processing message
    const processingMsg = await message.channel.isTextBased() ? message.channel.send(
      `Processing image for article: **${uploadRequest.articleTitle}**... Please wait.`
    );
    
    // Download the image from Discord
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    
    // Create a temporary file to save the image
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, attachment.name);
    fs.writeFileSync(tempFilePath, buffer);
    
    // Upload the image to Imgur
    const fileInfo = {
      path: tempFilePath,
      filename: attachment.name,
      mimetype: attachment.contentType || 'image/jpeg',
      size: attachment.size
    };
    
    // Upload to Imgur
    const imgurResult = await uploadImageToImgur(fileInfo);
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.error('Error removing temp file:', e);
    }
    
    if (!imgurResult) {
      throw new Error('Failed to upload to Imgur');
    }
    
    // Now update the article in Airtable via our API
    const airtableResponse = await fetch(
      `${process.env.API_URL || ''}/api/airtable/upload-image-url/${uploadRequest.articleId}/${uploadRequest.fieldName}`, 
      {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: imgurResult.link,
          filename: attachment.name
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!airtableResponse.ok) {
      const errorData = await airtableResponse.text();
      throw new Error(`Failed to update Airtable: ${errorData}`);
    }
    
    // Success! Update the processing message
    await processingMsg.edit({
      content: `Success! Image for article **${uploadRequest.articleTitle}** uploaded and linked in Airtable.`,
      files: [
        { attachment: imgurResult.link, name: `${uploadRequest.fieldName}.jpg` }
      ]
    });
    
    // Send additional confirmation
    const fieldDescription = uploadRequest.fieldName === 'instaPhoto' 
      ? 'Instagram photo' 
      : 'Main web image';
      
    await message.channel.isTextBased() ? message.channel.send(
      `✅ ${fieldDescription} successfully updated for article: **${uploadRequest.articleTitle}**`
    );
    
    return true;
  } catch (error) {
    console.error('Error processing image upload:', error);
    if (message.channel.isTextBased()) {
      await message.channel.isTextBased() ? message.channel.send(
        `⚠️ Error processing the image: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    return false;
  }
}

// Message handler to detect and process image uploads
function setupMessageHandler() {
  if (!client) return;
  
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if this user has a pending upload
    const userId = message.author.id;
    const channelId = message.channelId;
    
    // Only process messages with attachments
    if (message.attachments.size === 0) return;
    
    // Look for a pending upload request that matches this user and channel
    let matchFound = false;
    pendingUploads.forEach(async (request, id) => {
      if (matchFound) return; // Skip if we already found a match
      
      if (request.userId === userId && request.channelId === channelId) {
        matchFound = true;
        console.log(`Found pending upload request for user ${userId} in channel ${channelId}`);
        
        // Process the image
        const success = await processImageForArticle(message, request);
        
        // Remove the request when done
        if (success) {
          pendingUploads.delete(id);
        }
      }
    });
  });
}

// Command handling functions
async function handleInstaCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get all unpublished articles
    const articles = await storage.getArticles();
    const unpublishedArticles = articles.filter(article => 
      article.status !== 'published'
    );
    
    if (unpublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found to upload images to.');
      return;
    }
    
    // Create select menu for article selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_article_for_insta')
      .setPlaceholder('Select an article to add Instagram image')
      .addOptions(
        unpublishedArticles.slice(0, 25).map(article => ({
          label: article.title || 'Untitled Article',
          description: `ID: ${article.id} | Status: ${article.status}`,
          value: article.id.toString()
        }))
      );
    
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    await interaction.editReply({
      content: 'Please select an article to upload an Instagram image for:',
      components: [row]
    });
  } catch (error) {
    console.error('Error handling Instagram command:', error);
    await interaction.editReply('Sorry, there was an error preparing the article selection.');
  }
}

async function handleWebCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get all unpublished articles
    const articles = await storage.getArticles();
    const unpublishedArticles = articles.filter(article => 
      article.status !== 'published'
    );
    
    if (unpublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found to upload images to.');
      return;
    }
    
    // Create select menu for article selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_article_for_web')
      .setPlaceholder('Select an article to add web image')
      .addOptions(
        unpublishedArticles.slice(0, 25).map(article => ({
          label: article.title || 'Untitled Article',
          description: `ID: ${article.id} | Status: ${article.status}`,
          value: article.id.toString()
        }))
      );
    
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    await interaction.editReply({
      content: 'Please select an article to upload a main web image for:',
      components: [row]
    });
  } catch (error) {
    console.error('Error handling Web image command:', error);
    await interaction.editReply('Sorry, there was an error preparing the article selection.');
  }
}

// Handle select menu interactions
async function handleStringSelectMenu(interaction: any) {
  try {
    // Handle Instagram image article selection
    if (interaction.customId === 'select_article_for_insta') {
      const articleId = parseInt(interaction.values[0], 10);
      await handleArticleSelect(interaction, articleId, 'instaPhoto');
    }
    // Handle Web image article selection
    else if (interaction.customId === 'select_article_for_web') {
      const articleId = parseInt(interaction.values[0], 10);
      await handleArticleSelect(interaction, articleId, 'MainImage');
    }
  } catch (error) {
    console.error('Error handling select menu:', error);
    await interaction.reply({ 
      content: 'Sorry, there was an error processing your selection.', 
      ephemeral: true 
    });
  }
}

async function handleArticleSelect(
  interaction: any,
  articleId: number,
  fieldName: 'instaPhoto' | 'MainImage'
) {
  await interaction.deferUpdate();
  
  try {
    const article = await storage.getArticle(articleId);
    if (!article) {
      await interaction.followUp({
        content: 'Article not found. It may have been deleted.',
        ephemeral: true
      });
      return;
    }
    
    // Create a unique ID for this upload request
    const requestId = `${interaction.user.id}-${Date.now()}`;
    
    // Store this request for image upload
    pendingUploads.set(requestId, {
      articleId,
      articleTitle: article.title || 'Untitled Article',
      userId: interaction.user.id,
      channelId: interaction.channelId,
      fieldName,
      timestamp: Date.now()
    });
    
    // Inform user to upload an image
    const imageType = fieldName === 'instaPhoto' ? 'Instagram image' : 'main web image';
    const promptMessage = await interaction.followUp({
      content: `Selected article: **${article.title}**\n\nPlease upload a ${imageType} as your next message in this channel. The image will be automatically processed and added to the article.`,
      ephemeral: false // Make this visible to everyone
    });
    
    // Set timeout to clear the request after 5 minutes
    setTimeout(() => {
      if (pendingUploads.has(requestId)) {
        pendingUploads.delete(requestId);
        // Try to edit the message if possible
        interaction.followUp({
          content: `Upload request for ${imageType} has expired. Please use the command again if you still want to upload an image.`,
          ephemeral: true
        }).catch(console.error);
      }
    }, 5 * 60 * 1000); // 5 minutes timeout
  } catch (error) {
    console.error('Error handling article selection:', error);
    await interaction.followUp({
      content: 'Sorry, there was an error processing your request.',
      ephemeral: true
    });
  }
}

// Configure commands
const commands = [
  new SlashCommandBuilder()
    .setName('insta')
    .setDescription('Upload an Instagram image to an article'),
  
  new SlashCommandBuilder()
    .setName('web')
    .setDescription('Upload a main web image to an article')
];

// Bot initialization
export async function initializeDiscordBot(token: string, clientId: string) {
  try {
    // Cleanup existing client if needed
    if (client) {
      await client.destroy();
      client = null;
      pendingUploads.clear();
    }
    
    // Create new client with required intents
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });
    
    // Set up message handler for image uploads
    setupMessageHandler();
    
    // Event handlers
    client.once(Events.ClientReady, c => {
      botStatus = {
        connected: true,
        status: 'Connected and ready',
        username: c.user.username,
        id: c.user.id,
        guilds: c.guilds.cache.size
      };
      console.log(`Ready! Logged in as ${c.user.tag}`);
    });
    
    // Handle commands and interactions
    client.on(Events.InteractionCreate, async interaction => {
      try {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
          if (interaction.commandName === 'insta') {
            await handleInstaCommand(interaction);
          }
          else if (interaction.commandName === 'web') {
            await handleWebCommand(interaction);
          }
        }
        // Handle select menus
        else if (interaction.isStringSelectMenu()) {
          await handleStringSelectMenu(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your request.',
            ephemeral: true
          });
        } else if (interaction.isRepliable()) {
          await interaction.followUp({
            content: 'An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
    });
    
    // Register commands with Discord
    const rest = new REST().setToken(token);
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    
    // Save credentials to database
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    if (!tokenSetting) {
      await storage.createIntegrationSetting({
        service: 'discord',
        key: 'bot_token',
        value: token,
        enabled: true
      });
    } else {
      await storage.updateIntegrationSetting(tokenSetting.id, {
        value: token,
        enabled: true
      });
    }
    
    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
    if (!clientIdSetting) {
      await storage.createIntegrationSetting({
        service: 'discord',
        key: 'bot_client_id',
        value: clientId,
        enabled: true
      });
    } else {
      await storage.updateIntegrationSetting(clientIdSetting.id, {
        value: clientId,
        enabled: true
      });
    }
    
    return { success: true, message: 'Bot initialized successfully' };
  } catch (error) {
    console.error('Error initializing Discord bot:', error);
    botStatus = {
      connected: false,
      status: `Initialization error: ${error instanceof Error ? error.message : String(error)}`,
      username: '',
      id: '',
      guilds: 0
    };
    return { success: false, message: 'Failed to initialize bot', error };
  }
}

// Start the bot
export async function startDiscordBot() {
  try {
    if (!client) {
      // Load settings from storage
      const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
      const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
      
      if (!tokenSetting || !clientIdSetting) {
        return { success: false, message: 'Bot not configured. Please set bot token and client ID first.' };
      }
      
      // Initialize bot with stored credentials
      await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      if (!client) {
        return { success: false, message: 'Failed to initialize bot' };
      }
    }
    
    // Login
    botStatus.status = 'Connecting...';
    const token = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    if (!token) {
      return { success: false, message: 'Bot token not found' };
    }
    await client.login(token.value);
    
    return { success: true, message: 'Bot started successfully' };
  } catch (error) {
    console.error('Error starting Discord bot:', error);
    botStatus = {
      ...botStatus,
      connected: false,
      status: `Start error: ${error instanceof Error ? error.message : String(error)}`
    };
    return { success: false, message: 'Failed to start bot', error };
  }
}

// Stop the bot
export async function stopDiscordBot() {
  try {
    if (!client) {
      return { success: false, message: 'Bot not initialized' };
    }
    
    await client.destroy();
    botStatus = {
      connected: false,
      status: 'Disconnected',
      username: botStatus.username,
      id: botStatus.id,
      guilds: 0
    };
    
    // Clear all pending uploads
    pendingUploads.clear();
    
    return { success: true, message: 'Bot stopped successfully' };
  } catch (error) {
    console.error('Error stopping bot:', error);
    return { success: false, message: 'Failed to stop bot', error };
  }
}

// Get bot status
export function getDiscordBotStatus() {
  if (client) {
    botStatus.connected = client.isReady();
    if (client.isReady()) {
      botStatus.guilds = client.guilds.cache.size;
    }
  }
  return botStatus;
}

// Auto-start the Discord bot if settings are available
export const autoStartDiscordBot = async () => {
  try {
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
    
    if (tokenSetting?.enabled && clientIdSetting?.enabled) {
      console.log('Auto-starting Discord bot...');
      await startDiscordBot();
    }
  } catch (error) {
    console.error('Error auto-starting Discord bot:', error);
  }
};

// Setup Express routes for bot management
export function setupDiscordBotRoutes(app: Express) {
  // Initialize
  app.post("/api/discord/bot/initialize", async (req: Request, res: Response) => {
    try {
      const { token, clientId } = req.body;
      
      if (!token || !clientId) {
        return res.status(400).json({
          success: false,
          message: 'Bot token and client ID are required'
        });
      }
      
      const result = await initializeDiscordBot(token, clientId);
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Error initializing Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while initializing the Discord bot'
      });
    }
  });
  
  // Start
  app.post("/api/discord/bot/start", async (req: Request, res: Response) => {
    try {
      const result = await startDiscordBot();
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Error starting Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while starting the Discord bot'
      });
    }
  });
  
  // Stop
  app.post("/api/discord/bot/stop", async (req: Request, res: Response) => {
    try {
      const result = await stopDiscordBot();
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Error stopping Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while stopping the Discord bot'
      });
    }
  });
  
  // Status
  app.get("/api/discord/bot/status", (req: Request, res: Response) => {
    try {
      const status = getDiscordBotStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting Discord bot status:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while getting Discord bot status'
      });
    }
  });
}