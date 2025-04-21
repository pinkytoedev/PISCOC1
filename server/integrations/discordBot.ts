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
  ChannelType,
  TextBasedChannel,
  DMChannel,
  NewsChannel,
  TextChannel
} from 'discord.js';
import type { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { Article, InsertArticle } from '@shared/schema';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs-extra';
import { uploadImageToImgBB, uploadImageUrlToImgBB } from '../utils/imgbbUploader';
import { uploadImageToAirtable, uploadImageUrlToAirtable } from '../utils/imageUploader';
import { marked } from 'marked';
import extract from 'extract-zip';

// Store bot instance for the application lifecycle
let client: Client | null = null;

// Export the Discord bot for use in other modules
export const discordBot = {
  get client() { return client; }
};
// Define more detailed bot status interface
interface GuildInfo {
  id: string;
  name: string;
  memberCount: number;
  icon?: string;
  owner?: boolean;
}

interface WebhookInfo {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
}

let botStatus = {
  connected: false,
  status: 'Not initialized',
  username: '',
  id: '',
  guilds: 0,
  guildsList: [] as GuildInfo[],
  webhooks: [] as WebhookInfo[]
};

/**
 * Handler for the /list_articles command
 * Lists all articles that are not published (drafts, pending review, etc.)
 */
async function handleListArticlesCommand(interaction: any) {
  await interaction.deferReply();
  
  try {
    // Get non-published articles
    const allArticles = await storage.getArticles();
    const nonPublishedArticles = allArticles.filter(article => article.status !== 'published');
    
    if (nonPublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found. You can create a new article with `/create_article`.');
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
      // Map the fields to Airtable field names
      const title = article.title || 'Untitled';       // Maps to Airtable's "Name" field
      const status = article.status || 'draft';
      const date = article.createdAt 
        ? new Date(article.createdAt).toLocaleDateString() 
        : 'No date';
      
      // Show author information when available
      const authorInfo = article.author ? 
        (typeof article.author === 'string' ? `\nAuthor: ${article.author}` : '\nAuthor: Unknown') : '';
        
      embed.addFields({
        name: `${index + 1}. ${title}`,
        value: `Status: **${status}**\nLast updated: ${date}${authorInfo}\nID: ${article.id}`
      });
    });
    
    // If there are more articles, indicate this
    if (nonPublishedArticles.length > 10) {
      embed.setFooter({
        text: `Showing 10 of ${nonPublishedArticles.length} unpublished articles.`
      });
    } else {
      embed.setFooter({
        text: 'Articles submitted through Discord will be synced to Airtable through the website'
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
 * Helper function to get all team members from the database
 * Used for author suggestions/selection
 */
async function getTeamMembers() {
  try {
    return await storage.getTeamMembers();
  } catch (error) {
    console.error('Error fetching team members:', error);
    return [];
  }
}

/**
 * Helper function to create an author selection component
 * Uses a dropdown with team members as options, limited to Discord's 25-option maximum
 */
async function createAuthorSelectMenu() {
  // Get all team members for author options
  let teamMembers = await getTeamMembers();
  
  // Sort by name for consistency
  teamMembers = teamMembers.sort((a, b) => a.name.localeCompare(b.name));
  
  // Limit to 24 members to leave room for the "Custom" option (Discord limit is 25 options total)
  // If there are more than 24 members, we'll take the first 24 alphabetically
  if (teamMembers.length > 24) {
    console.log(`Warning: Limiting team members dropdown to 24 options (+ custom) from ${teamMembers.length} total members`);
    teamMembers = teamMembers.slice(0, 24);
  }
  
  // Create options from limited team members
  const options = teamMembers.map(member => ({
    label: member.name,
    value: member.id.toString(), // We'll use the ID as the value for proper referencing
    description: member.role?.substring(0, 50) || 'Team Member' // Limit description to 50 chars for safety
  }));
  
  // Add a "Manual Entry" option
  options.push({
    label: "Enter Custom Author",
    value: "custom",
    description: "Enter a custom author name not in the list"
  });
  
  // Return the select menu
  return new StringSelectMenuBuilder()
    .setCustomId('author_select')
    .setPlaceholder('Select an author from team members')
    .addOptions(options);
}

/**
 * Handler for the /create_article command
 * Opens a modal for article creation
 */
async function handleCreateArticleCommand(interaction: any) {
  try {
    // Create modal for article creation
    const modal = new ModalBuilder()
      .setCustomId('create_article_modal')
      .setTitle('Create New Article');

    // Add input fields that match our Airtable field names
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title')  // Maps to Airtable's "Name" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter article title')
      .setRequired(true)
      .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')  // Maps to Airtable's "Description" field
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter a brief description')
      .setRequired(true)
      .setMaxLength(500);
    
    const bodyInput = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('Body')  // Maps to Airtable's "Body" field
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the article content')
      .setRequired(true)
      .setMaxLength(4000);
    
    // For author, we'll use a text input initially, but we'll display a selection dropdown after showing the modal
    const authorInput = new TextInputBuilder()
      .setCustomId('author')
      .setLabel('Author')  // Maps to Airtable's "Author" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Choose from team members in the follow-up prompt')
      .setRequired(true)
      .setMaxLength(100);
    
    const featuredInput = new TextInputBuilder()
      .setCustomId('featured')
      .setLabel('Featured (yes/no)')  // Maps to Airtable's "Featured" field
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
    
    // Show the modal with info about field mapping
    await interaction.showModal(modal);
    
    // Add a follow-up message about Airtable mapping and author selection
    try {
      // Get author selection menu
      const authorSelect = await createAuthorSelectMenu();
      const authorRow = new ActionRowBuilder().addComponents(authorSelect);
      
      await interaction.followUp({
        content: "**Important:** Please select an author from the team members dropdown below. This will properly link to Airtable's reference field.\n\nThe fields in this form map to Airtable fields: Title → Name, Description → Description, Body → Body, Author → Author, Featured → Featured",
        components: [authorRow],
        ephemeral: true
      });
    } catch (error) {
      // Ignore follow-up errors as the modal still works
      console.log("Couldn't send follow-up about field mapping:", error);
    }
  } catch (error) {
    console.error('Error showing article creation modal:', error);
    await interaction.reply({ 
      content: 'Sorry, there was an error creating the article form.', 
      ephemeral: true 
    });
  }
}

/**
 * Create a select menu for unpublished articles
 */
async function createArticleSelectMenu() {
  // Get all draft and pending articles
  const draftArticles = await storage.getArticlesByStatus('draft');
  const pendingArticles = await storage.getArticlesByStatus('pending');
  
  // Combine them and sort by creation date (newest first)
  const unpublishedArticles = [...draftArticles, ...pendingArticles].sort((a, b) => {
    // Convert dates to numbers for comparison, fallback to 0 if null/undefined
    const dateA = a.createdAt ? new Date(a.createdAt.toString()).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt.toString()).getTime() : 0;
    return dateB - dateA; // Newest first
  });
  
  // Create options for the select menu (max 25 options allowed by Discord)
  const options = unpublishedArticles.slice(0, 25).map(article => {
    // Format title with status
    const statusIcon = article.status === 'draft' ? '📝' : '⏳';
    // Safely handle title, provide a fallback if missing
    const title = article.title || 'Untitled Article';
    let optionLabel = `${statusIcon} ${title}`;
    
    // Truncate if needed (Discord max length is 100 chars)
    if (optionLabel.length > 95) {
      optionLabel = optionLabel.substring(0, 95) + '...';
    }
    
    const authorText = article.author ? 
      (typeof article.author === 'string' ? article.author.substring(0, 30) : 'Unknown') : 'Unknown';
    
    return {
      label: optionLabel,
      value: article.id.toString(),
      description: `ID: ${article.id} | Author: ${authorText}`
    };
  });
  
  // If no unpublished articles, add a placeholder option
  if (options.length === 0) {
    options.push({
      label: 'No unpublished articles found',
      value: '0',
      description: 'Create a new article or publish some from the website first'
    });
  }
  
  // Return the select menu
  return new StringSelectMenuBuilder()
    .setCustomId('article_select')
    .setPlaceholder('Select an article to edit')
    .addOptions(options);
}



/**
 * Handler for the /writers command
 * Provides a UI for writers to edit articles or upload zipped HTML content
 */
async function handleWritersCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articleSelect = await createArticleSelectMenu();
    
    // If no articles available
    if (articleSelect.options[0].data.value === '0') {
      await interaction.editReply('No unpublished articles found. Create a new article using `/create_article` or use the website to create draft articles first.');
      return;
    }
    
    // Show options to the user
    const editButton = new ButtonBuilder()
      .setCustomId('writers_edit')
      .setLabel('Edit Article')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️');
    
    const uploadButton = new ButtonBuilder()
      .setCustomId('writers_upload_zip')
      .setLabel('Upload Zipped HTML')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📁');
    
    const buttonRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(editButton, uploadButton);
    
    // Show the selection menu to the user
    await interaction.editReply({
      content: '**Writer Tools**\n\nChoose an option:\n• **Edit Article** - Edit an article\'s content directly through Discord\n• **Upload Zipped HTML** - Upload a zipped HTML file containing your article content',
      components: [buttonRow]
    });
    
  } catch (error) {
    console.error('Error handling writers command:', error);
    await interaction.editReply('Sorry, there was an error initializing the writers tools. Please try again later.');
  }
}

/**
 * Function to actually open the article edit modal after selection
 */
async function openArticleEditModal(interaction: any, articleId: number) {
  try {
    // Get the article from the database
    const article = await storage.getArticle(articleId);
    
    if (!article) {
      await interaction.followUp({
        content: `No article found with ID ${articleId}. It may have been deleted.`,
        ephemeral: true
      });
      return;
    }
    
    // Verify the article is not published
    if (article.status === 'published') {
      await interaction.followUp({
        content: 'This article has already been published and cannot be edited through the bot. Please use the website admin interface to edit published articles.',
        ephemeral: true
      });
      return;
    }
    
    // Create modal for article editing with pre-filled values
    const title = article.title || 'Untitled Article';
    const modal = new ModalBuilder()
      .setCustomId(`edit_article_modal_${articleId}`) // Include the article ID in the custom ID
      .setTitle(`Edit Article: ${title.substring(0, 30)}${title.length > 30 ? '...' : ''}`);

    // Add input fields that match our Airtable field names, with pre-filled values
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title')  // Maps to Airtable's "Name" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter article title')
      .setValue(article.title || '')
      .setRequired(true)
      .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')  // Maps to Airtable's "Description" field
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter a brief description')
      .setValue(article.description || '')
      .setRequired(true)
      .setMaxLength(500);
    
    const bodyInput = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('Body')  // Maps to Airtable's "Body" field
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the article content')
      .setValue(article.content || '')
      .setRequired(true)
      .setMaxLength(4000);
    
    const authorInput = new TextInputBuilder()
      .setCustomId('author')
      .setLabel('Author (read-only)')  // Maps to Airtable's "Author" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Current author (cannot be modified here)')
      .setValue(article.author || 'No author assigned')
      .setRequired(false) // Not required as it's read-only
      .setMaxLength(100);
    
    const featuredInput = new TextInputBuilder()
      .setCustomId('featured')
      .setLabel('Featured (yes/no)')  // Maps to Airtable's "Featured" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Type "yes" to mark as featured')
      .setValue(article.featured === 'yes' ? 'yes' : 'no')
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
    
    // Show the modal directly 
    // When showing a modal, no further interactions can happen until the modal is submitted
    // We will show the author selection dropdown after the modal is submitted instead
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error handling edit article command:', error);
    
    // Check if we can use followUp instead of editReply
    try {
      await interaction.followUp({
        content: 'Sorry, there was an error editing the article. Please try again later.',
        ephemeral: true
      });
    } catch (followUpError) {
      console.error('Error sending error follow-up:', followUpError);
    }
  }
}

/**
 * Handler for modal submissions (article creation)
 */
async function handleModalSubmission(interaction: ModalSubmitInteraction) {
  try {
    // Handle article creation
    if (interaction.customId === 'create_article_modal') {
      await interaction.deferReply({ ephemeral: true });
      
      // Get form input values
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const body = interaction.fields.getTextInputValue('body');
      const author = interaction.fields.getTextInputValue('author');
      const featuredInput = interaction.fields.getTextInputValue('featured').toLowerCase();
      const featured = featuredInput === 'yes' || featuredInput === 'y' || featuredInput === 'true';
      
      // Create article data - map to fields in our system
      // Note: These field names are later mapped to Airtable's fields by the website,
      // We're not directly modifying Airtable here
      const articleData: InsertArticle = {
        title,                    // Maps to Airtable's "Name" field
        description,              // Maps to Airtable's "Description" field
        content: body,            // Maps to Airtable's "Body" field
        author,                   // Maps to Airtable's "Author" field
        featured: featured ? 'yes' : 'no',  // Maps to Airtable's "Featured" field
        status: 'draft',          // Article status in our system
        imageUrl: 'https://placehold.co/600x400?text=No+Image', // Default placeholder image
        imageType: 'url',
        contentFormat: 'plaintext',
        source: 'discord',        // Identifies the article as coming from Discord
        externalId: `discord-${interaction.user.id}-${Date.now()}`,
      };
      
      // Create the article via our API - Discord bot only modifies our website's data
      const article = await storage.createArticle(articleData);
      
      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Article Created Successfully')
        .setDescription(`Your article "${title}" has been created as a draft on the website.`)
        .setColor('#22A559')
        .addFields(
          { name: 'Name', value: title },
          { name: 'Description', value: description.substring(0, 100) + (description.length > 100 ? '...' : '') },
          { name: 'Author', value: author },
          { name: 'Status', value: 'Draft' },
          { name: 'Featured', value: featured ? 'Yes' : 'No' }
        )
        .setFooter({ text: 'The article will be synced to Airtable through the website' });
      
      // Create buttons for next actions
      const uploadContentButton = new ButtonBuilder()
        .setCustomId(`upload_content_now_${article.id}`)
        .setLabel('Upload Text File Now')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📄');
        
      const viewInDashboardButton = new ButtonBuilder()
        .setLabel('View in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://piscoc.pinkytoepaper.com'}/articles?id=${article.id}`)
        .setEmoji('🔗');
        
      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(viewInDashboardButton, uploadContentButton);
      
      await interaction.editReply({ 
        embeds: [embed],
        components: [buttonRow]
      });
      
      // Add author selection menu after successful article creation
      try {
        // Get author selection menu
        const authorSelect = await createAuthorSelectMenu();
        const authorRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(authorSelect);
        
        await interaction.followUp({
          content: "**Important:** Please select an author from the team members dropdown below. This will properly link to Airtable's reference field.\n\nAlso, you can now upload a text file directly by clicking the 'Upload Text File Now' button above.",
          components: [authorRow],
          ephemeral: true
        });
      } catch (followUpError) {
        console.error("Couldn't send author selection menu:", followUpError);
      }
    }
    // Handle article editing (check if customId starts with edit_article_modal_)
    else if (interaction.customId.startsWith('edit_article_modal_')) {
      await interaction.deferReply({ ephemeral: true });
      
      // Extract the article ID from the customId (edit_article_modal_123 => 123)
      const articleId = parseInt(interaction.customId.replace('edit_article_modal_', ''), 10);
      
      if (isNaN(articleId)) {
        await interaction.editReply('Error: Invalid article ID');
        return;
      }
      
      // Get the existing article to verify it exists
      const existingArticle = await storage.getArticle(articleId);
      
      if (!existingArticle) {
        await interaction.editReply(`Error: Article with ID ${articleId} not found.`);
        return;
      }
      
      // Get form input values
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const body = interaction.fields.getTextInputValue('body');
      const author = interaction.fields.getTextInputValue('author');
      const featuredInput = interaction.fields.getTextInputValue('featured').toLowerCase();
      const featured = featuredInput === 'yes' || featuredInput === 'y' || featuredInput === 'true';
      
      // Update article data - don't update the author field (it's read-only)
      const articleData = {
        title,                     // Maps to Airtable's "Name" field
        description,               // Maps to Airtable's "Description" field
        content: body,             // Maps to Airtable's "Body" field
        // author field is intentionally omitted - keep existing author
        featured: featured ? 'yes' : 'no',  // Maps to Airtable's "Featured" field
        // Don't change the status of the article
        // Don't change image or other fields (keep them as is)
      };
      
      // Update the article via our API
      const updatedArticle = await storage.updateArticle(articleId, articleData);
      
      if (!updatedArticle) {
        await interaction.editReply(`Error: Failed to update article with ID ${articleId}.`);
        return;
      }
      
      // Send confirmation
      const embed = new EmbedBuilder()
        .setTitle('✅ Article Updated Successfully')
        .setDescription(`Your article "${title}" has been updated on the website.`)
        .setColor('#22A559')
        .addFields(
          { name: 'Name', value: title },
          { name: 'Description', value: description.substring(0, 100) + (description.length > 100 ? '...' : '') },
          { name: 'Author', value: existingArticle.author || 'No author assigned' }, // Display the existing author
          { name: 'Status', value: updatedArticle.status },
          { name: 'Featured', value: featured ? 'Yes' : 'No' }
        )
        .setFooter({ text: 'The updated article will be synced to Airtable through the website' });
      
      // Add information about the author being read-only
      await interaction.editReply({ 
        embeds: [embed],
        // Add a follow-up message explaining that the author field is read-only
        content: "**Note:** The author field is read-only when editing articles. To change an article's author, please use the website interface."
      });
    }
  } catch (error) {
    console.error('Error handling modal submission:', error);
    try {
      // Check if we need to use reply or editReply based on the interaction state
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Sorry, there was an error processing your article. Please try again later.',
          ephemeral: true
        });
      } else {
        await interaction.editReply('Sorry, there was an error processing your article. Please try again later.');
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

/**
 * Handler for string select menu interactions
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
      
      // Create buttons for different options
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_insta_image_${articleId}`)
        .setLabel('Upload via Bot')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📸');
      
      const dashboardButton = new ButtonBuilder()
        .setLabel('Open in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://piscoc.pinnkytoepaper'}/articles?id=${articleId}`)
        .setEmoji('🔗');
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(dashboardButton, uploadButton);
      
      // Confirm selection and provide options
      await interaction.editReply({
        content: `Selected article: **${article.title}**\n\nOptions for uploading an Instagram image:\n\n1. Use the "Upload via Bot" button to attach an image directly through Discord\n2. Use the dashboard link to upload through the website`,
        components: [buttonRow]
      });
    }
    // Handle article selection for Web image upload
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
      
      // Create buttons for different options
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_web_image_${articleId}`)
        .setLabel('Upload via Bot')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🖼️');
      
      const dashboardButton = new ButtonBuilder()
        .setLabel('Open in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://piscoc.pinkytoepaper.com'}/articles?id=${articleId}`)
        .setEmoji('🔗');
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(dashboardButton, uploadButton);
      
      // Confirm selection and provide options
      await interaction.editReply({
        content: `Selected article: **${article.title}**\n\nOptions for uploading a web (main) image:\n\n1. Use the "Upload via Bot" button to attach an image directly through Discord\n2. Use the dashboard link to upload through the website`,
        components: [buttonRow]
      });
    }
    // Handle article selection for content upload
    else if (interaction.customId === 'select_article_for_content_upload') {
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
      
      // Create buttons for different options
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_content_${articleId}`)
        .setLabel('Upload via Bot')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📄');
      
      const dashboardButton = new ButtonBuilder()
        .setLabel('Open in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://piscoc.pinkytoepaper.com'}/articles?id=${articleId}`)
        .setEmoji('🔗');
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(dashboardButton, uploadButton);
      
      // Confirm selection and provide options
      await interaction.editReply({
        content: `Selected article: **${article.title}**\n\nOptions for uploading content:\n\n1. Use the "Upload via Bot" button to attach an HTML, RTF, or plain text (.txt) file directly through Discord\n2. Use the dashboard link to edit through the website`,
        components: [buttonRow]
      });
    }
    
    // Handle article selection for zip file upload
    else if (interaction.customId === 'select_article_for_zip_upload') {
      await interaction.deferUpdate();
      
      // Get the selected article ID
      const articleId = parseInt(interaction.values[0], 10);
      
      if (isNaN(articleId) || articleId === 0) {
        await interaction.followUp({
          content: 'No valid article was selected.',
          ephemeral: true
        });
        return;
      }
      
      // Get the article to make sure it exists
      const article = await storage.getArticle(articleId);
      
      if (!article) {
        await interaction.followUp({
          content: `No article found with ID ${articleId}. It may have been deleted.`,
          ephemeral: true
        });
        return;
      }
      
      // Check if the article is already published
      if (article.status === 'published') {
        await interaction.followUp({
          content: 'This article is already published. Content uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Create buttons for different options
      const uploadButton = new ButtonBuilder()
        .setCustomId(`upload_zip_${articleId}`)
        .setLabel('Upload Zipped HTML')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📁');
      
      const dashboardButton = new ButtonBuilder()
        .setLabel('Open in Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`)
        .setEmoji('🔗');
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(dashboardButton, uploadButton);
      
      // Confirm selection and provide options
      await interaction.followUp({
        content: `Selected article: **${article.title}**\n\nOptions for uploading zipped HTML content:\n\n1. Use the "Upload Zipped HTML" button to attach a .zip file containing HTML and related assets\n2. Use the dashboard link to edit through the website`,
        components: [buttonRow],
        ephemeral: true
      });
    }
    
    // Handle author selection dropdown
    else if (interaction.customId === 'author_select') {
      await interaction.deferUpdate();
      
      // Get the selected team member ID
      const selectedValue = interaction.values[0];
      if (!selectedValue) {
        await interaction.followUp({
          content: 'No author was selected.',
          ephemeral: true
        });
        return;
      }
      
      // Check if the user selected "custom" option
      if (selectedValue === 'custom') {
        await interaction.followUp({
          content: '✅ You chose to enter a custom author name. Please make sure you entered it in the article form.',
          ephemeral: true
        });
        return;
      }
      
      // Get the team member info from our database
      const teamMember = await storage.getTeamMember(parseInt(selectedValue, 10));
      
      if (!teamMember) {
        await interaction.followUp({
          content: 'Could not find the selected team member.',
          ephemeral: true
        });
        return;
      }
      
      // Try to find the article ID from recent interactions
      // This is a simplistic approach - we're assuming this menu is shown after a modal submission
      // In a more robust implementation, you'd include article ID in the menu's custom ID
      
      // First, try to find a recent created article
      const recentArticles = await storage.getArticlesByStatus('draft');
      const TWO_MINUTES_MS = 2 * 60 * 1000;

      let targetArticle = recentArticles.find(article => {
        // Check if it's from discord and created by this user
        if (!article.source || article.source !== 'discord' || !article.externalId?.includes(interaction.user.id)) {
          return false;
        }
        
        // If createdAt exists, check if it was created in the last 2 minutes
        if (article.createdAt) {
          try {
            // Ensure we're working with a string
            const createdAtString = typeof article.createdAt === 'object' 
              ? article.createdAt.toISOString() 
              : String(article.createdAt);
              
            const createdTime = new Date(createdAtString).getTime();
            return (Date.now() - createdTime < TWO_MINUTES_MS);
          } catch (err) {
            return false;
          }
        }
        return false;
      });
      
      if (targetArticle) {
        // Update the article with the team member's name
        // We'll store the author name since that's what our schema has
        const updatedArticle = await storage.updateArticle(targetArticle.id, {
          author: teamMember.name,
          // Store the externalId of the team member in a way that Airtable can reference it
          // This could be improved by adding a proper author reference field to the schema
          photo: teamMember.externalId || `ref_${teamMember.id}`
        });
        
        if (updatedArticle) {
          await interaction.followUp({
            content: `✅ Selected author: **${teamMember.name}**\n\nYour draft article has been updated with this author. This will properly reference the team member in Airtable when the article is synced.`,
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: `✅ Selected author: **${teamMember.name}**\n\nCouldn't automatically update your article. Please make sure to manually set this author in your article.`,
            ephemeral: true
          });
        }
      } else {
        // If we can't find a recent article, just confirm the selection
        await interaction.followUp({
          content: `✅ Selected author: **${teamMember.name}**\n\nThis author will be used for your article. When creating or editing articles, please enter this name to ensure proper Airtable reference.`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error('Error handling string select menu interaction:', error);
    try {
      if (!interaction.replied) {
        await interaction.followUp({ 
          content: 'An error occurred while processing your selection.', 
          ephemeral: true 
        });
      }
    } catch (followUpError) {
      console.error('Error sending error follow-up:', followUpError);
    }
  }
}

/**
 * Handler for button interactions
 */
/**
 * Handle the Edit Article option from the Writers command
 */
async function handleWritersEditOption(interaction: MessageComponentInteraction) {
  await interaction.deferUpdate();
  
  try {
    // Create a select menu for article selection
    const articleSelect = await createArticleSelectMenu();
    
    // If no articles available to edit
    if (articleSelect.options[0].data.value === '0') {
      await interaction.followUp({
        content: 'No unpublished articles found to edit. Create a new article using `/create_article` or use the website to create draft articles first.',
        ephemeral: true
      });
      return;
    }
    
    // Create an action row with the article select menu
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(articleSelect);
    
    // Show the selection menu to the user
    await interaction.followUp({
      content: 'Please select an article to edit:',
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error handling writers edit option:', error);
    await interaction.followUp({
      content: 'Sorry, there was an error fetching articles. Please try again later.',
      ephemeral: true
    });
  }
}

/**
 * Handle the Upload Zipped HTML option from the Writers command
 */
async function handleWritersUploadOption(interaction: MessageComponentInteraction) {
  await interaction.deferUpdate();
  
  try {
    // Create a select menu for article selection
    const articleSelect = await createArticleSelectMenu();
    
    // If no articles available to edit
    if (articleSelect.options[0].data.value === '0') {
      await interaction.followUp({
        content: 'No unpublished articles found to upload content to. Create a new article using `/create_article` or use the website to create draft articles first.',
        ephemeral: true
      });
      return;
    }
    
    // Customize the select menu for file upload context
    articleSelect.setCustomId('select_article_for_zip_upload');
    articleSelect.setPlaceholder('Select an article to upload zipped HTML to');
    
    // Create an action row with the article select menu
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(articleSelect);
    
    // Show the selection menu to the user
    await interaction.followUp({
      content: '**Upload Zipped HTML Content**\n\nPlease select the article you want to upload zipped HTML content for:',
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error handling writers upload option:', error);
    await interaction.followUp({
      content: 'Sorry, there was an error fetching articles. Please try again later.',
      ephemeral: true
    });
  }
}

async function handleButtonInteraction(interaction: MessageComponentInteraction) {
  try {
    // Handle Create Article button
    if (interaction.customId === 'create_article') {
      // Show the article creation modal
      const modal = new ModalBuilder()
        .setCustomId('create_article_modal')
        .setTitle('Create New Article');
        
      // Add input fields that match Airtable field names
      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')  // Maps to Airtable's "Name" field
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter article title')
        .setRequired(true)
        .setMaxLength(100);
      
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')  // Maps to Airtable's "Description" field
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter a brief description')
        .setRequired(true)
        .setMaxLength(500);
      
      const bodyInput = new TextInputBuilder()
        .setCustomId('body')
        .setLabel('Body')  // Maps to Airtable's "Body" field
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the article content')
        .setRequired(true)
        .setMaxLength(4000);
      
      const authorInput = new TextInputBuilder()
        .setCustomId('author')
        .setLabel('Author')  // Maps to Airtable's "Author" field
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter author name')
        .setRequired(true)
        .setMaxLength(100);
      
      const featuredInput = new TextInputBuilder()
        .setCustomId('featured')
        .setLabel('Featured (yes/no)')  // Maps to Airtable's "Featured" field
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
    // Writers tool - edit article option
    else if (interaction.customId === 'writers_edit') {
      await handleWritersEditOption(interaction);
    }
    // Writers tool - upload zipped HTML option
    else if (interaction.customId === 'writers_upload_zip') {
      await handleWritersUploadOption(interaction);
    }
    
    // Handle zip file upload for article
    else if (interaction.customId.startsWith('upload_zip_')) {
      // Extract article ID from the custom ID
      const fullId = interaction.customId;
      const idPart = fullId.split('_').pop() || '';
      console.log('Zip upload - full ID:', fullId);
      console.log('Zip upload - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
          ephemeral: true
        });
        return;
      }
      
      // Get the article to verify it exists and is not published
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
          content: 'This article is already published. Content uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Create a unique identifier for this upload request
      const uploadId = `zip_${articleId}_${Date.now()}`;
      
      // Tell the user to upload a zip file
      await interaction.reply({
        content: `Please upload a ZIP file containing HTML content for article **${article.title}**.\n\n**Instructions:**\n• Upload the ZIP file as an attachment to your next message in this channel\n• The ZIP should contain an index.html file as the main entry point\n• Any CSS, JS, or images in the ZIP will be extracted and the HTML content will be used\n• The upload will time out after 5 minutes if no file is received`,
        ephemeral: true
      });
      
      // Listen for messages from this user that contain attachments
      try {
        console.log(`Waiting for ZIP file upload for article ID ${articleId}`);
        
        // Set up a collector to watch for the next message from this user with an attachment
        const filter = (m: Message) => {
          const hasAttachment = m.author.id === interaction.user.id && m.attachments.size > 0;
          console.log(`Message received, user: ${m.author.tag}, has attachments: ${m.attachments.size > 0}`);
          return hasAttachment;
        };
          
        // Get the channel
        const channel = interaction.channel;
        
        // Wait for a message with an attachment
        const message = await collectImageMessage(channel, filter, 300000); // 5 minute timeout
        
        if (!message) {
          console.log('File upload timed out');
          await interaction.followUp({
            content: 'ZIP file upload timed out. Please try again when you have a file ready.',
            ephemeral: true
          });
          return;
        }
        
        // Get the first attachment
        const attachment = message.attachments.first();
        
        if (!attachment) {
          console.error('No attachment found despite collector saying there was one');
          await interaction.followUp({
            content: 'No valid attachment found. Please try again with a valid ZIP file.',
            ephemeral: true
          });
          return;
        }
        
        console.log('ZIP attachment received for article:', {
          articleId,
          fileName: attachment.name,
          contentType: attachment.contentType || 'unknown',
          size: attachment.size,
          url: attachment.url
        });
        
        // Validate the attachment is a ZIP file
        if (!attachment.name?.toLowerCase().endsWith('.zip')) {
          await interaction.followUp({
            content: 'Invalid file type. Please upload a ZIP file.',
            ephemeral: true
          });
          return;
        }
        
        // Process the ZIP attachment
        const result = await processZipFile(attachment, articleId);
        console.log('processZipFile result:', result);
        
        // Delete the uploaded message to keep the channel clean
        try {
          await message.delete();
          console.log('Deleted zip file message to keep channel clean');
        } catch (deleteError) {
          console.error('Could not delete upload message:', deleteError);
        }
        
        // Confirm the upload with the result message
        if (result.success) {
          // Create a view in dashboard button
          const viewInDashboardButton = new ButtonBuilder()
            .setLabel('View in Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
          
          const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(viewInDashboardButton);
          
          // Send confirmation message
          await interaction.followUp({
            content: `✅ **Success!** ${result.message}\n\nThe article content has been updated with the HTML from your ZIP file. You can view or further edit the article in the dashboard.`,
            components: [buttonRow],
            ephemeral: true
          });
        } else {
          // Send error message
          await interaction.followUp({
            content: `❌ **Error:** ${result.message}\n\nPlease try again with a valid ZIP file containing HTML content.`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error processing zip file upload:', error);
        await interaction.followUp({
          content: `An error occurred while processing your file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ephemeral: true
        });
      }
    }
    // Handle Instagram image upload button
    else if (interaction.customId.startsWith('upload_insta_image_')) {
      // Extract article ID from the custom ID - be careful with the exact string match
      const fullId = interaction.customId;
      const idPart = fullId.substring('upload_insta_image_'.length);
      console.log('Instagram image upload - full ID:', fullId);
      console.log('Instagram image upload - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
          ephemeral: true
        });
        return;
      }
      
      console.log('Processing Instagram image upload for article ID:', articleId);
      
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
      
      // Defer the reply since image upload may take time
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Create a button that will take the user to the article in the dashboard
        const viewInDashboardButton = new ButtonBuilder()
          .setLabel('View in Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
        
        // Create an "Upload Image" button for immediate attachment
        const uploadNowButton = new ButtonBuilder()
          .setCustomId(`upload_insta_image_now_${articleId}`)
          .setLabel('Upload Image Now')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📸');
          
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(viewInDashboardButton, uploadNowButton);
        
        await interaction.editReply({
          content: `Ready to upload an Instagram image for article **${article.title}**.\n\nYou can either:\n1. Click "Upload Image Now" and attach an image in your next message\n2. Go to the Dashboard to use the web interface\n\nUploaded images will be stored on ImgBB and linked to your article${article.source === 'airtable' ? ' and Airtable' : ''}.`,
          components: [buttonRow]
        });
        
      } catch (error) {
        console.error('Error processing Instagram image upload:', error);
        await interaction.editReply({
          content: `Error uploading image: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or use the website to upload images.`
        });
      }
    }
    // Handle Instagram image upload now button
    else if (interaction.customId.startsWith('upload_insta_image_now_')) {
      // Extract article ID from the custom ID - be careful with the exact string match
      const fullId = interaction.customId;
      const idPart = fullId.substring('upload_insta_image_now_'.length);
      console.log('Instagram image upload NOW - full ID:', fullId);
      console.log('Instagram image upload NOW - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
          ephemeral: true
        });
        return;
      }
      
      console.log('Processing Instagram image upload NOW for article ID:', articleId);
      
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
      
      // Create a unique identifier for this upload request
      const uploadId = `insta_${articleId}_${Date.now()}`;
      
      // Tell the user to upload an image
      await interaction.reply({
        content: `Please upload an image for Instagram for the article **${article.title}**. Upload it as an attachment to your next message in this channel. The upload will time out after 5 minutes if no image is received.`,
        ephemeral: true
      });
      
      // Listen for messages from this user that contain attachments
      try {
        // Set up a collector to watch for the next message from this user with an attachment
        const filter = (m: Message) => 
          m.author.id === interaction.user.id && 
          m.attachments.size > 0;
          
        // Get the channel
        const channel = interaction.channel;
        
        // Wait for a message with an attachment
        const message = await collectImageMessage(channel, filter, 300000); // 5 minute timeout
        
        if (!message) {
          await interaction.followUp({
            content: 'Image upload timed out. Please try again when you have an image ready.',
            ephemeral: true
          });
          return;
        }
        
        // Get the first attachment
        const attachment = message.attachments.first();
        
        if (!attachment) {
          await interaction.followUp({
            content: 'No valid attachment found. Please try again with a valid image file.',
            ephemeral: true
          });
          return;
        }
        
        // Process the attachment (uploads to Imgur and updates the article)
        const result = await processDiscordAttachment(attachment, articleId, 'instaPhoto');
        
        // Confirm the upload with the result message
        if (result.success) {
          // Create embed with the uploaded image
          const embed = new EmbedBuilder()
            .setTitle(`Instagram image for article "${article.title}" uploaded successfully`)
            .setDescription(result.message)
            .setImage(result.url || article.instagramImageUrl || 'https://placehold.co/600x400?text=Upload+Failed')
            .setColor('#00C4B4')
            .setTimestamp();
            
          await interaction.followUp({
            embeds: [embed],
            ephemeral: true
          });
          
          // Delete the uploaded message to keep the channel clean if we have permission
          try {
            await message.delete();
          } catch (error) {
            // Ignore errors deleting message (we might not have permission)
            console.log('Could not delete message with uploaded image:', error);
          }
        } else {
          await interaction.followUp({
            content: `Error: ${result.message}`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error handling image upload:', error);
        await interaction.followUp({
          content: `An error occurred while processing your image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ephemeral: true
        });
      }
    }
    // Handle Web image upload now button
    else if (interaction.customId.startsWith('upload_web_image_now_')) {
      // Extract article ID from the custom ID - be careful with the exact string match
      const fullId = interaction.customId;
      const idPart = fullId.split('_').pop() || '';
      console.log('Web image upload NOW - full ID:', fullId);
      console.log('Web image upload NOW - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
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
      
      // Create a unique identifier for this upload request
      const uploadId = `web_${articleId}_${Date.now()}`;
      
      // Tell the user to upload an image
      await interaction.reply({
        content: `Please upload a main web image for the article **${article.title}**. Upload it as an attachment to your next message in this channel. The upload will time out after 5 minutes if no image is received.`,
        ephemeral: true
      });
      
      // Listen for messages from this user that contain attachments
      try {
        // Set up a collector to watch for the next message from this user with an attachment
        const filter = (m: Message) => 
          m.author.id === interaction.user.id && 
          m.attachments.size > 0;
          
        // Get the channel
        const channel = interaction.channel;
        
        // Wait for a message with an attachment
        const message = await collectImageMessage(channel, filter, 300000); // 5 minute timeout
        
        if (!message) {
          await interaction.followUp({
            content: 'Image upload timed out. Please try again when you have an image ready.',
            ephemeral: true
          });
          return;
        }
        
        // Get the first attachment
        const attachment = message.attachments.first();
        
        if (!attachment) {
          await interaction.followUp({
            content: 'No valid attachment found. Please try again with a valid image file.',
            ephemeral: true
          });
          return;
        }
        
        // Process the attachment (uploads to Imgur and updates the article)
        const result = await processDiscordAttachment(attachment, articleId, 'MainImage');
        
        // Confirm the upload with the result message
        if (result.success) {
          // Create embed with the uploaded image
          const embed = new EmbedBuilder()
            .setTitle(`Main image for article "${article.title}" uploaded successfully`)
            .setDescription(result.message)
            .setImage(result.url || article.imageUrl || 'https://placehold.co/600x400?text=Upload+Failed')
            .setColor('#00C4B4')
            .setTimestamp();
            
          await interaction.followUp({
            embeds: [embed],
            ephemeral: true
          });
          
          // Delete the uploaded message to keep the channel clean if we have permission
          try {
            await message.delete();
          } catch (error) {
            // Ignore errors deleting message (we might not have permission)
            console.log('Could not delete message with uploaded image:', error);
          }
        } else {
          await interaction.followUp({
            content: `Error: ${result.message}`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error handling image upload:', error);
        await interaction.followUp({
          content: `An error occurred while processing your image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ephemeral: true
        });
      }
    }
    // Handle content file upload button
    else if (interaction.customId.startsWith('upload_content_')) {
      // Extract article ID from the custom ID
      const fullId = interaction.customId;
      const idPart = fullId.split('_').pop() || '';
      console.log('Content upload - full ID:', fullId);
      console.log('Content upload - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
          ephemeral: true
        });
        return;
      }
      
      console.log('Processing content upload for article ID:', articleId);
      
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
          content: 'This article is already published. Content uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Defer the reply since file processing may take time
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Create a button that will take the user to the article in the dashboard
        const viewInDashboardButton = new ButtonBuilder()
          .setLabel('View in Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
        
        // Create an "Upload Content" button for immediate attachment
        const uploadNowButton = new ButtonBuilder()
          .setCustomId(`upload_content_now_${articleId}`)
          .setLabel('Upload Content Now')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📄');
          
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(viewInDashboardButton, uploadNowButton);
        
        await interaction.editReply({
          content: `Ready to upload HTML/RTF content for article **${article.title}**.\n\nYou can either:\n1. Click "Upload Content Now" and attach an HTML or RTF file in your next message\n2. Go to the Dashboard to use the web interface\n\nUploaded content will be stored and linked to your article.`,
          components: [buttonRow]
        });
        
      } catch (error) {
        console.error('Error processing content upload:', error);
        await interaction.editReply({
          content: `Error preparing content upload: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or use the website to upload content.`
        });
      }
    }
    // Handle immediate content file upload
    else if (interaction.customId.startsWith('upload_content_now_')) {
      // Extract article ID from the custom ID
      const fullId = interaction.customId;
      // Extract just the numeric part (articleId) - content IDs are formatted as upload_content_now_142
      // Need to handle potential issue where the prefix isn't properly removed
      const idPart = fullId.split('_').pop() || '';
      console.log('Content upload NOW - full ID:', fullId);
      console.log('Content upload NOW - extracted ID part:', idPart);
      console.log('Content upload NOW - all parts:', fullId.split('_'));
      
      // Make sure we're extracting the ID correctly
      const lastPart = fullId.substring(fullId.lastIndexOf('_') + 1);
      console.log('Content upload NOW - last part using substring:', lastPart);
      
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
          ephemeral: true
        });
        return;
      }
      
      console.log('Processing content upload NOW for article ID:', articleId);
      
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
          content: 'This article is already published. Content uploads through the bot are only allowed for draft or pending articles.',
          ephemeral: true
        });
        return;
      }
      
      // Create a unique identifier for this upload request
      const uploadId = `content_${articleId}_${Date.now()}`;
      
      // Tell the user to upload a file with clear instructions for plaintext
      await interaction.reply({
        content: `Please upload an HTML, RTF, or plain text (.txt) file for the article **${article.title}**.\n\n**Instructions:**\n• Upload the file as an attachment to your next message in this channel\n• For plain text (.txt) files, make sure they have the .txt extension\n• Text files will be formatted properly when displayed on the website\n• The upload will time out after 5 minutes if no file is received`,
        ephemeral: true
      });
      
      // Listen for messages from this user that contain attachments
      try {
        console.log(`Waiting for content file upload for article ID ${articleId}`);
        
        // Set up a collector to watch for the next message from this user with an attachment
        const filter = (m: Message) => {
          const hasAttachment = m.author.id === interaction.user.id && m.attachments.size > 0;
          console.log(`Message received, user: ${m.author.tag}, has attachments: ${m.attachments.size > 0}`);
          return hasAttachment;
        };
          
        // Get the channel
        const channel = interaction.channel;
        
        // Wait for a message with an attachment
        const message = await collectImageMessage(channel, filter, 300000); // 5 minute timeout
        
        if (!message) {
          console.log('File upload timed out');
          await interaction.followUp({
            content: 'File upload timed out. Please try again when you have a file ready.',
            ephemeral: true
          });
          return;
        }
        
        // Get the first attachment
        const attachment = message.attachments.first();
        
        if (!attachment) {
          console.error('No attachment found despite collector saying there was one');
          await interaction.followUp({
            content: 'No valid attachment found. Please try again with a valid HTML, RTF, or plain text (.txt) file.',
            ephemeral: true
          });
          return;
        }
        
        console.log('File attachment received for article:', {
          articleId,
          fileName: attachment.name,
          contentType: attachment.contentType || 'unknown',
          size: attachment.size,
          url: attachment.url
        });
        
        // Specifically check for .txt files to add extra logging
        if (attachment.name?.toLowerCase().endsWith('.txt')) {
          console.log('TXT FILE DETECTED! Will process as plaintext and convert to HTML for display.');
        }
        
        // Process the attachment
        const result = await processContentFile(attachment, articleId);
        console.log('processContentFile result:', result);
        
        // Delete the uploaded message to keep the channel clean
        try {
          await message.delete();
          console.log('Deleted content file message to keep channel clean');
        } catch (deleteError) {
          console.error('Could not delete upload message:', deleteError);
        }
        
        // Confirm the upload with the result message
        if (result.success) {
          // Create a view in dashboard button
          const viewInDashboardButton = new ButtonBuilder()
            .setLabel('View in Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
          
          const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(viewInDashboardButton);
          
          // Send confirmation message
          await interaction.followUp({
            content: `✅ **Success!** ${result.message}\n\nThe article content has been updated. You can view or further edit the article in the dashboard.`,
            components: [buttonRow],
            ephemeral: true
          });
        } else {
          // Send error message
          await interaction.followUp({
            content: `❌ **Error:** ${result.message}\n\nPlease try again with a valid HTML, RTF, or plain text (.txt) file.`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error processing content file upload:', error);
        await interaction.followUp({
          content: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or use the website to upload content.`,
          ephemeral: true
        });
      }
    }
    else if (interaction.customId.startsWith('upload_web_image_')) {
      // Extract article ID from the custom ID - be careful with the exact string match
      const fullId = interaction.customId;
      const idPart = fullId.split('_').pop() || '';
      console.log('Web image upload - full ID:', fullId);
      console.log('Web image upload - extracted ID part:', idPart);
      const articleId = parseInt(idPart, 10);
      
      if (isNaN(articleId)) {
        await interaction.reply({
          content: `Invalid article ID: "${idPart}" from "${fullId}". Please try again.`,
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
      
      // Defer the reply since image upload may take time
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Create a button that will take the user to the article in the dashboard
        const viewInDashboardButton = new ButtonBuilder()
          .setLabel('View in Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
        
        // Create an "Upload Image" button for immediate attachment
        const uploadNowButton = new ButtonBuilder()
          .setCustomId(`upload_web_image_now_${articleId}`)
          .setLabel('Upload Image Now')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🖼️');
          
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(viewInDashboardButton, uploadNowButton);
        
        await interaction.editReply({
          content: `Ready to upload a web (main) image for article **${article.title}**.\n\nYou can either:\n1. Click "Upload Image Now" and attach an image in your next message\n2. Go to the Dashboard to use the web interface\n\nUploaded images will be stored on ImgBB and linked to your article${article.source === 'airtable' ? ' and Airtable' : ''}.`,
          components: [buttonRow]
        });
        
      } catch (error) {
        console.error('Error processing web image upload:', error);
        await interaction.editReply({
          content: `Error uploading image: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or use the website to upload images.`
        });
      }
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
    .setName('list_articles')
    .setDescription('List articles that have not been published yet'),
  
  new SlashCommandBuilder()
    .setName('create_article')
    .setDescription('Create a new article draft'),
    
  new SlashCommandBuilder()
    .setName('writers')
    .setDescription('Writer tools: edit or upload articles'),
    
  new SlashCommandBuilder()
    .setName('insta')
    .setDescription('Upload an Instagram image to an unpublished article'),
    
  new SlashCommandBuilder()
    .setName('web')
    .setDescription('Upload a web (main) image to an unpublished article'),
    
  new SlashCommandBuilder()
    .setName('upload_content')
    .setDescription('Upload an HTML, RTF, or plain text (.txt) file as article content')
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

    // Create a new client with required intents for image upload
    // Note: MessageContent is a privileged intent and must be enabled in the Discord Developer Portal
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent // Required for reading message attachments
      ]
    });

    // Register event handlers
    client.once(Events.ClientReady, c => {
      botStatus = {
        connected: true,
        status: 'Connected and ready',
        username: c.user.username,
        id: c.user.id,
        guilds: c.guilds.cache.size,
        guildsList: [],
        webhooks: []
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
        } else if (interaction.isStringSelectMenu()) {
          // Handle string select menu interactions
          await handleStringSelectMenuInteraction(interaction);
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
          
          // List articles command
          else if (interaction.commandName === 'list_articles') {
            await handleListArticlesCommand(interaction);
          }
          
          // Create article command
          else if (interaction.commandName === 'create_article') {
            await handleCreateArticleCommand(interaction);
          }
          
          // Writers command - combined edit/upload functionality
          else if (interaction.commandName === 'writers') {
            await handleWritersCommand(interaction);
          }
          
          // Instagram image upload command
          else if (interaction.commandName === 'insta') {
            await handleInstaImageCommand(interaction);
          }
          
          // Web (Main) image upload command
          else if (interaction.commandName === 'web') {
            await handleWebImageCommand(interaction);
          }
          
          // Upload HTML/RTF content command
          else if (interaction.commandName === 'upload_content') {
            await handleContentUploadCommand(interaction);
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
      guilds: 0,
      guildsList: [],
      webhooks: []
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
      guilds: 0,
      guildsList: [],
      webhooks: []
    };
    
    return { success: true, message: 'Bot stopped successfully' };
  } catch (error) {
    console.error('Error stopping Discord bot:', error);
    return { success: false, message: 'Failed to stop bot', error };
  }
};

/**
 * Get the Discord bot status with detailed guild and webhook information
 */
export const getDiscordBotStatus = async () => {
  if (client) {
    // Update the connected status based on client's readiness
    botStatus.connected = client.isReady();
    
    // Update guild count and list if connected
    if (client.isReady()) {
      botStatus.guilds = client.guilds.cache.size;
      
      // Get detailed information about each guild
      botStatus.guildsList = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        icon: guild.iconURL() || undefined,
        owner: guild.members.me?.permissions.has('Administrator') || false
      }));
      
      // Get webhook information from each guild where bot has necessary permissions
      botStatus.webhooks = [];
      
      // Fetch webhooks from each guild if bot has permission
      const webhookPromises = client.guilds.cache.map(async (guild) => {
        // Check if bot has permission to manage webhooks in this guild
        if (guild.members.me?.permissions.has('ManageWebhooks')) {
          try {
            const guildWebhooks = await guild.fetchWebhooks();
            
            // Map to our webhook info format
            const webhookInfos = guildWebhooks.map(webhook => {
              if (webhook.type === 1) { // Only include standard webhooks
                return {
                  id: webhook.id,
                  name: webhook.name,
                  channelId: webhook.channelId,
                  channelName: guild.channels.cache.get(webhook.channelId)?.name || 'unknown',
                  guildId: guild.id,
                  guildName: guild.name
                };
              }
              return null;
            }).filter(Boolean) as WebhookInfo[];
            
            return webhookInfos;
          } catch (error) {
            console.error(`Error fetching webhooks for guild ${guild.name} (${guild.id}):`, error);
            return [];
          }
        }
        return [];
      });
      
      // Wait for all webhook fetch operations to complete
      const webhookResults = await Promise.all(webhookPromises);
      botStatus.webhooks = webhookResults.flat();
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
 * Send a message to a specific channel in a Discord server
 * @param guildId The ID of the Discord server (guild)
 * @param channelId The ID of the channel to send the message to
 * @param message The message content to send
 * @returns Success status and message details or error
 */
export async function sendMessageToChannel(guildId: string, channelId: string, message: string): Promise<{ success: boolean; message: string; error?: any }> {
  try {
    if (!client || !client.isReady()) {
      return { success: false, message: 'Bot is not connected. Please start the bot first.' };
    }
    
    // Try to get the guild (server)
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, message: `Could not find server with ID ${guildId}. The bot might not be a member of this server.` };
    }
    
    // Try to get the channel
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return { success: false, message: `Could not find channel with ID ${channelId} in server ${guild.name}.` };
    }
    
    // Make sure the channel is a text channel
    if (!channel.isTextBased()) {
      return { success: false, message: `Channel ${channel.name} is not a text channel.` };
    }
    
    // Send the message
    const textChannel = channel as TextChannel;
    await textChannel.send(message);
    
    return { 
      success: true, 
      message: `Message sent successfully to #${textChannel.name} in ${guild.name}.` 
    };
  } catch (error) {
    console.error('Error sending message to Discord channel:', error);
    return { 
      success: false, 
      message: 'Failed to send message to Discord channel.', 
      error 
    };
  }
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
  app.get("/api/discord/bot/status", async (req: Request, res: Response) => {
    try {
      const status = await getDiscordBotStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting Discord bot status:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while getting Discord bot status' 
      });
    }
  });
  
  // Get detailed information about Discord servers (guilds)
  app.get("/api/discord/bot/servers", async (req: Request, res: Response) => {
    try {
      const status = await getDiscordBotStatus();
      
      res.json({
        guilds: status.guildsList,
        webhooks: status.webhooks
      });
    } catch (error) {
      console.error('Error getting Discord server information:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while getting Discord server information' 
      });
    }
  });
  
  // Get OAuth URL for adding the bot to a server
  app.get("/api/discord/bot/invite-url", async (req: Request, res: Response) => {
    try {
      const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
      
      if (!clientIdSetting || !clientIdSetting.value) {
        return res.status(400).json({
          success: false,
          message: 'Discord client ID not configured'
        });
      }
      
      // Calculate the permissions needed by the bot
      // Using the Discord permission calculator values:
      // - View Channels: 1024
      // - Send Messages: 2048
      // - Manage Webhooks: 536870912
      // - Read Message History: 65536
      // Summing these gives the permission integer: 536939520
      const permissions = 536939520;
      
      // Create the OAuth URL with the necessary scopes (bot and applications.commands)
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientIdSetting.value}&permissions=${permissions}&scope=bot%20applications.commands`;
      
      res.json({
        success: true,
        invite_url: inviteUrl
      });
    } catch (error) {
      console.error('Error generating Discord bot invite URL:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while generating the Discord bot invite URL' 
      });
    }
  });
  
  // Send a message to a specific channel in a Discord server
  app.post("/api/discord/bot/send-channel-message", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { guildId, channelId, message } = req.body;
      
      if (!guildId || !channelId || !message) {
        return res.status(400).json({
          success: false, 
          message: 'Server ID, channel ID, and message content are required'
        });
      }
      
      const result = await sendMessageToChannel(guildId, channelId, message);
      
      if (result.success) {
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "send_channel_message",
          resourceType: "discord_channel",
          resourceId: channelId,
          details: { 
            guildId,
            channelId,
            messageContent: message.substring(0, 100) + (message.length > 100 ? '...' : '') // Log a truncated version
          }
        });
        
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error sending message to Discord channel:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while sending message to Discord channel',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get available channels in a server where webhooks can be created
  app.get("/api/discord/bot/server/:serverId/channels", async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      
      if (!client || !client.isReady()) {
        return res.status(400).json({
          success: false,
          message: 'Discord bot is not connected'
        });
      }
      
      // Try to fetch the guild
      const guild = client.guilds.cache.get(serverId);
      if (!guild) {
        return res.status(404).json({
          success: false,
          message: 'Server not found or bot does not have access'
        });
      }
      
      // Check if the bot has permissions to manage webhooks in this guild
      if (!guild.members.me || !guild.members.me.permissions.has('ManageWebhooks')) {
        return res.status(403).json({
          success: false,
          message: 'Bot does not have permission to manage webhooks in this server'
        });
      }
      
      // Get all text channels where webhooks can be created
      // Filter for only text channels where the bot has VIEW_CHANNEL permission
      const channels = guild.channels.cache
        .filter(channel => 
          channel.type === 0 && // 0 is GUILD_TEXT
          guild.members.me && channel.permissionsFor(guild.members.me)?.has(['ViewChannel', 'ManageWebhooks'])
        )
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: 'text'
        }));
      
      res.json({
        success: true,
        serverId: guild.id,
        serverName: guild.name,
        channels
      });
    } catch (error) {
      console.error('Error getting server channels:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while fetching server channels' 
      });
    }
  });
  
  // Create a new webhook in a server channel
  app.post("/api/discord/bot/webhook", async (req: Request, res: Response) => {
    try {
      const { serverId, channelId, name, avatarUrl } = req.body;
      
      // Validate required fields
      if (!serverId || !channelId || !name) {
        return res.status(400).json({
          success: false,
          message: 'Server ID, channel ID, and webhook name are required'
        });
      }
      
      if (!client || !client.isReady()) {
        return res.status(400).json({
          success: false,
          message: 'Discord bot is not connected'
        });
      }
      
      // Try to fetch the guild
      const guild = client.guilds.cache.get(serverId);
      if (!guild) {
        return res.status(404).json({
          success: false,
          message: 'Server not found or bot does not have access'
        });
      }
      
      // Try to fetch the channel
      const channel = guild.channels.cache.get(channelId);
      if (!channel || channel.type !== 0) { // 0 is GUILD_TEXT
        return res.status(404).json({
          success: false,
          message: 'Channel not found or not a text channel'
        });
      }
      
      // Check if the bot has permissions to manage webhooks in this channel
      if (!guild.members.me || !channel.permissionsFor(guild.members.me)?.has('ManageWebhooks')) {
        return res.status(403).json({
          success: false,
          message: 'Bot does not have permission to manage webhooks in this channel'
        });
      }
      
      // Create the webhook
      const webhook = await (channel as any).createWebhook({
        name,
        avatar: avatarUrl // Optional, will use default if not provided
      });
      
      res.status(201).json({
        success: true,
        webhook: {
          id: webhook.id,
          name: webhook.name,
          token: webhook.token,
          url: webhook.url,
          channelId: webhook.channelId,
          channelName: channel.name,
          guildId: guild.id,
          guildName: guild.name
        }
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while creating the webhook',
        error: error instanceof Error ? error.message : 'Unknown error'
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
      
      // Create article data - map to fields in our system
      // Note: These field names map to Airtable fields through the website
      const articleData: InsertArticle = {
        title,                    // Maps to Airtable's "Name" field
        description: description || '',   // Maps to Airtable's "Description" field
        content,                  // Maps to Airtable's "Body" field
        author: author || 'Discord User', // Maps to Airtable's "Author" field
        featured: featured ? 'yes' : 'no', // Maps to Airtable's "Featured" field (as string)
        status: 'draft',          // Article status in our system
        imageUrl: 'https://placehold.co/600x400?text=No+Image', // Default placeholder
        imageType: 'url',         // Specifies that we're using a URL, not a file
        contentFormat: 'plaintext', // Format of the content
        source: 'discord',        // Identifies the article as coming from Discord
        externalId: `discord-api-${Date.now()}`, // Unique ID for tracking
      };
      
      // Create the article through our website's storage system
      // This doesn't directly modify Airtable - that sync happens through the website
      const article = await storage.createArticle(articleData);
      
      res.status(201).json({
        success: true,
        message: 'Article created successfully in the website database',
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
 * Helper function to create a type-safe message collector
 * Used by both /insta and /web commands to collect image messages
 */
async function collectImageMessage(channel: any, filter: (m: any) => boolean, timeoutMs: number = 300000): Promise<any | null> {
  console.log('==== collectImageMessage STARTED ====');
  console.log('Waiting for message with attachment, timeout:', timeoutMs, 'ms');
  
  // Create a collector that will listen for messages meeting the filter criteria
  const collector = channel.createMessageCollector({
    filter,
    max: 1,
    time: timeoutMs
  });
  
  // Return a promise that resolves when a message is collected or timeout occurs
  return new Promise<any | null>(resolve => {
    collector.on('collect', (message: any) => {
      console.log('Message collected from user:', message.author.tag);
      console.log('Message has attachments:', message.attachments.size);
      
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        console.log('Attachment details:', {
          name: attachment.name,
          contentType: attachment.contentType || 'unknown',
          size: attachment.size,
          url: attachment.url
        });
        
        // Special logging for text files to help debug issues
        if (attachment.name && attachment.name.toLowerCase().endsWith('.txt')) {
          console.log('TXT FILE DETECTED - will use special handling during processing');
          
          // Extra validation to ensure the attachment URL is accessible
          if (!attachment.url) {
            console.error('ERROR: Missing attachment URL for text file!');
          }
        }
      } else {
        console.warn('Warning: Message has no attachments but passed the filter');
      }
      
      resolve(message);
      collector.stop();
    });
    
    collector.on('end', (collected: any) => {
      console.log('Message collector ended. Collected messages:', collected.size);
      if (collected.size === 0) {
        console.log('No messages collected within timeout period, returning null');
        resolve(null);
      }
      console.log('==== collectImageMessage ENDED ====');
    });
  });
}

/**
 * Function to process image attachments from Discord and upload to Imgur/Airtable
 * @param attachment Discord attachment
 * @param articleId The ID of the article to attach the image to
 * @param fieldName The field in Airtable to attach the image to ('MainImage' or 'instaPhoto')
 * @returns Object with success status and result information
 */
/**
 * Process content file upload from Discord
 * @param attachment Discord attachment containing HTML, RTF, or plaintext (.txt) content
 * @param articleId The ID of the article to update
 * @returns Status of the operation with a message
 */
async function processContentFile(
  attachment: any,
  articleId: number
): Promise<{ success: boolean; message: string; content?: string }> {
  try {
    console.log('==== processContentFile STARTED ====');
    console.log('Attachment details:', {
      name: attachment.name,
      contentType: attachment.contentType,
      url: attachment.url,
      size: attachment.size
    });
    console.log('Processing for article ID:', articleId);
    
    // Validate the attachment is an HTML, RTF, or TXT file
    const validContentTypes = ['text/html', 'text/rtf', 'application/rtf', 'text/plain'];
    const validExtensions = ['.html', '.rtf', '.txt'];
    
    // Check if content type is valid or filename has valid extension
    const hasValidContentType = attachment.contentType && validContentTypes.includes(attachment.contentType);
    const hasValidExtension = validExtensions.some(ext => attachment.name.toLowerCase().endsWith(ext));
    
    console.log('Validation results:', {
      hasValidContentType,
      hasValidExtension,
      contentType: attachment.contentType || 'unknown'
    });
    
    if (!hasValidContentType && !hasValidExtension) {
      console.log('Invalid file type rejected');
      return {
        success: false,
        message: `Invalid file type. Please upload an HTML, RTF, or TXT file. Received: ${attachment.contentType || 'unknown'} with filename ${attachment.name}`
      };
    }
    
    // Get the article from storage
    const article = await storage.getArticle(articleId);
    
    if (!article) {
      console.error(`Article ID ${articleId} not found in database.`);
      return {
        success: false,
        message: `Article with ID ${articleId} not found.`
      };
    }
    
    console.log(`Processing content file for article: "${article.title}" (ID: ${articleId}), file: ${attachment.name}`);
    
    // STEP 1: Download the file content from Discord's CDN
    console.log('STEP 1: Downloading file from Discord CDN:', attachment.url);
    
    let fileContent = "";
    
    try {
      const response = await fetch(attachment.url);
      
      if (!response.ok) {
        console.error('Failed to download file from Discord, status:', response.status);
        return {
          success: false,
          message: `Failed to download file from Discord. Status: ${response.status}`
        };
      }
      
      console.log('Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });
      
      // Get raw file content as ArrayBuffer for better handling of binary data
      const buffer = await response.arrayBuffer();
      
      if (!buffer || buffer.byteLength === 0) {
        console.error('Downloaded buffer is empty!');
        return {
          success: false,
          message: 'Downloaded file appears to be empty. Please check the file and try again.'
        };
      }
      
      console.log('Downloaded file as buffer, size:', buffer.byteLength, 'bytes');
      
      // Convert buffer to text
      const decoder = new TextDecoder('utf-8');
      fileContent = decoder.decode(buffer);
      
      if (!fileContent || fileContent.length === 0) {
        console.error('Decoded text content is empty!');
        return {
          success: false,
          message: 'File content is empty after decoding. Please try a different file.'
        };
      }
      
      console.log('Successfully decoded to text, content length:', fileContent.length, 'characters');
      console.log('Content preview:', fileContent.substring(0, 100).replace(/\n/g, '\\n'));
      
    } catch (error) {
      console.error('Error downloading file from Discord:', error);
      return {
        success: false,
        message: `Error fetching file: ${error instanceof Error ? error.message : 'Unknown download error'}`
      };
    }
    
    // STEP 2: Determine the content format based on file extension
    console.log('STEP 2: Determining content format');
    
    let contentFormat = 'plaintext'; // Default format
    
    // Set content format based on file extension
    if (attachment.name.toLowerCase().endsWith('.html') || attachment.contentType === 'text/html') {
      contentFormat = 'html';
      console.log('Detected HTML format');
    } else if (attachment.name.toLowerCase().endsWith('.rtf') || 
               attachment.contentType === 'text/rtf' || 
               attachment.contentType === 'application/rtf') {
      contentFormat = 'rtf';
      console.log('Detected RTF format');
    } else if (attachment.name.toLowerCase().endsWith('.txt') || 
               attachment.contentType === 'text/plain') {
      contentFormat = 'plaintext';
      console.log('Detected plaintext format');
      
      // Check for potential truncation issues
      if (fileContent.length < 10 && attachment.size > 100) {
        console.warn('WARNING: Content appears truncated! Attachment size vs. content length mismatch.');
      }
    }
    
    console.log(`Content will be saved with format '${contentFormat}'`);
    
    // STEP 3: Update the article content in database
    console.log('STEP 3: Updating article in database');
    
    // Create the update data object
    const updateData: Partial<Article> = {
      content: fileContent,
      contentFormat: contentFormat
    };
    
    // Special handling for .txt files to ensure they're always marked as plaintext
    if (attachment.name.toLowerCase().endsWith('.txt')) {
      console.log('TXT file detected - forcing contentFormat to "plaintext"');
      updateData.contentFormat = 'plaintext';
    }
    
    // Update the article
    console.log('Updating article with new content...');
    const updatedArticle = await storage.updateArticle(articleId, updateData);
    
    if (!updatedArticle) {
      console.error('Failed to update article content in database');
      return {
        success: false,
        message: 'Failed to update article with the new content. Database error.'
      };
    }
    
    console.log('Article successfully updated:',  {
      id: updatedArticle.id,
      title: updatedArticle.title,
      contentFormat: updatedArticle.contentFormat,
      contentLength: updatedArticle.content?.length || 0
    });
    
    // STEP 4: For Airtable articles, sync content to Airtable
    if (article.source === 'airtable' && article.externalId) {
      console.log('STEP 4: Syncing content to Airtable');
      
      try {
        // Get Airtable settings
        const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
        const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
        const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
        
        if (apiKeySetting?.value && baseIdSetting?.value && tableNameSetting?.value && 
            apiKeySetting.enabled && baseIdSetting.enabled && tableNameSetting.enabled) {
          
          const apiKey = apiKeySetting.value;
          const baseId = baseIdSetting.value;
          const tableName = tableNameSetting.value;
          
          console.log(`Syncing content to Airtable record: ${article.externalId}`);
          
          // Update just the Body field in Airtable
          const airtableResponse = await fetch(`https://api.airtable.com/v0/${baseId}/${tableName}/${article.externalId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                Body: fileContent,
                _updatedTime: new Date().toISOString()
              }
            })
          });
          
          if (!airtableResponse.ok) {
            const errorText = await airtableResponse.text();
            console.error('Error syncing to Airtable:', errorText);
          } else {
            console.log('Successfully synced content to Airtable');
          }
        } else {
          console.log('Airtable settings unavailable or disabled, skipping sync');
        }
      } catch (error) {
        console.error('Error syncing content to Airtable:', error);
        // Don't fail the whole operation if Airtable sync fails
      }
    }
    
    console.log('==== processContentFile COMPLETED SUCCESSFULLY ====');
    
    return {
      success: true,
      message: `Content from ${attachment.name} successfully uploaded and set as the article content.`,
      content: fileContent
    };
  } catch (error) {
    console.error('==== processContentFile ERROR ====', error);
    return {
      success: false,
      message: `Error processing content file: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function processDiscordAttachment(
  attachment: any,
  articleId: number,
  fieldName: 'MainImage' | 'instaPhoto'
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    // Validate the attachment is an image
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!attachment.contentType || !validImageTypes.includes(attachment.contentType)) {
      return {
        success: false,
        message: 'Invalid file type. Please upload a JPEG, PNG, GIF or WebP image.'
      };
    }
    
    // Check file size - Discord limit is 25MB but we'll limit to 10MB
    if (attachment.size > 10 * 1024 * 1024) {
      return {
        success: false,
        message: 'Image file is too large. Maximum allowed size is 10MB.'
      };
    }
    
    // Get the article
    const article = await storage.getArticle(articleId);
    if (!article) {
      console.error(`Article with ID ${articleId} not found in processDiscordAttachment.`);
      return {
        success: false,
        message: `Article with ID ${articleId} not found.`
      };
    }
    
    console.log(`Processing Discord attachment for article ID ${articleId}, title "${article.title}", field ${fieldName}`);
    
    // Upload directly to Imgur using the URL from Discord
    const imgurResult = await uploadImageUrlToImgBB(
      attachment.url,
      attachment.name || `discord_upload_${Date.now()}.jpg`
    );
    
    if (!imgurResult) {
      return {
        success: false,
        message: 'Failed to upload image to ImgBB.'
      };
    }
    
    // For Airtable articles, upload to Airtable as well
    let airtableResult = null;
    if (article.source === 'airtable' && article.externalId) {
      airtableResult = await uploadImageUrlToAirtable(
        imgurResult.url,
        article.externalId,
        fieldName,
        attachment.name || `discord_upload_${Date.now()}.jpg`
      );
      
      if (!airtableResult) {
        return {
          success: true,
          message: `Image uploaded to ImgBB (${imgurResult.url}) but failed to attach to Airtable record. The article will be updated with the ImgBB URL.`,
          url: imgurResult.url
        };
      }
    }
    
    // Update the article in our database
    const updateData: Partial<Article> = {};
    
    if (fieldName === 'MainImage') {
      updateData.imageUrl = imgurResult.url;
      console.log(`Updating article ${articleId} with MainImage URL: ${imgurResult.url}`);
    } else if (fieldName === 'instaPhoto') {
      updateData.instagramImageUrl = imgurResult.url;
      console.log(`Updating article ${articleId} with Instagram image URL: ${imgurResult.url}`);
    }
    
    // Update the article
    const updatedArticle = await storage.updateArticle(articleId, updateData);
    console.log('Article update result:', updatedArticle ? 'Success' : 'Failed');
    
    return {
      success: true,
      message: airtableResult 
        ? `Image uploaded successfully to ImgBB and Airtable for field ${fieldName}.` 
        : `Image uploaded successfully to ImgBB for field ${fieldName}.`,
      url: imgurResult.url
    };
  } catch (error) {
    console.error('Error processing Discord attachment:', error);
    return {
      success: false,
      message: `Error processing image: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Handler for the /insta command
 * Allows users to select an unpublished article and upload an Instagram image to it
 */
async function handleInstaImageCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articles = await storage.getArticles();
    const unpublishedArticles = articles.filter(article => 
      article.status !== 'published'
    );
    
    if (unpublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found to upload images to. Create a new article using `/create_article` or use the website to create draft articles first.');
      return;
    }
    
    // Create a select menu for article selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_article_for_insta_image')
      .setPlaceholder('Select an article to add Instagram image')
      .addOptions(
        unpublishedArticles.slice(0, 25).map(article => ({
          label: article.title.substring(0, 100), // Max 100 chars for option label
          description: `Status: ${article.status} | ID: ${article.id}`,
          value: article.id.toString()
        }))
      );
    
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    // Show the selection menu to the user
    await interaction.editReply({
      content: 'Please select an article to upload an Instagram image to.',
      components: [row]
    });
    
    // We'll handle the selection in the handleStringSelectMenuInteraction function
    // which will check for the 'select_article_for_insta_image' custom ID
  } catch (error) {
    console.error('Error handling Instagram image command:', error);
    await interaction.editReply('Sorry, there was an error preparing the image upload. Please try again later.');
  }
}

/**
 * Handler for the /web command
 * Allows users to select an unpublished article and upload a main web image to it
 */
async function handleWebImageCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articles = await storage.getArticles();
    const unpublishedArticles = articles.filter(article => 
      article.status !== 'published'
    );
    
    if (unpublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found to upload images to. Create a new article using `/create_article` or use the website to create draft articles first.');
      return;
    }
    
    // Create a select menu for article selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_article_for_web_image')
      .setPlaceholder('Select an article to add web image')
      .addOptions(
        unpublishedArticles.slice(0, 25).map(article => ({
          label: article.title.substring(0, 100), // Max 100 chars for option label
          description: `Status: ${article.status} | ID: ${article.id}`,
          value: article.id.toString()
        }))
      );
    
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    // Show the selection menu to the user
    await interaction.editReply({
      content: 'Please select an article to upload a web (main) image to.',
      components: [row]
    });
    
    // We'll handle the selection in the handleStringSelectMenuInteraction function
    // which will check for the 'select_article_for_web_image' custom ID
  } catch (error) {
    console.error('Error handling web image command:', error);
    await interaction.editReply('Sorry, there was an error preparing the image upload. Please try again later.');
  }
}

/**
 * Handler for the /upload_content command
 * Allows users to select an unpublished article and upload an HTML or RTF file
 * to be used as the article content
 */
async function handleContentUploadCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articles = await storage.getArticles();
    const unpublishedArticles = articles.filter(article => 
      article.status !== 'published'
    );
    
    if (unpublishedArticles.length === 0) {
      await interaction.editReply('No unpublished articles found to upload content to. Create a new article using `/create_article` or use the website to create draft articles first.');
      return;
    }
    
    // Create a select menu for article selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_article_for_content_upload')
      .setPlaceholder('Select an article to upload content')
      .addOptions(
        unpublishedArticles.slice(0, 25).map(article => ({
          label: article.title.substring(0, 100), // Max 100 chars for option label
          description: `Status: ${article.status} | ID: ${article.id}`,
          value: article.id.toString()
        }))
      );
    
    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    // Show the selection menu to the user
    await interaction.editReply({
      content: 'Please select an article to upload HTML, RTF, or plain text (.txt) content to. After selecting, you will be prompted to upload the file.',
      components: [row]
    });
    
    // We'll handle the selection in the handleStringSelectMenuInteraction function
    // which will check for the 'select_article_for_content_upload' custom ID
  } catch (error) {
    console.error('Error handling content upload command:', error);
    await interaction.editReply('Sorry, there was an error preparing the content upload. Please try again later.');
  }
}

/**
 * Auto-start the Discord bot if settings are available
 */
/**
 * Process a zip file attachment from Discord and extract HTML content
 * @param attachment Discord attachment containing a zip file
 * @param articleId The ID of the article to update
 * @returns Status of the operation with a message
 */
async function processZipFile(
  attachment: any,
  articleId: number
): Promise<{ success: boolean; message: string; content?: string }> {
  try {
    console.log('==== processZipFile STARTED ====');
    console.log('Attachment details:', {
      name: attachment.name,
      contentType: attachment.contentType,
      url: attachment.url,
      size: attachment.size
    });
    console.log('Processing for article ID:', articleId);
    
    // Validate the attachment is a ZIP file
    if (!attachment.name.toLowerCase().endsWith('.zip')) {
      return {
        success: false,
        message: `Invalid file type. Please upload a ZIP file. Received file: ${attachment.name}`
      };
    }
    
    // Get the article from storage
    const article = await storage.getArticle(articleId);
    
    if (!article) {
      console.error(`Article ID ${articleId} not found in database.`);
      return {
        success: false,
        message: `Article with ID ${articleId} not found.`
      };
    }
    
    console.log(`Processing zip file for article: "${article.title}" (ID: ${articleId}), file: ${attachment.name}`);
    
    // STEP 1: Download the ZIP file from Discord's CDN
    console.log('STEP 1: Downloading ZIP file from Discord CDN:', attachment.url);
    
    try {
      const response = await fetch(attachment.url);
      
      if (!response.ok) {
        console.error('Failed to download file from Discord, status:', response.status);
        return {
          success: false,
          message: `Failed to download ZIP file from Discord. Status: ${response.status}`
        };
      }
      
      // Get ZIP file content as ArrayBuffer
      const buffer = await response.arrayBuffer();
      
      if (!buffer || buffer.byteLength === 0) {
        console.error('Downloaded ZIP buffer is empty!');
        return {
          success: false,
          message: 'Downloaded ZIP file appears to be empty. Please check the file and try again.'
        };
      }
      
      console.log('Downloaded ZIP file, size:', buffer.byteLength, 'bytes');
      
      // STEP 2: Create a temporary directory to extract the ZIP
      const tempDir = path.join(process.cwd(), 'temp', `article_${articleId}_${Date.now()}`);
      console.log('STEP 2: Creating temporary directory:', tempDir);
      
      // Create the directory
      await fs.ensureDir(tempDir);
      
      // STEP 3: Create a temporary file for the ZIP content
      const zipPath = path.join(tempDir, 'content.zip');
      console.log('STEP 3: Creating temporary ZIP file:', zipPath);
      
      // Write the ZIP content to a file
      await fs.writeFile(zipPath, Buffer.from(buffer));
      
      // STEP 4: Extract the ZIP file
      console.log('STEP 4: Extracting ZIP file to temporary directory');
      await extract(zipPath, { dir: tempDir });
      
      // STEP 5: Look for HTML files, prioritizing index.html
      console.log('STEP 5: Looking for HTML files in extracted content');
      const files = await fs.readdir(tempDir);
      
      let mainHtmlFile = '';
      let htmlContent = '';
      
      // First, look for index.html
      if (files.includes('index.html')) {
        mainHtmlFile = 'index.html';
        htmlContent = await fs.readFile(path.join(tempDir, mainHtmlFile), 'utf8');
      } 
      // If no index.html, look for any HTML file
      else {
        const htmlFiles = files.filter(file => file.endsWith('.html') || file.endsWith('.htm'));
        
        if (htmlFiles.length > 0) {
          mainHtmlFile = htmlFiles[0];
          htmlContent = await fs.readFile(path.join(tempDir, mainHtmlFile), 'utf8');
        }
      }
      
      // If no HTML file found
      if (!htmlContent) {
        console.error('No HTML file found in ZIP');
        
        // Cleanup
        try {
          await fs.remove(tempDir);
          console.log('Cleaned up temporary directory');
        } catch (cleanupError) {
          console.error('Error cleaning up:', cleanupError);
        }
        
        return {
          success: false,
          message: 'No HTML file found in the ZIP. Please ensure your ZIP contains an index.html file or at least one HTML file.'
        };
      }
      
      console.log(`Found HTML file: ${mainHtmlFile}, content length: ${htmlContent.length} characters`);
      
      // STEP 6: Update the article with the HTML content
      console.log('STEP 6: Updating article with HTML content');
      
      const updateData: Partial<Article> = {
        content: htmlContent,
        contentFormat: 'html'
      };
      
      // Update the article
      const updatedArticle = await storage.updateArticle(articleId, updateData);
      
      if (!updatedArticle) {
        console.error('Failed to update article with HTML content');
        
        // Cleanup
        try {
          await fs.remove(tempDir);
          console.log('Cleaned up temporary directory');
        } catch (cleanupError) {
          console.error('Error cleaning up:', cleanupError);
        }
        
        return {
          success: false,
          message: 'Failed to update article with the HTML content. Database error.'
        };
      }
      
      console.log('Article successfully updated with HTML content');
      
      // STEP 7: Sync to Airtable if needed
      if (article.source === 'airtable' && article.externalId) {
        console.log('STEP 7: Syncing HTML content to Airtable');
        
        try {
          // Get Airtable settings
          const apiKeySetting = await storage.getIntegrationSettingByKey("airtable", "api_key");
          const baseIdSetting = await storage.getIntegrationSettingByKey("airtable", "base_id");
          const tableNameSetting = await storage.getIntegrationSettingByKey("airtable", "articles_table");
          
          if (apiKeySetting?.value && baseIdSetting?.value && tableNameSetting?.value && 
              apiKeySetting.enabled && baseIdSetting.enabled && tableNameSetting.enabled) {
            
            const apiKey = apiKeySetting.value;
            const baseId = baseIdSetting.value;
            const tableName = tableNameSetting.value;
            
            console.log(`Syncing HTML content to Airtable record: ${article.externalId}`);
            
            // Update just the Body field in Airtable
            const airtableResponse = await fetch(`https://api.airtable.com/v0/${baseId}/${tableName}/${article.externalId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fields: {
                  Body: htmlContent,
                  _updatedTime: new Date().toISOString()
                }
              })
            });
            
            if (!airtableResponse.ok) {
              const errorText = await airtableResponse.text();
              console.error('Error syncing to Airtable:', errorText);
            } else {
              console.log('Successfully synced HTML content to Airtable');
            }
          } else {
            console.log('Airtable settings unavailable or disabled, skipping sync');
          }
        } catch (error) {
          console.error('Error syncing content to Airtable:', error);
          // Don't fail the whole operation if Airtable sync fails
        }
      }
      
      // Cleanup
      try {
        await fs.remove(tempDir);
        console.log('Cleaned up temporary directory');
      } catch (cleanupError) {
        console.error('Error cleaning up:', cleanupError);
      }
      
      console.log('==== processZipFile COMPLETED SUCCESSFULLY ====');
      
      return {
        success: true,
        message: `HTML content from ${mainHtmlFile} in the ZIP file has been successfully extracted and set as the article content.`,
        content: htmlContent
      };
      
    } catch (downloadError) {
      console.error('Error downloading or processing ZIP file:', downloadError);
      return {
        success: false,
        message: `Error processing ZIP file: ${downloadError instanceof Error ? downloadError.message : 'Unknown download error'}`
      };
    }
    
  } catch (error) {
    console.error('==== processZipFile ERROR ====', error);
    return {
      success: false,
      message: `Error processing ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

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