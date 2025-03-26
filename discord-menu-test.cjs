const { StringSelectMenuBuilder } = require('discord.js');

try {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('test')
    .setPlaceholder('Select an option')
    .addOptions([
      {
        label: 'Option 1',
        value: 'option_1',
        description: 'This is option 1'
      },
      {
        label: 'Option 2',
        value: 'option_2',
        description: 'This is option 2'
      }
    ]);
  
  console.log('Menu created successfully:', menu);
} catch (error) {
  console.error('Error creating menu:', error);
}
