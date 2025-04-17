/**
 * Helper script to pause the continuous migration process
 * Run with: node pause-continuous-migration.js
 */

const fs = require('fs');
const PROGRESS_FILE = './migration-continuous.json';

async function pauseMigration() {
  try {
    // Check if the progress file exists
    if (!fs.existsSync(PROGRESS_FILE)) {
      console.log('Migration progress file not found. Is the migration running?');
      return;
    }

    // Read the current progress
    const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    
    // Update the paused flag
    progressData.paused = true;
    
    // Write the updated progress back to the file
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), 'utf8');
    
    console.log('\nMigration has been paused. Existing operations will complete, but no new records will be processed.');
    console.log('To resume the migration, run: node resume-continuous-migration.js\n');
  } catch (error) {
    console.error('Error pausing migration:', error);
  }
}

pauseMigration();