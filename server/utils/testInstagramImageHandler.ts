/**
 * Test script for Instagram image handler
 * Use this to test the download and re-hosting functionality
 */

import { downloadAndStoreImage, getPublicImageUrl, cleanupOldImages } from './instagramImageHandler';
import { log } from '../vite';

async function testImageHandler() {
  const testImages = [
    'https://i.imgur.com/aEhGi77.png',
    'https://i.ibb.co/z1bJGNM/0-C11-7-D4-F-BC43-4-ABD-9-A7-C-D5-F3-B3-BAF25-E.jpg'
  ];

  console.log('Starting Instagram image handler test');
  log('Starting Instagram image handler test', 'test');
  
  try {
    // Test download and storage
    console.log('Testing image download and storage...');
    log('Testing image download and storage...', 'test');
    for (const imageUrl of testImages) {
      try {
        console.log(`Downloading image from: ${imageUrl}`);
        log(`Downloading image from: ${imageUrl}`, 'test');
        const localPath = await downloadAndStoreImage(imageUrl);
        const publicUrl = getPublicImageUrl(localPath);
        
        console.log(`Success! Image stored locally at: ${localPath}`);
        console.log(`Public URL: ${publicUrl}`);
        log(`Success! Image stored locally at: ${localPath}`, 'test');
        log(`Public URL: ${publicUrl}`, 'test');
      } catch (error) {
        console.error(`Failed to process image ${imageUrl}:`, error);
        log(`Failed to process image ${imageUrl}: ${error}`, 'test');
      }
    }
    
    // Test cleanup
    console.log('Testing cleanup of old images...');
    log('Testing cleanup of old images...', 'test');
    // Set max age to a very large number to avoid cleaning up our test images
    const deletedCount = cleanupOldImages(240); // 10 days
    console.log(`Cleanup test complete. ${deletedCount} old files deleted.`);
    log(`Cleanup test complete. ${deletedCount} old files deleted.`, 'test');
    
    console.log('Instagram image handler test completed successfully!');
    log('Instagram image handler test completed successfully!', 'test');
  } catch (error) {
    console.error('Test failed with error:', error);
    log(`Test failed with error: ${error}`, 'test');
  }
}

// Run the test
testImageHandler().catch(error => {
  console.error('Test error:', error);
});

export { testImageHandler };