import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { Express, Request, Response } from 'express';
import { storage } from '../storage';

// Store bot instance for the application lifecycle
let client: Client | null = null;
let botStatus = {
  connected: false,
  status: 'Not initialized',
  username: '',
  id: '',
  guilds: 0
};

// Commands configuration
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with the bot latency')
];

/**
 * Initialize a new Discord bot with the provided token and client ID
 */
export const initializeDiscordBot = async (token: string, clientId: string) => {
  try {
    // Clean up any existing client
    if (client) {
      await client.destroy();
      client = null;
    }

    // Create a new client
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    // Register event handlers
    client.once(Events.ClientReady, c => {
      botStatus = {
        connected: true,
        status: 'Connected and ready',
        username: c.user.username,
        id: c.user.id,
        guilds: c.guilds.cache.size
      };
      console.log(`Ready! Logged in as ${c.user.tag}`);
    });

    // Register commands
    client.on(Events.InteractionCreate, async interaction => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'ping') {
        const sent = await interaction.reply({ 
          content: 'Pinging...', 
          fetchReply: true 
        });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Bot latency: ${latency}ms | API Latency: ${Math.round(client!.ws.ping)}ms`);
      }
    });

    // Register commands with Discord API
    const rest = new REST().setToken(token);
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    // Store token and client ID in integration settings
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    if (!tokenSetting) {
      await storage.createIntegrationSetting({
        service: 'discord',
        key: 'bot_token',
        value: token,
        enabled: true
      });
    } else {
      await storage.updateIntegrationSetting(tokenSetting.id, {
        value: token,
        enabled: true
      });
    }

    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
    if (!clientIdSetting) {
      await storage.createIntegrationSetting({
        service: 'discord',
        key: 'bot_client_id',
        value: clientId,
        enabled: true
      });
    } else {
      await storage.updateIntegrationSetting(clientIdSetting.id, {
        value: clientId,
        enabled: true
      });
    }

    botStatus.status = 'Initialized (not connected)';
    return { success: true, message: 'Bot initialized successfully' };
  } catch (error) {
    botStatus = {
      connected: false,
      status: `Initialization error: ${error instanceof Error ? error.message : String(error)}`,
      username: '',
      id: '',
      guilds: 0
    };
    console.error('Error initializing Discord bot:', error);
    return { success: false, message: 'Failed to initialize bot', error };
  }
};

/**
 * Start the Discord bot
 */
export const startDiscordBot = async () => {
  try {
    if (!client) {
      // Try to load settings from storage and initialize
      const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
      const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
      
      if (!tokenSetting || !clientIdSetting) {
        return { success: false, message: 'Bot not initialized. Please set bot token and client ID first.' };
      }
      
      await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      if (!client) {
        return { success: false, message: 'Failed to initialize bot with stored credentials.' };
      }
    }
    
    botStatus.status = 'Connecting...';
    await client.login(await getDiscordBotToken());
    
    return { success: true, message: 'Bot started successfully' };
  } catch (error) {
    botStatus = {
      ...botStatus,
      connected: false,
      status: `Start error: ${error instanceof Error ? error.message : String(error)}`
    };
    console.error('Error starting Discord bot:', error);
    return { success: false, message: 'Failed to start bot', error };
  }
};

/**
 * Stop the Discord bot
 */
export const stopDiscordBot = async () => {
  try {
    if (!client) {
      return { success: false, message: 'Bot not initialized' };
    }
    
    await client.destroy();
    botStatus = {
      connected: false,
      status: 'Disconnected',
      username: botStatus.username,
      id: botStatus.id,
      guilds: 0
    };
    
    return { success: true, message: 'Bot stopped successfully' };
  } catch (error) {
    console.error('Error stopping Discord bot:', error);
    return { success: false, message: 'Failed to stop bot', error };
  }
};

/**
 * Get the Discord bot status
 */
export const getDiscordBotStatus = () => {
  if (client) {
    // Update the connected status based on client's readiness
    botStatus.connected = client.isReady();
    
    // Update guild count if connected
    if (client.isReady()) {
      botStatus.guilds = client.guilds.cache.size;
    }
  }
  
  return botStatus;
};

/**
 * Helper function to get the Discord bot token from storage
 */
async function getDiscordBotToken(): Promise<string> {
  const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
  
  if (!tokenSetting || !tokenSetting.value) {
    throw new Error('Discord bot token not found in settings');
  }
  
  return tokenSetting.value;
}

/**
 * Set up Discord bot routes for the Express app
 */
export function setupDiscordBotRoutes(app: Express) {
  // Initialize the bot with token and client ID
  app.post("/api/discord/bot/initialize", async (req: Request, res: Response) => {
    try {
      const { token, clientId } = req.body;
      
      if (!token || !clientId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Bot token and client ID are required' 
        });
      }
      
      const result = await initializeDiscordBot(token, clientId);
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({ 
          success: false, 
          message: result.message 
        });
      }
    } catch (error) {
      console.error('Error initializing Discord bot:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while initializing the Discord bot' 
      });
    }
  });

  // Start the bot
  app.post("/api/discord/bot/start", async (req: Request, res: Response) => {
    try {
      const result = await startDiscordBot();
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({ 
          success: false, 
          message: result.message 
        });
      }
    } catch (error) {
      console.error('Error starting Discord bot:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while starting the Discord bot' 
      });
    }
  });

  // Stop the bot
  app.post("/api/discord/bot/stop", async (req: Request, res: Response) => {
    try {
      const result = await stopDiscordBot();
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ 
          success: false, 
          message: result.message 
        });
      }
    } catch (error) {
      console.error('Error stopping Discord bot:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while stopping the Discord bot' 
      });
    }
  });

  // Get bot status
  app.get("/api/discord/bot/status", (req: Request, res: Response) => {
    try {
      const status = getDiscordBotStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting Discord bot status:', error);
      res.status(500).json({ 
        success: false, 
        message: 'An error occurred while getting Discord bot status' 
      });
    }
  });
}

/**
 * Auto-start the Discord bot if settings are available
 */
export const autoStartDiscordBot = async () => {
  try {
    // Check if we have the required settings
    const tokenSetting = await storage.getIntegrationSettingByKey('discord', 'bot_token');
    const clientIdSetting = await storage.getIntegrationSettingByKey('discord', 'bot_client_id');
    
    if (tokenSetting?.enabled && clientIdSetting?.enabled) {
      console.log('Auto-starting Discord bot...');
      await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      await startDiscordBot();
    }
  } catch (error) {
    console.error('Error auto-starting Discord bot:', error);
  }
};