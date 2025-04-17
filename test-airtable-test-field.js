/**
 * Test script for the new Airtable Test field functionality
 * This will find an article and update its Test field with a link
 */
const fetch = require('node-fetch');

async function testAirtableTestField() {
  console.log('Starting Airtable Test field test...');
  
  try {
    // Step 1: Login to get session
    const loginResponse = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'dev',
        password: 'password'
      }),
      credentials: 'include'
    });
    
    if (!loginResponse.ok) {
      console.error('Failed to login:', await loginResponse.text());
      return;
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    
    // Step 2: Get articles to find an Airtable article
    const articlesResponse = await fetch('http://localhost:5000/api/articles', {
      headers: {
        Cookie: cookies
      }
    });
    
    if (!articlesResponse.ok) {
      console.error('Failed to fetch articles:', await articlesResponse.text());
      return;
    }
    
    const articles = await articlesResponse.json();
    
    // Find the first Airtable article with an image URL
    const testArticle = articles.find(article => 
      article.source === 'airtable' && 
      article.externalId && 
      article.imageUrl
    );
    
    if (!testArticle) {
      console.error('No suitable Airtable article found for testing');
      return;
    }
    
    console.log(`Found test article: ${testArticle.id} - ${testArticle.title}`);
    console.log(`ExternalId: ${testArticle.externalId}`);
    console.log(`Image URL: ${testArticle.imageUrl}`);
    
    // Step 3: Test using the migration endpoint for a single article
    console.log('\nTesting migration endpoint...');
    const migrationResponse = await fetch(`http://localhost:5000/api/airtable/test-migration/${testArticle.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies
      }
    });
    
    if (!migrationResponse.ok) {
      console.error('Migration test failed:', await migrationResponse.text());
      return;
    }
    
    const migrationResult = await migrationResponse.json();
    console.log('Migration test result:', JSON.stringify(migrationResult, null, 2));
    
    // Step 4: Test direct link upload
    console.log('\nTesting direct link upload...');
    const testLinkResponse = await fetch(`http://localhost:5000/api/airtable/test-link/${testArticle.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies
      },
      body: JSON.stringify({
        imageUrl: testArticle.imageUrl
      })
    });
    
    if (!testLinkResponse.ok) {
      console.error('Direct link test failed:', await testLinkResponse.text());
      return;
    }
    
    const testLinkResult = await testLinkResponse.json();
    console.log('Direct link test result:', JSON.stringify(testLinkResult, null, 2));
    
    console.log('\nTests completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testAirtableTestField();