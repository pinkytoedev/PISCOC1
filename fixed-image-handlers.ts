/**
 * Fixed implementations of the image upload handlers
 * These functions are meant to replace the corrupted sections in discordBot.ts
 */

import {
  DMChannel,
  TextChannel,
  NewsChannel,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  StringSelectMenuBuilder
} from 'discord.js';
import { uploadImageToImgur, uploadImageUrlToImgur } from './server/utils/imgurUploader';
import { uploadImageUrlToAirtable } from './server/utils/imageUploader';
import { storage } from './server/storage';

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
      content: 'Please select an article to upload an Instagram image to:',
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
      content: 'Please select an article to upload a web (main) image to:',
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
 * Helper function to create a type-safe message collector
 * Used by both /insta and /web commands to collect image messages
 */
async function collectImageMessage(channel: any, filter: (m: any) => boolean, timeoutMs: number = 300000): Promise<any | null> {
  // Create a collector that will listen for messages meeting the filter criteria
  const collector = channel.createMessageCollector({
    filter,
    max: 1,
    time: timeoutMs
  });
  
  // Return a promise that resolves when a message is collected or timeout occurs
  return new Promise<any | null>(resolve => {
    collector.on('collect', (message: any) => {
      resolve(message);
      collector.stop();
    });
    
    collector.on('end', (collected: any) => {
      if (collected.size === 0) {
        resolve(null);
      }
    });
  });
}

/**
 * Handler for Instagram image upload button interaction
 * This is part of the handleButtonInteraction function
 */
