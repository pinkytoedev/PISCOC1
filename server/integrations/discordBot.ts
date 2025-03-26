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
  StringSelectMenuBuilder
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
    
    // Author field removed as it will be set automatically on the website
    // Users don't need to input author information through Discord anymore
    
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
    const featuredRow = new ActionRowBuilder<TextInputBuilder>().addComponents(featuredInput);
    
    // Add inputs to the modal (author field removed)
    modal.addComponents(titleRow, descriptionRow, bodyRow, featuredRow);
    
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
 * Handler for the /edit_article command
 * Retrieves the article and opens a modal for editing it
 */
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

async function handleEditArticleCommand(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Create a select menu for article selection
    const articleSelect = await createArticleSelectMenu();
    
    // If no articles available to edit
    if (articleSelect.options[0].data.value === '0') {
      await interaction.editReply('No unpublished articles found to edit. Create a new article using `/create_article` or use the website to create draft articles first.');
      return;
    }
    
    // Create an action row with the article select menu
    const row = new ActionRowBuilder().addComponents(articleSelect);
    
    // Show the selection menu to the user
    await interaction.editReply({
      content: 'Please select an article to edit:',
      components: [row]
    });
    
    // We'll handle the article editing in the string select menu interaction handler
  } catch (error) {
    console.error('Error handling edit article command:', error);
    await interaction.editReply('Sorry, there was an error fetching articles. Please try again later.');
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
      .setLabel('Author')  // Maps to Airtable's "Author" field
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Author name (use dropdown after submitting)')
      .setValue(article.author || '')
      .setRequired(true)
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
    // Since we want to keep author field in the edit modal for now 
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
      // Use Discord username as temporary author (since we removed the author input field)
      const author = interaction.user.username;
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
      
      await interaction.editReply({ embeds: [embed] });
      
      // Add author selection menu after successful article creation
      try {
        // Get author selection menu
        const authorSelect = await createAuthorSelectMenu();
        const authorRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(authorSelect);
        
        await interaction.followUp({
          content: "**Important:** Please select an author from the team members dropdown below. This will properly link to Airtable's reference field.",
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
      // Keep existing author or use Discord username if needed
      const author = interaction.fields.getTextInputValue('author');
      const featuredInput = interaction.fields.getTextInputValue('featured').toLowerCase();
      const featured = featuredInput === 'yes' || featuredInput === 'y' || featuredInput === 'true';
      
      // Update article data
      const articleData = {
        title,                     // Maps to Airtable's "Name" field
        description,               // Maps to Airtable's "Description" field
        content: body,             // Maps to Airtable's "Body" field
        author,                    // Maps to Airtable's "Author" field
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
          { name: 'Author', value: author },
          { name: 'Status', value: updatedArticle.status },
          { name: 'Featured', value: featured ? 'Yes' : 'No' }
        )
        .setFooter({ text: 'The updated article will be synced to Airtable through the website' });
      
      await interaction.editReply({ embeds: [embed] });
      
      // Add author selection menu after successful article update
      try {
        // Get author selection menu
        const authorSelect = await createAuthorSelectMenu();
        const authorRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(authorSelect);
        
        await interaction.followUp({
          content: "**Important:** Please select an author from the team members dropdown below. This will properly link to Airtable's reference field.",
          components: [authorRow],
          ephemeral: true
        });
      } catch (followUpError) {
        console.error("Couldn't send author selection menu:", followUpError);
      }
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
async function handleButtonInteraction(interaction: MessageComponentInteraction) {
  try {
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
      
      // Author field removed - will use Discord username and authors database instead
      
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
      // Since we want to keep author field in the button interaction handler for now
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
    .setName('list_articles')
    .setDescription('List articles that have not been published yet'),
  
  new SlashCommandBuilder()
    .setName('create_article')
    .setDescription('Create a new article draft'),
    
  new SlashCommandBuilder()
    .setName('edit_article')
    .setDescription('Edit an existing draft article')
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
          
          // Edit article command
          else if (interaction.commandName === 'edit_article') {
            await handleEditArticleCommand(interaction);
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