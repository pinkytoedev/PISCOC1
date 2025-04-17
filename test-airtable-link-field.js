/**
 * Test script for the new Airtable link field functionality
 * This test will find an article and update its image link fields
 */

const fetch = require('node-fetch');

async function testAirtableLinkField() {
  try {
    console.log('Testing Airtable link field upload...');
    
    // Example image URL - use a valid image URL
    const imageUrl = 'https://i.imgur.com/YyjzvJr.jpeg';
    
    // Use the first article we find
    const articlesResponse = await fetch('http://localhost:5000/api/articles');
    const articles = await articlesResponse.json();
    
    if (!articles || articles.length === 0) {
      console.error('No articles found to test with');
      return;
    }
    
    const testArticle = articles[0];
    console.log(`Using article for test: ${testArticle.id} - ${testArticle.title}`);
    
    // First try to connect to the direct test endpoint (no auth required)
    const testEndpointResponse = await fetch(`http://localhost:5000/api/airtable/direct-test?url=${encodeURIComponent(imageUrl)}&field=MainImageLink`);
    const testResult = await testEndpointResponse.json();
    
    console.log('Test endpoint response:', testResult);
    
    // Now try the regular endpoint (requires authentication)
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dev', password: 'password' }),
      credentials: 'include'
    });
    
    const loginResult = await loginResponse.json();
    console.log('Login result:', loginResult);
    
    // Use the regular upload endpoint
    const uploadResponse = await fetch(`http://localhost:5000/api/airtable/upload-image-url/${testArticle.id}/MainImage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageUrl, 
        filename: 'test-image.jpg' 
      }),
      credentials: 'include'
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing Airtable link field:', error);
  }
}

testAirtableLinkField();