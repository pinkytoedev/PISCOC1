/**
 * Helper script to start the continuous migration process
 * Run with: node run-continuous-migration.js
 */

// Import the migration script and execute it
require('./migrate-continuous.js');

console.log(`
=================================================================
                CONTINUOUS MIGRATION STARTED
=================================================================

The migration will run in the background and automatically handle
rate limits. You can close this terminal without stopping the
migration.

To monitor progress:
1. Check the dashboard in the web application
2. Look for the migration-continuous.json file

To stop the migration:
- Press Ctrl+C in this terminal
- Or edit migration-continuous.json and set "paused": true
=================================================================
`);