/**
 * This is a simple test script to verify our Instagram image handling implementation
 */

// Test images
const testImages = [
  'https://i.ibb.co/z1bJGNM/0-C11-7-D4-F-BC43-4-ABD-9-A7-C-D5-F3-B3-BAF25-E.jpg',
  'https://i.imgur.com/aEhGi77.png'
];

// Define the function to test image preparation
async function testInstagramImagePreparer() {
  const testImageUrl = testImages[0]; // Using the first test image
  
  console.log(`Testing Instagram image preparer with: ${testImageUrl}`);
  
  try {
    // Import the Instagram client
    const { prepareImageForInstagram } = await import('./server/integrations/instagramClient.js');
    
    // Call the function we want to test
    console.log('Processing image...');
    const processedUrl = await prepareImageForInstagram(testImageUrl);
    
    console.log('Success!');
    console.log('Original URL:', testImageUrl);
    console.log('Processed URL:', processedUrl);
    
    return processedUrl;
  } catch (error) {
    console.error('Error testing Instagram image preparer:', error);
  }
}

// Run the test
testInstagramImagePreparer().catch(error => {
  console.error('Test error:', error);
});