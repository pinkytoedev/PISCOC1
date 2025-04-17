
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read the migration progress file
const progressFile = './migration-main-progress.json';
const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

console.log('=== Current Migration Status ===');
console.log(`Total Records: ${progress.totalRecords}`);
console.log(`Processed Records: ${progress.processedRecords || Object.keys(progress.recordsProcessed || {}).length}`);
console.log(`Last Processed Index: ${progress.lastProcessedIndex}`);
console.log('===============================');

// Determine which migration script to run
const availableScripts = [
  'migrate-with-progress-bar.js',
  'migrate-with-improved-rate-limits.js',
  'migrate-main-images.js',
  'migrate-main-images-faster.js',
  'migrate-small-batch.js',
  'migrate-single-image.js'
];

console.log('\nAvailable migration scripts:');
availableScripts.forEach((script, index) => {
  console.log(`${index + 1}. ${script}`);
});

// Ask for user input here in an actual interactive environment
// For our purpose, we'll just use a default
const scriptIndex = 2; // migrate-main-images.js - can be changed as needed
const selectedScript = availableScripts[scriptIndex - 1];

console.log(`\nResuming migration with: ${selectedScript}`);
console.log('Starting migration process...');

try {
  // Run the selected migration script
  execSync(`node ${selectedScript}`, { stdio: 'inherit' });
  
  console.log('\nMigration process completed or paused.');
  
  // Check the new progress
  const newProgress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  
  console.log('\n=== Updated Migration Status ===');
  console.log(`Total Records: ${newProgress.totalRecords}`);
  console.log(`Processed Records: ${newProgress.processedRecords || Object.keys(newProgress.recordsProcessed || {}).length}`);
  console.log(`Last Processed Index: ${newProgress.lastProcessedIndex}`);
  console.log('=================================');
  
  // Calculate progress percentage
  const totalRecords = newProgress.totalRecords;
  const processedCount = newProgress.processedRecords 
    ? newProgress.processedRecords.length 
    : Object.keys(newProgress.recordsProcessed || {}).length;
  
  const percentage = Math.round((processedCount / totalRecords) * 100);
  console.log(`\nProgress: ${percentage}% complete`);
  
} catch (error) {
  console.error('Error during migration:', error);
}
