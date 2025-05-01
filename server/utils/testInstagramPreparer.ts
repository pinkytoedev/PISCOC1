/**
 * Test script for Instagram image preparer
 * Use this to test the prepareImageForInstagram function
 */

import { prepareImageForInstagram } from '../integrations/instagramClient';
import { log } from '../vite';

async function testInstagramImagePreparer() {
  // Test images
  const testImages = [
    'https://i.ibb.co/z1bJGNM/0-C11-7-D4-F-BC43-4-ABD-9-A7-C-D5-F3-B3-BAF25-E.jpg',
    'https://i.ibb.co/WC7BWZp/Leak.jpg'
  ];

  console.log('Starting Instagram image preparer test');
  log('Starting Instagram image preparer test', 'test');
  
  try {
    // Test with multiple images
    for (const imageUrl of testImages) {
      try {
        console.log(`Testing with image: ${imageUrl}`);
        log(`Testing with image: ${imageUrl}`, 'test');
        
        // Process the image
        console.log('Processing image...');
        const processedUrl = await prepareImageForInstagram(imageUrl);
        
        console.log('Success!');
        console.log('Original URL:', imageUrl);
        console.log('Processed URL:', processedUrl);
        
        log(`Original URL: ${imageUrl}`, 'test');
        log(`Processed URL: ${processedUrl}`, 'test');
      } catch (error) {
        console.error(`Failed to process image ${imageUrl}:`, error);
        log(`Failed to process image ${imageUrl}: ${error}`, 'test');
      }
    }
    
    console.log('Instagram image preparer test completed!');
    log('Instagram image preparer test completed!', 'test');
  } catch (error) {
    console.error('Test failed with error:', error);
    log(`Test failed with error: ${error}`, 'test');
  }
}

// Run the test
testInstagramImagePreparer().catch(error => {
  console.error('Test error:', error);
});

export { testInstagramImagePreparer };