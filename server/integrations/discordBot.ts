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
  Collection,
  Message,
  DMChannel,
  TextChannel,
  NewsChannel
} from 'discord.js';
import express, { Express, Request, Response } from 'express';
import { InsertArticle, storage } from '../storage';
import { 
  handleInstaImageCommand, 
  handleWebImageCommand, 
  handleInstaImageUploadButton, 
  handleWebImageUploadButton 
} from '../handlers/discordImageHandlers';

// Discord client instance that will be initialized later
let client: Client | null = null;

// Track connection state
const botStatus = {
  connected: false,
  status: 'disconnected',
  username: '',
  id: '',
  guilds: 0
};

/**
 * Handle the list articles command
 * Shows a list of recent articles with their status
 */
async function handleListArticlesCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const articles = await storage.getArticles();
    
    if (articles.length === 0) {
      await interaction.editReply('No articles found in the database.');
      return;
    }
    
    // Sort articles with most recent first (by creation date)
    articles.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    
    // Create a rich embed for each article (up to 10)
    const embeds = articles.slice(0, 10).map(article => {
      // Create an embed for this article
      const embed = new EmbedBuilder()
        .setTitle(article.title.substring(0, 255))
        .setDescription(article.description ? article.description.substring(0, 200) : 'No description')
        .addFields(
          { name: 'Status', value: article.status, inline: true },
          { name: 'ID', value: article.id.toString(), inline: true }
        )
        .setTimestamp(article.created_at ? new Date(article.created_at) : new Date())
        .setColor(
          article.status === 'published' ? 0x00FF00 : // Green for published
          article.status === 'pending' ? 0xFFA500 : // Orange for pending
          0x0099FF // Blue for draft or other statuses
        );
      
      return embed;
    });
    
    // Send the embeds
    await interaction.editReply({ 
      content: `Found ${articles.length} articles (showing up to 10):`,
      embeds 
    });
    
  } catch (error) {
    console.error('Error handling list articles command:', error);
    await interaction.editReply('There was an error fetching the articles. Please try again later.');
  }
}

/**
 * Fetch team members from database
 */
async function getTeamMembers() {
  try {
    const members = await storage.getTeamMembers();
    return members;
  } catch (error) {
    console.error('Error fetching team members:', error);
    return [];
  }
}

/**
 * Create a select menu for team member selection
 */