async function handleInstaImageUploadButton(interaction: any, articleId: number, article: any) {
  // View in Dashboard button as fallback
  const viewInDashboardButton = new ButtonBuilder()
    .setLabel('View in Dashboard')
    .setStyle(ButtonStyle.Link)
    .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
  
  // We'll use a DM to collect the image if in a guild channel
  const userId = interaction.user.id;
  let uploadChannel: DMChannel | TextChannel | NewsChannel | null = null;
  
  if (interaction.channel && interaction.channel.type === ChannelType.DM) {
    // If we're already in a DM, use the current channel
    uploadChannel = interaction.channel as DMChannel;
  } else {
    // If we're in a guild channel, try to create a DM with the user
    try {
      uploadChannel = await interaction.user.createDM();
    } catch (dmError) {
      console.error('Could not create DM channel:', dmError);
      // Fallback to the same channel if DM fails
      uploadChannel = interaction.channel as DMChannel;
    }
  }
  
  // Ask the user to send an image
  await interaction.editReply({
    content: `Please send the Instagram image for article **${article.title}** in the next 5 minutes.\n\nImportant instructions:\n- Send the image as an attachment (not a link)\n- Send only one image\n- The image will be uploaded to Imgur and then linked to your article\n\nI'll send you a private message where you can upload the image.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(viewInDashboardButton)]
  });
  
  // If we're using a DM and it's different from the interaction channel, send instructions there
  if (uploadChannel && uploadChannel.id !== interaction.channel.id) {
    await uploadChannel.send(`Please upload the Instagram image for article **${article.title}** here. Send it as an attachment (not a link).`);
  }
  
  // Define the filter for message collector
  const filter = (m: Message) => {
    // Only accept messages from the user who initiated the interaction
    if (m.author.id !== userId) return false;
    
    // Check if the message has at least one attachment
    return m.attachments.size > 0;
  };
  
  // Wait for the user to upload an image
  const imageMessage = await collectImageMessage(uploadChannel, filter, 5 * 60 * 1000); // 5 minute timeout
  
  if (!imageMessage) {
    if (uploadChannel && uploadChannel.id !== interaction.channel.id) {
      // If using DM, send timeout message there
      await uploadChannel.send('No image received within the time limit. Please try again.');
    }
    
    // Also notify in the original channel
    await interaction.followUp({
      content: 'No image was received within the time limit. Please try again or use the dashboard.',
      ephemeral: true
    });
    return;
  }
  
  // Get the first attachment
  const attachment = imageMessage.attachments.first();
  
  if (!attachment) {
    await uploadChannel.send('No valid image attachment found. Please try again with a proper image file.');
    return;
  }
  
  // Check if the attachment is an image
  const isImage = attachment.contentType?.startsWith('image/');
  
  if (!isImage) {
    await uploadChannel.send('The attachment is not a valid image. Please try again with an image file (jpg, png, etc.).');
    return;
  }
  
  // Upload the image to Imgur
  await uploadChannel.send('Processing your image upload. This may take a moment...');
  
  try {
    // Upload to Imgur
    const imgurResult = await uploadImageUrlToImgur(attachment.url, attachment.name || 'discord-upload.jpg');
    
    if (!imgurResult) {
      await uploadChannel.send('Failed to upload image to Imgur. Please try again later or use the dashboard.');
      return;
    }
    
    // Now upload to Airtable
    await uploadChannel.send(`Image successfully uploaded to Imgur! Now adding it to your article as an Instagram image...`);
    
    // Use the image uploader utility to upload to Airtable
    const airtableResult = await uploadImageUrlToAirtable(
      imgurResult.link,
      attachment.name || 'discord-upload.jpg',
      articleId,
      'instaPhoto'
    );
    
    if (!airtableResult) {
      await uploadChannel.send('Failed to link the image to your article in Airtable. Please try again later or use the dashboard.');
      return;
    }
    
    // Success! Let the user know
    await uploadChannel.send({
      content: `Success! The Instagram image has been added to your article **${article.title}**.\n\nImage URL: ${imgurResult.link}`,
      files: []
    });
    
    // Update the interaction reply as well if we're in a different channel
    if (uploadChannel.id !== interaction.channel.id) {
      await interaction.followUp({
        content: `Success! The Instagram image has been added to your article **${article.title}**.`,
        ephemeral: true
      });
    }
    
  } catch (error) {
    console.error('Error uploading image:', error);
    await uploadChannel.send('An error occurred while processing your image. Please try again later or use the dashboard.');
  }
}

/**
 * Handler for Web image upload button interaction
 * This is part of the handleButtonInteraction function
 */
async function handleWebImageUploadButton(interaction: any, articleId: number, article: any) {
  // View in Dashboard button as fallback
  const viewInDashboardButton = new ButtonBuilder()
    .setLabel('View in Dashboard')
    .setStyle(ButtonStyle.Link)
    .setURL(`${process.env.BASE_URL || 'http://localhost:5000'}/articles?id=${articleId}`);
  
  // We'll use a DM to collect the image if in a guild channel
  const userId = interaction.user.id;
  let uploadChannel: DMChannel | TextChannel | NewsChannel | null = null;
  
  if (interaction.channel && interaction.channel.type === ChannelType.DM) {
    // If we're already in a DM, use the current channel
    uploadChannel = interaction.channel as DMChannel;
  } else {
    // If we're in a guild channel, try to create a DM with the user
    try {
      uploadChannel = await interaction.user.createDM();
    } catch (dmError) {
      console.error('Could not create DM channel:', dmError);
      // Fallback to the same channel if DM fails
      uploadChannel = interaction.channel as DMChannel;
    }
  }
  
  // Ask the user to send an image
  await interaction.editReply({
    content: `Please send the Web (main) image for article **${article.title}** in the next 5 minutes.\n\nImportant instructions:\n- Send the image as an attachment (not a link)\n- Send only one image\n- The image will be uploaded to Imgur and then linked to your article\n\nI'll send you a private message where you can upload the image.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(viewInDashboardButton)]
  });
  
  // If we're using a DM and it's different from the interaction channel, send instructions there
  if (uploadChannel && uploadChannel.id !== interaction.channel.id) {
    await uploadChannel.send(`Please upload the Web (main) image for article **${article.title}** here. Send it as an attachment (not a link).`);
  }
  
  // Define the filter for message collector
  const filter = (m: Message) => {
    // Only accept messages from the user who initiated the interaction
    if (m.author.id !== userId) return false;
    
    // Check if the message has at least one attachment
    return m.attachments.size > 0;
  };
  
  // Wait for the user to upload an image
  const imageMessage = await collectImageMessage(uploadChannel, filter, 5 * 60 * 1000); // 5 minute timeout
  
  if (!imageMessage) {
    if (uploadChannel && uploadChannel.id !== interaction.channel.id) {
      // If using DM, send timeout message there
      await uploadChannel.send('No image received within the time limit. Please try again.');
    }
    
    // Also notify in the original channel
    await interaction.followUp({
      content: 'No image was received within the time limit. Please try again or use the dashboard.',
      ephemeral: true
    });
    return;
  }
  
  // Get the first attachment
  const attachment = imageMessage.attachments.first();
  
  if (!attachment) {
    await uploadChannel.send('No valid image attachment found. Please try again with a proper image file.');
    return;
  }
  
  // Check if the attachment is an image
  const isImage = attachment.contentType?.startsWith('image/');
  
  if (!isImage) {
    await uploadChannel.send('The attachment is not a valid image. Please try again with an image file (jpg, png, etc.).');
    return;
  }
  
  // Upload the image to Imgur
  await uploadChannel.send('Processing your image upload. This may take a moment...');
  
  try {
    // Upload to Imgur
    const imgurResult = await uploadImageUrlToImgur(attachment.url, attachment.name || 'discord-upload.jpg');
    
    if (!imgurResult) {
      await uploadChannel.send('Failed to upload image to Imgur. Please try again later or use the dashboard.');
      return;
    }
    
    // Now upload to Airtable
    await uploadChannel.send(`Image successfully uploaded to Imgur! Now adding it to your article as the main Web image...`);
    
    // Use the image uploader utility to upload to Airtable
    const airtableResult = await uploadImageUrlToAirtable(
      imgurResult.link,
      attachment.name || 'discord-upload.jpg',
      articleId,
      'MainImage'
    );
    
    if (!airtableResult) {
      await uploadChannel.send('Failed to link the image to your article in Airtable. Please try again later or use the dashboard.');
      return;
    }
    
    // Success! Let the user know
    await uploadChannel.send({
      content: `Success! The Web (main) image has been added to your article **${article.title}**.\n\nImage URL: ${imgurResult.link}`,
      files: []
    });
    
    // Update the interaction reply as well if we're in a different channel
    if (uploadChannel.id !== interaction.channel.id) {
      await interaction.followUp({
        content: `Success! The Web (main) image has been added to your article **${article.title}**.`,
        ephemeral: true
      });
    }
    
  } catch (error) {
    console.error('Error uploading image:', error);
    await uploadChannel.send('An error occurred while processing your image. Please try again later or use the dashboard.');
  }
}