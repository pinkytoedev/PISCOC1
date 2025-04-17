/**
 * Helper script to resume the continuous migration process
 * Run with: node resume-continuous-migration.js
 */

const fs = require('fs');
const PROGRESS_FILE = './migration-continuous.json';

async function resumeMigration() {
  try {
    // Check if the progress file exists
    if (!fs.existsSync(PROGRESS_FILE)) {
      console.log('Migration progress file not found. Start the migration with node run-continuous-migration.js');
      return;
    }

    // Read the current progress
    const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    
    // Update the paused flag
    progressData.paused = false;
    
    // Write the updated progress back to the file
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), 'utf8');
    
    console.log('\nMigration has been resumed. Processing will continue with the next record.');
    console.log('To check status, open the dashboard or run: cat migration-continuous.json | grep isRunning');
    console.log('To pause again, run: node pause-continuous-migration.js\n');
  } catch (error) {
    console.error('Error resuming migration:', error);
  }
}

resumeMigration();