async function createAuthorSelectMenu() {
  try {
    const members = await getTeamMembers();
    
    // If there are no members, create a blank default
    if (members.length === 0) {
      members.push({
        id: 0,
        name: 'Anonymous',
        role: 'Default',
        bio: '',
        image_url: null,
        external_id: null,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    // Create a select menu with team members as options
    const authorSelect = new StringSelectMenuBuilder()
      .setCustomId('author_select')
      .setPlaceholder('Select an author')
      .addOptions(
        members.map(member => ({
          label: member.name.substring(0, 100), // Max 100 chars for labels
          description: member.role ? member.role.substring(0, 100) : 'Team Member',
          value: member.id.toString()
        }))
      );
    
    return authorSelect;
  } catch (error) {
    console.error('Error creating author select menu:', error);
    
    // Return a fallback select menu
    return new StringSelectMenuBuilder()
      .setCustomId('author_select')
      .setPlaceholder('Select an author')
      .addOptions([
        {
          label: 'Anonymous',
          description: 'Default author when no selection is available',
          value: '0'
        }
      ]);
  }
}

/**
 * Handle the create article command
 * Create a new article with Discord
 */
async function handleCreateArticleCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create modal with form fields
    const modal = new ModalBuilder()
      .setCustomId('create_article_modal')
      .setTitle('Create New Article');
    
    // Add fields to the modal
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter article title')
      .setRequired(true)
      .setMaxLength(255);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Short description of the article')
      .setRequired(false)
      .setMaxLength(500);
    
    const contentInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('Content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Article content (markdown supported)')
      .setRequired(false)
      .setMaxLength(4000);
    
    // Create action rows for each input
    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const contentRow = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
    
    // Add the rows to the modal
    modal.addComponents(titleRow, descriptionRow, contentRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing create article modal:', error);
    await interaction.editReply('There was an error creating the article form. Please try again later.');
  }
}

/**
 * Create a select menu for article selection
 */
async function createArticleSelectMenu() {
  try {
    const articles = await storage.getArticles();
    
    // If there are no articles, return null
    if (articles.length === 0) {
      return null;
    }
    
    // Sort articles with most recent first (by creation date)
    articles.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    
    // Create a select menu with articles as options (limited to 25)
    const articleSelect = new StringSelectMenuBuilder()
      .setCustomId('article_select')
      .setPlaceholder('Select an article to edit')
      .addOptions(
        articles.slice(0, 25).map(article => ({
          label: article.title.substring(0, 100), // Max 100 chars for labels
          description: `Status: ${article.status}`,
          value: article.id.toString()
        }))
      );
    
    return articleSelect;
  } catch (error) {
    console.error('Error creating article select menu:', error);
    return null;
  }
}

/**
 * Handle the edit article command
 * Edit an existing article with Discord
 */
async function handleEditArticleCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articleSelect = await createArticleSelectMenu();
    
    if (!articleSelect) {
      await interaction.editReply('No articles found to edit. Create a new article first using the `/create_article` command.');
      return;
    }
    
    // Create action row for the select menu
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(articleSelect);
    
    // Send the select menu
    await interaction.editReply({
      content: 'Select an article to edit:',
      components: [row]
    });
  } catch (error) {
    console.error('Error handling edit article command:', error);
    await interaction.editReply('There was an error preparing the article edit form. Please try again later.');
  }
}

/**
 * Open a modal for editing an article
 */
async function openArticleEditModal(interaction: any, articleId: number) {
  try {
    // Get the article details
    const article = await storage.getArticle(articleId);
    
    if (!article) {
      await interaction.reply({
        content: `No article found with ID ${articleId}. It may have been deleted.`,
        ephemeral: true
      });
      return;
    }
    
    // Create modal with form fields
    const modal = new ModalBuilder()
      .setCustomId(`edit_article_modal_${articleId}`)
      .setTitle('Edit Article');
    
    // Add fields to the modal
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter article title')
      .setRequired(true)
      .setMaxLength(255)
      .setValue(article.title || '');
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Short description of the article')
      .setRequired(false)
      .setMaxLength(500)
      .setValue(article.description || '');
    
    const bodyInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('Content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Article content (markdown supported)')
      .setRequired(false)
      .setMaxLength(4000)
      .setValue(article.content || '');
    
    const authorInput = new TextInputBuilder()
      .setCustomId('author')
      .setLabel('Author')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Author name')
      .setRequired(false)
      .setMaxLength(100)
      .setValue(article.author || '');
    
    const featuredInput = new TextInputBuilder()
      .setCustomId('featured')
      .setLabel('Featured (true/false)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter true or false')
      .setRequired(false)
      .setMaxLength(5)
      .setValue(article.featured ? 'true' : 'false');
    
    // Create action rows for each input
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
    console.error('Error opening article edit modal:', error);
    throw error;
  }
}

/**
 * Handle modal submissions (both create and edit)
 */
