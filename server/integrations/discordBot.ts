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
  MessageComponentInteraction
} from 'discord.js';
import type { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { Article, InsertArticle } from '@shared/schema';

// Store bot instance for the application lifecycle
let client: Client | null = null;
let botStatus = {
  connected: false,
  status: 'Not initialized',
  username: '',
  id: '',
  guilds: 0
};

/**
 * Handler for the /writer list command
 * Lists all articles that are not published (drafts, pending review, etc.)
 */
async function handleWriterListCommand(interaction: any) {
  await interaction.deferReply();
  
  try {
    // Get non-published articles
    const allArticles = await storage.getArticles();
    const nonPublishedArticles = allArticles.filter(article => article.status !== 'published');
    
    if (nonPublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found. You can create a new article with `/writer create`.');
      return;
    }
    
    // Create an embed to display the articles
    const embed = new EmbedBuilder()
      .setTitle('📝 Unpublished Articles')
      .setDescription('Here are the articles that have not been published yet.')
      .setColor('#5865F2');
    
    // Add fields for each article (up to 10)
    const articlesToShow = nonPublishedArticles.slice(0, 10);
    
    articlesToShow.forEach((article, index) => {
      const title = article.title || 'Untitled';
      const status = article.status || 'draft';
      const date = article.createdAt 
        ? new Date(article.createdAt).toLocaleDateString() 
        : 'No date';
        
      embed.addFields({
        name: `${index + 1}. ${title}`,
        value: `Status: **${status}**\nLast updated: ${date}\nID: ${article.id}`
      });
    });
    
    // If there are more articles, indicate this
    if (nonPublishedArticles.length > 10) {
      embed.setFooter({
        text: `Showing 10 of ${nonPublishedArticles.length} unpublished articles.`
      });
    }
    
    // Add button to create new article
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_article')
          .setLabel('Create New Article')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✏️')
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Error fetching unpublished articles:', error);
    await interaction.editReply('Sorry, there was an error fetching the unpublished articles.');
  }
}

/**
 * Handler for the /writer create command
 * Opens a modal for article creation
 */
async function handleWriterCreateCommand(interaction: any) {
  try {
    // Create modal for article creation
    const modal = new ModalBuilder()
      .setCustomId('create_article_modal')
      .setTitle('Create New Article');

    // Add input fields
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter article title')
      .setRequired(true)
      .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter a brief description')
      .setRequired(true)
      .setMaxLength(500);
    
    const bodyInput = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('Body')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the article content')
      .setRequired(true)
      .setMaxLength(4000);
    
    const authorInput = new TextInputBuilder()
      .setCustomId('author')
      .setLabel('Author')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter author name')
      .setRequired(true)
      .setMaxLength(100);
    
    const featuredInput = new TextInputBuilder()
      .setCustomId('featured')
      .setLabel('Featured (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Type "yes" to mark as featured')
      .setRequired(false)
      .setMaxLength(3);
    
    // Create action rows (each input needs its own row)
    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const bodyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput);
    const authorRow = new ActionRowBuilder<TextInputBuilder>().addComponents(authorInput);
    const featuredRow = new ActionRowBuilder<TextInputBuilder>().addComponents(featuredInput);
    
    // Add inputs to the modal
    modal.addComponents(titleRow, descriptionRow, bodyRow, authorRow, featuredRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing article creation modal:', error);
    await interaction.reply({ 
      content: 'Sorry, there was an error creating the article form.', 
      ephemeral: true 
    });
  }
}

/**
 * Handler for modal submissions (article creation)
 */
async function handleModalSubmission(interaction: ModalSubmitInteraction) {
  try {
    if (interaction.customId === 'create_article_modal') {
      await interaction.deferReply({ ephemeral: true });
      
      // Get form input values
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const body = interaction.fields.getTextInputValue('body');
      const author = interaction.fields.getTextInputValue('author');
      const featuredInput = interaction.fields.getTextInputValue('featured').toLowerCase();
      const featured = featuredInput === 'yes' || featuredInput === 'y' || featuredInput === 'true';
      
      // Create article data
      const articleData: InsertArticle = {
        title,
        description,
        content: body,
        author,
        featured: featured ? 'yes' : 'no', // Convert boolean to 'yes'/'no' string
        status: 'draft',
        source: 'discord',
        externalId: `discord-${interaction.user.id}-${Date.now()}`,
      };
      
      // Create the article
      const article = await storage.createArticle(articleData);
      
      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Article Created Successfully')
        .setDescription(`Your article "${title}" has been created as a draft.`)
        .setColor('#22A559')
        .addFields(
          { name: 'Description', value: description.substring(0, 100) + (description.length > 100 ? '...' : '') },
          { name: 'Author', value: author },
          { name: 'Status', value: 'Draft' },
          { name: 'Featured', value: featured ? 'Yes' : 'No' }
        );
      
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error handling modal submission:', error);
    await interaction.editReply('Sorry, there was an error creating your article. Please try again later.');
  }
}

/**
 * Handler for button interactions
 */
async function handleButtonInteraction(interaction: MessageComponentInteraction) {
  try {
    if (interaction.customId === 'create_article') {
      // Show the article creation modal
      const modal = new ModalBuilder()
        .setCustomId('create_article_modal')
        .setTitle('Create New Article');

      // Add input fields
      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter article title')
        .setRequired(true)
        .setMaxLength(100);
      
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter a brief description')
        .setRequired(true)
        .setMaxLength(500);
      
      const bodyInput = new TextInputBuilder()
        .setCustomId('body')
        .setLabel('Body')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the article content')
        .setRequired(true)
        .setMaxLength(4000);
      
      const authorInput = new TextInputBuilder()
        .setCustomId('author')
        .setLabel('Author')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter author name')
        .setRequired(true)
        .setMaxLength(100);
      
      const featuredInput = new TextInputBuilder()
        .setCustomId('featured')
        .setLabel('Featured (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Type "yes" to mark as featured')
        .setRequired(false)
        .setMaxLength(3);
      
      // Create action rows
      const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
      const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
      const bodyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput);
      const authorRow = new ActionRowBuilder<TextInputBuilder>().addComponents(authorInput);
      const featuredRow = new ActionRowBuilder<TextInputBuilder>().addComponents(featuredInput);
      
      // Add inputs to the modal
      modal.addComponents(titleRow, descriptionRow, bodyRow, authorRow, featuredRow);
      
      // Show the modal
      await interaction.showModal(modal);
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({
      content: 'Sorry, there was an error processing your request.',
      ephemeral: true
    });
  }
}

// Commands configuration
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with the bot latency'),
  
  new SlashCommandBuilder()
    .setName('writer')
    .setDescription('Manage article writing')
    .addSubcommand(subcommand => 
      subcommand
        .setName('list')
        .setDescription('List articles not yet published')
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('create')
        .setDescription('Create a new article draft')
    )
];

/**
 * Initialize a new Discord bot with the provided token and client ID
 */
export const initializeDiscordBot = async (token: string, clientId: string) => {
  try {
    // Clean up any existing client
    if (client) {
      await client.destroy();
      client = null;
    }

    // Create a new client
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    // Register event handlers
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

    // Register commands
    client.on(Events.InteractionCreate, async interaction => {
      try {
        // Handle different types of interactions
        if (interaction.isButton()) {
          // Handle button interactions
          await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
          // Handle modal submissions (for article creation)
          await handleModalSubmission(interaction);
        } else if (interaction.isChatInputCommand()) {
          // Handle slash commands
          
          // Ping command - simple latency check
          if (interaction.commandName === 'ping') {
            const sent = await interaction.reply({ 
              content: 'Pinging...', 
              fetchReply: true 
            });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            await interaction.editReply(`Pong! Bot latency: ${latency}ms | API Latency: ${Math.round(client!.ws.ping)}ms`);
          } 
          
          // Writer command - for article management
          else if (interaction.commandName === 'writer') {
            const subcommand = interaction.options.getSubcommand();
            
            // List non-published articles
            if (subcommand === 'list') {
              await handleWriterListCommand(interaction);
            } 
            // Create a new article
            else if (subcommand === 'create') {
              await handleWriterCreateCommand(interaction);
            }
          }
        }
      } catch (error) {
        console.error('Error handling Discord interaction:', error);
        try {
          if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: 'An error occurred while processing this command.', 
              ephemeral: true 
            });
          } else if (interaction.isRepliable() && !interaction.replied) {
            await interaction.editReply('An error occurred while processing this command.');
          }
        } catch (replyError) {
          console.error('Error sending error reply:', replyError);
        }
      }
    });

    // Register commands with Discord API
    const rest = new REST().setToken(token);
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    // Store token and client ID in integration settings
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

    botStatus.status = 'Initialized (not connected)';
    return { success: true, message: 'Bot initialized successfully' };
  } catch (error) {
    botStatus = {
      connected: false,
      status: `Initialization error: ${error instanceof Error ? error.message : String(error)}`,
      username: '',
      id: '',
      guilds: 0
    };
    console.error('Error initializing Discord bot:', error);
    return { success: false, message: 'Failed to initialize bot', error };
  }
};

