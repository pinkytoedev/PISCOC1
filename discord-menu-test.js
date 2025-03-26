const { StringSelectMenuBuilder } = require('discord.js');

const menu = new StringSelectMenuBuilder();
console.log('Methods:', Object.getOwnPropertyNames(StringSelectMenuBuilder.prototype));
console.log('Added setCustomId:', typeof menu.setCustomId);