async function handleModalSubmission(interaction: ModalSubmitInteraction) {
  try {
    // Check if this is a create article modal
    if (interaction.customId === 'create_article_modal') {
      await interaction.deferReply({ ephemeral: true });
      
      // Extract the fields from the modal
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const content = interaction.fields.getTextInputValue('content');
      
      // Create the article
      const articleData: InsertArticle = {
        title,
        description: description || null,
        content: content || null,
        author: null,
        featured: false,
        status: 'draft',
        external_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const article = await storage.createArticle(articleData);
      
      // Send confirmation
      await interaction.editReply({
        content: `Article created successfully!\n\nTitle: ${article.title}\nStatus: ${article.status}\nID: ${article.id}`
      });
    }
    // Check if this is an edit article modal
    else if (interaction.customId.startsWith('edit_article_modal_')) {
      await interaction.deferReply({ ephemeral: true });
      
      // Extract the article ID from the custom ID
      const articleId = parseInt(interaction.customId.replace('edit_article_modal_', ''));
      
      if (isNaN(articleId)) {
        await interaction.editReply('Invalid article ID. Please try again.');
        return;
      }
      
      // Get the existing article to make sure it exists
      const existingArticle = await storage.getArticle(articleId);
      
      if (!existingArticle) {
        await interaction.editReply('Article not found. It may have been deleted.');
        return;
      }
      
      // Extract the fields from the modal
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const content = interaction.fields.getTextInputValue('content');
      const author = interaction.fields.getTextInputValue('author');
      const featuredText = interaction.fields.getTextInputValue('featured');
      const featured = featuredText.toLowerCase() === 'true';
      
      // Update the article
      const updatedArticle = await storage.updateArticle(articleId, {
        title,
        description: description || null,
        content: content || null,
        author: author || null,
        featured,
        updated_at: new Date()
      });
      
      if (!updatedArticle) {
        await interaction.editReply('Failed to update the article. Please try again.');
        return;
      }
      
      // Send confirmation
      await interaction.editReply({
        content: `Article updated successfully!\n\nTitle: ${updatedArticle.title}\nStatus: ${updatedArticle.status}\nID: ${updatedArticle.id}`
      });
    }
  } catch (error) {
    console.error('Error handling modal submission:', error);
    
    try {
      // Check if we've already deferred, in which case we need to editReply
      if (interaction.deferred) {
        await interaction.editReply('There was an error processing your submission. Please try again later.');
      } else {
        // If we haven't deferred, we can reply directly
        await interaction.reply({
          content: 'There was an error processing your submission. Please try again later.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

/**
 * Handle dropdown selections for various menus
 */
async function handleStringSelectMenuInteraction(interaction: any) {
  try {
    // Handle article selection dropdown
    if (interaction.customId === 'article_select') {
      // Get the selected article ID before deferring
      const articleId = parseInt(interaction.values[0], 10);
      
      if (isNaN(articleId) || articleId === 0) {
        // For error messages, we can defer first
        await interaction.deferUpdate();
        await interaction.followUp({
          content: 'No valid article was selected.',
          ephemeral: true
        });
        return;
      }
      
      // We don't defer update here because we need to show a modal
      // and modals cannot be shown after deferUpdate
      
      // Open the edit modal for the selected article
      try {
        // Directly show the modal without deferring first
        await openArticleEditModal(interaction, articleId);
      } catch (error) {
        console.error('Error showing edit modal:', error);
        
        // If modal fails, try to let the user know
        try {
          await interaction.deferUpdate();
          await interaction.followUp({
            content: 'Error opening the edit modal. Please try again later.',
            ephemeral: true
          });
        } catch (replyError) {
          console.error('Error sending error notification:', replyError);
        }
      }
    }
    // Handle article selection for Instagram image upload
    else if (interaction.customId === 'select_article_for_insta_image') {
      // Get the selected article ID
      const articleId = parseInt(interaction.values[0], 10);
      
      if (isNaN(articleId) || articleId === 0) {
        await interaction.deferUpdate();
        await interaction.followUp({
          content: 'No valid article was selected.',
          ephemeral: true
        });
        return;
      }
      
      await interaction.deferUpdate();
      
      // Get the article details to confirm
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        await interaction.followUp({
          content: `No article found with ID ${articleId}. It may have been deleted.`,
          ephemeral: true
        });
        return;
      }
      
      // Create a button for uploading image
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_insta_image_${articleId}`)
        .setLabel('Upload Instagram Image')
        .setStyle(ButtonStyle.Primary);
      
      // Create a button to view in dashboard
      const viewButton = new ButtonBuilder()
        .setLabel('View in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(uploadButton, viewButton);
      
      await interaction.followUp({
        content: `Selected article: **${article.title}**\nStatus: ${article.status}\n\nClick the button below to upload an Instagram image for this article.`,
        components: [row],
        ephemeral: true
      });
    }
    // Handle article selection for web image upload
    else if (interaction.customId === 'select_article_for_web_image') {
      // Get the selected article ID
      const articleId = parseInt(interaction.values[0], 10);
      
      if (isNaN(articleId) || articleId === 0) {
        await interaction.deferUpdate();
        await interaction.followUp({
          content: 'No valid article was selected.',
          ephemeral: true
        });
        return;
      }
      
      await interaction.deferUpdate();
      
      // Get the article details to confirm
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        await interaction.followUp({
          content: `No article found with ID ${articleId}. It may have been deleted.`,
          ephemeral: true
        });
        return;
      }
      
      // Create a button for uploading image
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_web_image_${articleId}`)
        .setLabel('Upload Web Image')
        .setStyle(ButtonStyle.Primary);
      
      // Create a button to view in dashboard
      const viewButton = new ButtonBuilder()
        .setLabel('View in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(uploadButton, viewButton);
      
      await interaction.followUp({
        content: `Selected article: **${article.title}**\nStatus: ${article.status}\n\nClick the button below to upload a main web image for this article.`,
        components: [row],
        ephemeral: true
      });
    }
    // Add other select menu handlers here as needed
  } catch (error) {
    console.error('Error handling string select menu interaction:', error);
    
    try {
      // Try to respond with an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'There was an error processing your selection. Please try again later.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'There was an error processing your selection. Please try again later.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

/**
 * Handle button interaction events
 */
async function handleButtonInteraction(interaction: MessageComponentInteraction) {
  try {
    // Handle Instagram image upload button
    if (interaction.customId.startsWith('upload_insta_image_')) {
      // Extract article ID from the custom ID
      const articleId = parseInt(interaction.customId.replace('upload_insta_image_', ''));
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: 'Invalid article ID. Please try again.',
          ephemeral: true
        });
        return;
      }
      
      // Get the article to make sure it exists and is not published
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        await interaction.reply({
          content: 'Article not found. It may have been deleted.',
          ephemeral: true
        });
        return;
      }
      
      if (article.status === 'published') {
        await interaction.reply({
          content: 'This article is already published. Image uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Use our dedicated handler from the imported module
      await handleInstaImageUploadButton(interaction, articleId, article);
    }
    // Handle Web image upload button
    else if (interaction.customId.startsWith('upload_web_image_')) {
      // Extract article ID from the custom ID
      const articleId = parseInt(interaction.customId.replace('upload_web_image_', ''));
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: 'Invalid article ID. Please try again.',
          ephemeral: true
        });
        return;
      }
      
      // Get the article to make sure it exists and is not published
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        await interaction.reply({
          content: 'Article not found. It may have been deleted.',
          ephemeral: true
        });
        return;
      }
      
      if (article.status === 'published') {
        await interaction.reply({
          content: 'This article is already published. Image uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Use our dedicated handler from the imported module
      await handleWebImageUploadButton(interaction, articleId, article);
    }
    // Add other button handlers here as needed
  } catch (error) {
    console.error('Error handling button interaction:', error);
    
    try {
      // Try to respond with an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'There was an error processing your request. Please try again later.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'There was an error processing your request. Please try again later.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

/**
 * Initialize a new Discord bot with the provided token and client ID
 */
export const initializeDiscordBot = async (token: string, clientId: string) => {
  try {
    // Set up the client with necessary intents
    // Note: MessageContent intent is needed to read message content (for image attachments)
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Important for image attachments!
        GatewayIntentBits.DirectMessages
      ]
    });
    
    // Register event handlers once the client is ready
    client.once(Events.ClientReady, (c) => {
      console.log(`Ready! Logged in as ${c.user.tag}`);
      
      botStatus.connected = true;
      botStatus.status = 'connected';
      botStatus.username = c.user.username;
      botStatus.id = c.user.id;
      botStatus.guilds = c.guilds.cache.size;
      
      // Register slash commands with Discord 
      registerCommands(clientId, token);
    });
    
    // Handle interactions (commands, buttons, etc.)
    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
          // Handle individual commands based on name
          const { commandName } = interaction;
          
          if (commandName === 'list_articles') {
            await handleListArticlesCommand(interaction);
          }
          else if (commandName === 'create_article') {
            await handleCreateArticleCommand(interaction);
          }
          else if (commandName === 'edit_article') {
            await handleEditArticleCommand(interaction);
          }
          else if (commandName === 'insta') {
            await handleInstaImageCommand(interaction);
          }
          else if (commandName === 'web') {
            await handleWebImageCommand(interaction);
          }
          // Add more commands as needed
        }
        // Handle button interactions
        else if (interaction.isButton()) {
          await handleButtonInteraction(interaction);
        }
        // Handle string select menu interactions (dropdowns)
        else if (interaction.isStringSelectMenu()) {
          await handleStringSelectMenuInteraction(interaction);
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
          await handleModalSubmission(interaction as ModalSubmitInteraction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
      }
    });
    
    // Log in to Discord with the provided token
    await client.login(token);
    
    return client;
  } catch (error) {
    console.error('Failed to initialize Discord bot:', error);
    botStatus.status = 'error: ' + (error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/**
 * Register slash commands with Discord
 */
async function registerCommands(clientId: string, token: string) {
  try {
    console.log('Registering slash commands...');
    
    // Create the list of commands
    const commands = [
      new SlashCommandBuilder()
        .setName('list_articles')
        .setDescription('List all articles in the database'),
      
      new SlashCommandBuilder()
        .setName('create_article')
        .setDescription('Create a new article'),
      
      new SlashCommandBuilder()
        .setName('edit_article')
        .setDescription('Edit an existing article'),
      
      new SlashCommandBuilder()
        .setName('insta')
        .setDescription('Upload an Instagram image for an article'),
      
      new SlashCommandBuilder()
        .setName('web')
        .setDescription('Upload a main web image for an article')
    ];
    
    // Create the REST API client
    const rest = new REST().setToken(token);
    
    // Register the commands
    try {
      console.log('Started refreshing application (/) commands.');
      
      // Register commands globally (for all guilds/servers)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Error registering commands:', error);
    }
  } catch (error) {
    console.error('Error in registerCommands:', error);
  }
}

/**
 * Start the Discord bot
 */
export const startDiscordBot = async () => {
  try {
    if (client) {
      console.log('Bot is already running');
      return;
    }
    
    const token = await getDiscordBotToken();
    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'client_id');
    
    if (!token) {
      throw new Error('Discord bot token not found in settings');
    }
    
    if (!clientIdSetting?.value) {
      throw new Error('Discord client ID not found in settings');
    }
    
    const clientId = clientIdSetting.value;
    
    // Initialize and start the bot
    return await initializeDiscordBot(token, clientId);
  } catch (error) {
    console.error('Error starting Discord bot:', error);
    botStatus.status = 'error: ' + (error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/**
 * Stop the Discord bot
 */
export const stopDiscordBot = async () => {
  try {
    if (!client) {
      console.log('Bot is not running');
      return;
    }
    
    // Destroy the client
    await client.destroy();
    client = null;
    
    // Update status
    botStatus.connected = false;
    botStatus.status = 'disconnected';
    botStatus.username = '';
    botStatus.id = '';
    botStatus.guilds = 0;
    
    console.log('Discord bot stopped');
  } catch (error) {
    console.error('Error stopping Discord bot:', error);
    throw error;
  }
};

/**
 * Get the Discord bot status
 */
export const getDiscordBotStatus = () => {
  return botStatus;
};

/**
 * Helper function to get the Discord bot token from storage
 */
async function getDiscordBotToken(): Promise<string> {
  const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
  
  if (!tokenSetting?.value || !tokenSetting.enabled) {
    return '';
  }
  
  return tokenSetting.value;
}

/**
 * Set up Discord bot routes for the Express app
 */
export function setupDiscordBotRoutes(app: Express) {
  app.post("/api/discord/bot/initialize", async (req: Request, res: Response) => {
    try {
      const { token, clientId } = req.body;
      
      if (!token || !clientId) {
        return res.status(400).json({
          success: false,
          message: 'Bot token and client ID are required'
        });
      }
      
      // First, save these settings to the database
      const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
      const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'client_id');
      
      if (tokenSetting) {
        await storage.updateIntegrationSetting(tokenSetting.id, {
          value: token,
          enabled: true
        });
      } else {
        await storage.createIntegrationSetting({
          service: 'discord',
          key: 'bot_token',
          value: token,
          description: 'Discord Bot Token',
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      
      if (clientIdSetting) {
        await storage.updateIntegrationSetting(clientIdSetting.id, {
          value: clientId,
          enabled: true
        });
      } else {
        await storage.createIntegrationSetting({
          service: 'discord',
          key: 'client_id',
          value: clientId,
          description: 'Discord Client ID',
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      
      // Then initialize the bot
      await initializeDiscordBot(token, clientId);
      
      res.status(200).json({
        success: true,
        message: 'Discord bot initialized successfully',
        status: getDiscordBotStatus()
      });
    } catch (error) {
      console.error('Error initializing Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'Error initializing Discord bot: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  });
  
  app.post("/api/discord/bot/start", async (req: Request, res: Response) => {
    try {
      await startDiscordBot();
      
      res.status(200).json({
        success: true,
        message: 'Discord bot started successfully',
        status: getDiscordBotStatus()
      });
    } catch (error) {
      console.error('Error starting Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'Error starting Discord bot: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  });
  
  app.post("/api/discord/bot/stop", async (req: Request, res: Response) => {
    try {
      await stopDiscordBot();
      
      res.status(200).json({
        success: true,
        message: 'Discord bot stopped successfully',
        status: getDiscordBotStatus()
      });
    } catch (error) {
      console.error('Error stopping Discord bot:', error);
      res.status(500).json({
        success: false,
        message: 'Error stopping Discord bot: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  });
  
  app.get("/api/discord/bot/status", (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      status: getDiscordBotStatus()
    });
  });
}

/**
 * Add a new API endpoint to receive article submissions from Discord
 */
export function setupArticleReceiveEndpoint(app: Express) {
  app.post("/api/discord/articles", async (req: Request, res: Response) => {
    try {
      const { title, content, description, author, featured } = req.body;
      
      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Article title is required'
        });
      }
      
      // Create a new article
      const articleData: InsertArticle = {
        title,
        content: content || null,
        description: description || null,
        author: author || null,
        featured: featured === true,
        status: 'draft',
        external_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const article = await storage.createArticle(articleData);
      
      // Log the activity
      await storage.createActivityLog({
        action: 'create',
        entity_type: 'article',
        entity_id: article.id,
        description: `Article "${article.title}" created via Discord API`,
        user_id: null,
        metadata: JSON.stringify(article),
        created_at: new Date()
      });
      
      res.status(201).json({
        success: true,
        message: 'Article created successfully',
        article
      });
    } catch (error) {
      console.error('Error creating article from Discord:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating article: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  });
}

/**
 * Auto-start the Discord bot if settings are available
 */
export const autoStartDiscordBot = async () => {
  try {
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    
    if (tokenSetting?.value && tokenSetting.enabled) {
      console.log('Auto-starting Discord bot...');
      await startDiscordBot();
    }
  } catch (error) {
    console.error('Error auto-starting Discord bot:', error);
  }
};