/**
 * Start the Discord bot
 */
export const startDiscordBot = async () => {
  try {
    if (!client) {
      // Try to load settings from storage and initialize
      const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
      const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
      
      if (!tokenSetting || !clientIdSetting) {
        return { success: false, message: 'Bot not initialized. Please set bot token and client ID first.' };
      }
      
      await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      if (!client) {
        return { success: false, message: 'Failed to initialize bot with stored credentials.' };
      }
    }
    
    botStatus.status = 'Connecting...';
    await client.login(await getDiscordBotToken());
    
    return { success: true, message: 'Bot started successfully' };
  } catch (error) {
    botStatus = {
      ...botStatus,
      connected: false,
      status: `Start error: ${error instanceof Error ? error.message : String(error)}`
    };
    console.error('Error starting Discord bot:', error);
    return { success: false, message: 'Failed to start bot', error };
  }
};

/**
 * Stop the Discord bot
 */
export const stopDiscordBot = async () => {
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
    
    return { success: true, message: 'Bot stopped successfully' };
  } catch (error) {
    console.error('Error stopping Discord bot:', error);
    return { success: false, message: 'Failed to stop bot', error };
  }
};

/**
 * Get the Discord bot status
 */
export const getDiscordBotStatus = () => {
  if (client) {
    // Update the connected status based on client's readiness
    botStatus.connected = client.isReady();
    
    // Update guild count if connected
    if (client.isReady()) {
      botStatus.guilds = client.guilds.cache.size;
    }
  }
  
  return botStatus;
};

