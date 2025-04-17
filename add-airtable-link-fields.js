/**
 * This script generates instructions for adding the required link fields to your Airtable table
 */

console.log(`
======= AIRTABLE LINK FIELD SETUP INSTRUCTIONS =======

We've encountered an error: "Unknown field name: 'InstaPhotoLink'" 

To fix this issue, you need to add two URL fields to your Airtable table:

1. Log into your Airtable account
2. Navigate to the base: ${process.env.AIRTABLE_BASE_ID || 'appg1YMt6gzbLVf2a'}
3. Go to the articles table: ${process.env.AIRTABLE_ARTICLES_TABLE || 'tbljWcl67xzH6zAno'}
4. Click the '+' button to the right of your existing fields
5. Add a new field named 'MainImageLink'
   - Set the field type to 'URL'
   - This will store links to main article images
   
6. Add another new field named 'InstaPhotoLink'
   - Set the field type to 'URL'
   - This will store links to Instagram photos

After adding these fields, run the migration script again:
  node migrate-airtable-attachments-resumable.js
  
The script saves its progress, so it will continue from where it left off.

=========================================================
`);