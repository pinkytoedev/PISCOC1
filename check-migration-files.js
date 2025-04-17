
const fs = require('fs');
const path = require('path');

// Migration progress files to check
const PROGRESS_FILES = [
  './migration-with-progress-bar.json',
  './migration-with-improved-rate-limits.json',
  './migration-main-progress.json',
  './migration-small-batch.json',
  './migration-single-image.json'
];

// Check each file
console.log('=== Migration Files Status ===');

let totalProcessed = 0;
let maxTotalRecords = 0;

for (const file of PROGRESS_FILES) {
  console.log(`\nChecking ${file}:`);
  
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      console.log(`- File exists`);
      console.log(`- Total records: ${data.totalRecords || 0}`);
      
      // Handle different formats
      if (data.processedRecords) {
        console.log(`- Processed records: ${data.processedRecords.length}`);
        totalProcessed += data.processedRecords.length;
      } else if (data.recordsProcessed) {
        const recordCount = Object.keys(data.recordsProcessed).length;
        console.log(`- Processed records: ${recordCount}`);
        totalProcessed += recordCount;
      } else {
        console.log(`- No processed records found`);
      }
      
      // Check last record processed
      if (data.lastProcessedIndex !== undefined) {
        console.log(`- Last processed index: ${data.lastProcessedIndex}`);
      }
      
      // Track max total records
      if (data.totalRecords && data.totalRecords > maxTotalRecords) {
        maxTotalRecords = data.totalRecords;
      }
      
      // Check for errors
      if (data.errors && data.errors.length > 0) {
        console.log(`- Errors: ${data.errors.length}`);
        data.errors.slice(0, 3).forEach((err, idx) => {
          console.log(`  Error ${idx + 1}: ${err.error ? err.error.substring(0, 100) : 'No error message'}`);
        });
      } else {
        console.log(`- No errors`);
      }
    } else {
      console.log(`- File does not exist`);
    }
  } catch (error) {
    console.log(`- Error reading file: ${error.message}`);
  }
}

// Print overall progress
console.log('\n=== Overall Migration Progress ===');
console.log(`Total records across all files: ${maxTotalRecords}`);
console.log(`Total processed records: ${totalProcessed}`);

if (maxTotalRecords > 0) {
  const percentage = Math.round((totalProcessed / maxTotalRecords) * 100);
  console.log(`Overall progress: ${percentage}%`);
}