/**
 * Helper function to get the Discord bot token from storage
 */
async function getDiscordBotToken(): Promise<string> {
  const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
  
  if (!tokenSetting || !tokenSetting.value) {
    throw new Error('Discord bot token not found in settings');
  }
  
  return tokenSetting.value;
}

/**
 * Set up Discord bot routes for the Express app
 */
export function setupDiscordBotRoutes(app: Express) {
  // Initialize the bot with token and client ID
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

  // Start the bot
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

  // Stop the bot
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

  // Get bot status
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

/**
 * Add a new API endpoint to receive article submissions from Discord
 */
export function setupArticleReceiveEndpoint(app: Express) {
  app.post("/api/discord/articles", async (req: Request, res: Response) => {
    try {
      const { title, description, content, author, featured = false } = req.body;
      
      // Validate required fields
      if (!title || !content) {
        return res.status(400).json({
          success: false,
          message: 'Title and content are required'
        });
      }
      
      // Create article data
      const articleData: InsertArticle = {
        title,
        description: description || '',
        content,
        author: author || 'Discord User',
        featured: featured ? 'yes' : 'no', // Convert boolean to string
        status: 'draft',
        source: 'discord',
        externalId: `discord-api-${Date.now()}`,
      };
      
      // Create the article
      const article = await storage.createArticle(articleData);
      
      res.status(201).json({
        success: true,
        message: 'Article created successfully',
        article
      });
    } catch (error) {
      console.error('Error creating article from Discord API:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while creating the article'
      });
    }
  });
}

/**
 * Auto-start the Discord bot if settings are available
 */
export const autoStartDiscordBot = async () => {
  try {
    // Check if we have the required settings
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
    
    if (tokenSetting?.enabled && clientIdSetting?.enabled) {
      console.log('Auto-starting Discord bot...');
      await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      await startDiscordBot();
    }
  } catch (error) {
    console.error('Error auto-starting Discord bot:', error);
  }
};