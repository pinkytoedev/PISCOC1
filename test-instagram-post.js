#!/usr/bin/env node

import fetch from 'node-fetch';

/**
 * Test script to post content to Instagram using the Graph API
 * 
 * This script demonstrates how to post content to Instagram using:
 * 1. An Instagram Business Account ID
 * 2. A valid access token with instagram_business_content_publish permission
 * 
 * First, it creates a media container with the image URL
 * Then, it publishes the container to the Instagram account
 */

// Configuration - Replace with your values
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
// Clean the access token (remove any trailing or leading whitespace, plus signs, etc.)
let ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
ACCESS_TOKEN = ACCESS_TOKEN.trim().replace(/\+$/, '');
const IMAGE_URL = process.env.IMAGE_URL || 'https://picsum.photos/800/800'; // Example image URL
const CAPTION = process.env.CAPTION || 'Test post via Instagram Graph API\n\n#test #api #automation';

// Instagram Graph API version
const API_VERSION = 'v19.0';

/**
 * Make a request to the Graph API
 */
async function graphAPIRequest(endpoint, method = 'GET', params = {}) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}${endpoint}`);
  
  // Add access token to all requests
  url.searchParams.append('access_token', ACCESS_TOKEN);
  
  let options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  if (method === 'GET') {
    // Add parameters to URL for GET requests
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  } else {
    // Add parameters to body for POST requests
    options.body = JSON.stringify(params);
  }
  
  // Log URL without the token for security
  const urlForLogging = new URL(url);
  urlForLogging.searchParams.set('access_token', '***token-hidden***');
  console.log(`Making ${method} request to: ${urlForLogging.toString()}`);
  
  const response = await fetch(url.toString(), options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed with status ${response.status}: ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Main function to post to Instagram
 */
async function postToInstagram() {
  console.log('Starting Instagram post process...');
  
  // Validate required inputs
  if (!INSTAGRAM_ACCOUNT_ID) {
    throw new Error('INSTAGRAM_ACCOUNT_ID is required. Set it as an environment variable.');
  }
  
  if (!ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN is required. Set it as an environment variable.');
  }
  
  try {
    // Step 1: Create a media container with the image URL
    console.log('Creating media container...');
    const containerResponse = await graphAPIRequest(
      `/${INSTAGRAM_ACCOUNT_ID}/media`,
      'POST',
      {
        image_url: IMAGE_URL,
        caption: CAPTION
      }
    );
    
    console.log('Container created:', containerResponse);
    const containerId = containerResponse.id;
    
    // Step 2: Publish the container
    console.log('Publishing media container...');
    const publishResponse = await graphAPIRequest(
      `/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
      'POST',
      {
        creation_id: containerId
      }
    );
    
    console.log('Successfully published to Instagram!');
    console.log('Response:', publishResponse);
    
    console.log('\nView your post at:');
    console.log(`https://www.instagram.com/p/${publishResponse.id}/`);
    
    return publishResponse;
  } catch (error) {
    console.error('Error posting to Instagram:', error.message);
    
    if (error.message.includes('(#10) Application does not have permission')) {
      console.error('\n⚠️ Permission error: Make sure your access token has the instagram_business_content_publish permission.');
      console.error('See: https://developers.facebook.com/docs/instagram-api/guides/content-publishing');
    }
    
    if (error.message.includes('(#190)')) {
      console.error('\n⚠️ Token error: Your access token may be invalid or expired.');
      console.error('Generate a new token with the correct permissions.');
    }
    
    if (error.message.includes('(#100) No permission')) {
      console.error('\n⚠️ User permission error: Your Instagram account must be a Professional account (Business or Creator).');
      console.error('And it must be linked to your Facebook page.');
    }
    
    throw error;
  }
}

/**
 * Get account information
 */
async function getAccountInfo() {
  try {
    console.log('Fetching Instagram account information...');
    
    const accountInfo = await graphAPIRequest(
      `/${INSTAGRAM_ACCOUNT_ID}`,
      'GET',
      {
        fields: 'username,name,profile_picture_url,biography,follows_count,followers_count,media_count'
      }
    );
    
    console.log('Account Information:');
    console.log('-------------------');
    console.log(`Username: @${accountInfo.username}`);
    console.log(`Name: ${accountInfo.name || 'N/A'}`);
    console.log(`Followers: ${accountInfo.followers_count || 'N/A'}`);
    console.log(`Following: ${accountInfo.follows_count || 'N/A'}`);
    console.log(`Media count: ${accountInfo.media_count || 'N/A'}`);
    console.log(`Bio: ${accountInfo.biography || 'N/A'}`);
    console.log('-------------------');
    
    return accountInfo;
  } catch (error) {
    console.error('Error fetching account information:', error.message);
    throw error;
  }
}

// Run the script
(async () => {
  try {
    // Log token format to help with debugging
    if (ACCESS_TOKEN) {
      const firstSix = ACCESS_TOKEN.substring(0, 6);
      const lastFour = ACCESS_TOKEN.substring(ACCESS_TOKEN.length - 4);
      const tokenLength = ACCESS_TOKEN.length;
      console.log(`Using token: ${firstSix}...${lastFour} (${tokenLength} characters long)`);
    } else {
      console.log('No access token provided');
    }
    
    // First get account info
    await getAccountInfo();
    
    // Then post to Instagram
    await postToInstagram();
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
})();

export {
  postToInstagram,
  getAccountInfo,
  graphAPIRequest
};