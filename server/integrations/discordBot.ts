import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { Express } from "express";
import { storage } from "../storage";

// Define the Discord bot client
let client: Client | null = null;
let commands: any[] = [];
let isInitialized = false;

// Register slash commands
const registerCommands = async (clientId: string, token: string) => {
  const rest = new REST().setToken(token);
  
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands.map(command => command.toJSON()) },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing application commands:', error);
    throw error;
  }
};

// Initialize the Discord bot
export const initializeDiscordBot = async (token: string, clientId: string) => {
  if (isInitialized && client) {
    await client.destroy();
    console.log('Destroying existing Discord bot client');
  }

  try {
    // Create a new client
    client = new Client({ 
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ] 
    });

    // Define commands
    commands = [
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with pong and latency check'),
    ];

    // Register commands with Discord API
    await registerCommands(clientId, token);

    // Set up event handlers
    client.once(Events.ClientReady, c => {
      console.log(`Discord bot ready! Logged in as ${c.user.tag}`);
      isInitialized = true;
    });

    // Handle slash commands
    client.on(Events.InteractionCreate, async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      if (commandName === 'ping') {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const pingTime = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Bot latency: ${pingTime}ms | API Latency: ${Math.round(client!.ws.ping)}ms`);
        
        // Log interaction for analytics
        storage.createActivityLog({
          action: "bot_command",
          resourceType: "discord_bot",
          resourceId: "ping",
          details: { 
            latency: pingTime,
            apiLatency: client!.ws.ping,
            user: interaction.user.username
          }
        }).catch(console.error);
      }
    });

    // Login to Discord
    await client.login(token);
    return { success: true, message: 'Discord bot successfully initialized' };
  } catch (error) {
    console.error('Error initializing Discord bot:', error);
    return { success: false, message: `Error initializing Discord bot: ${error}` };
  }
};

// Get the bot status
export const getDiscordBotStatus = () => {
  if (!client) {
    return { connected: false, status: 'Not initialized' };
  }
  
  return {
    connected: client.isReady(),
    status: client.isReady() ? 'Connected' : 'Connecting',
    username: client.user?.username,
    id: client.user?.id,
    guilds: client.guilds.cache.size
  };
};

// Set up the Discord bot routes
export function setupDiscordBotRoutes(app: Express) {
  // Initialize the Discord bot
  app.post("/api/discord/bot/initialize", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { token, clientId } = req.body;
      
      if (!token || !clientId) {
        return res.status(400).json({ message: "Bot token and client ID are required" });
      }
      
      // Initialize the bot
      const result = await initializeDiscordBot(token, clientId);
      
      if (result.success) {
        // Save token and client ID to integration settings
        const tokenSetting = await storage.getIntegrationSettingByKey("discord", "bot_token");
        if (tokenSetting) {
          await storage.updateIntegrationSetting(tokenSetting.id, {
            value: token,
            enabled: true
          });
        } else {
          await storage.createIntegrationSetting({
            service: "discord",
            key: "bot_token",
            value: token,
            enabled: true
          });
        }
        
        const clientIdSetting = await storage.getIntegrationSettingByKey("discord", "bot_client_id");
        if (clientIdSetting) {
          await storage.updateIntegrationSetting(clientIdSetting.id, {
            value: clientId,
            enabled: true
          });
        } else {
          await storage.createIntegrationSetting({
            service: "discord",
            key: "bot_client_id",
            value: clientId,
            enabled: true
          });
        }
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "initialize",
          resourceType: "discord_bot",
          resourceId: "bot",
          details: { success: true }
        });
        
        return res.json({ message: "Discord bot initialized successfully" });
      } else {
        // Log the failure
        if (req.user) {
          await storage.createActivityLog({
            userId: req.user.id,
            action: "initialize",
            resourceType: "discord_bot",
            resourceId: "bot",
            details: { success: false, error: result.message }
          });
        }
        
        return res.status(500).json({ message: result.message });
      }
    } catch (error) {
      console.error("Discord bot initialization error:", error);
      res.status(500).json({ message: "Failed to initialize Discord bot" });
    }
  });
  
  // Get the status of the Discord bot
  app.get("/api/discord/bot/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const status = getDiscordBotStatus();
      res.json(status);
    } catch (error) {
      console.error("Discord bot status error:", error);
      res.status(500).json({ message: "Failed to get Discord bot status" });
    }
  });
  
  // Start the bot with saved credentials
  app.post("/api/discord/bot/start", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Get saved token and client ID
      const tokenSetting = await storage.getIntegrationSettingByKey("discord", "bot_token");
      const clientIdSetting = await storage.getIntegrationSettingByKey("discord", "bot_client_id");
      
      if (!tokenSetting?.enabled || !tokenSetting.value || !clientIdSetting?.enabled || !clientIdSetting.value) {
        return res.status(400).json({ message: "Discord bot token or client ID not configured" });
      }
      
      const result = await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      
      if (result.success) {
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: "start",
          resourceType: "discord_bot",
          resourceId: "bot",
          details: { success: true }
        });
        
        return res.json({ message: "Discord bot started successfully" });
      } else {
        // Log the failure
        if (req.user) {
          await storage.createActivityLog({
            userId: req.user.id,
            action: "start",
            resourceType: "discord_bot",
            resourceId: "bot",
            details: { success: false, error: result.message }
          });
        }
        
        return res.status(500).json({ message: result.message });
      }
    } catch (error) {
      console.error("Discord bot start error:", error);
      res.status(500).json({ message: "Failed to start Discord bot" });
    }
  });
  
  // Stop the Discord bot
  app.post("/api/discord/bot/stop", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!client) {
        return res.status(400).json({ message: "Discord bot is not running" });
      }
      
      await client.destroy();
      client = null;
      isInitialized = false;
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: "stop",
        resourceType: "discord_bot",
        resourceId: "bot",
        details: { success: true }
      });
      
      res.json({ message: "Discord bot stopped successfully" });
    } catch (error) {
      console.error("Discord bot stop error:", error);
      res.status(500).json({ message: "Failed to stop Discord bot" });
    }
  });
}

// Auto-start the bot when the server starts (if credentials are configured)
export const autoStartDiscordBot = async () => {
  try {
    const tokenSetting = await storage.getIntegrationSettingByKey("discord", "bot_token");
    const clientIdSetting = await storage.getIntegrationSettingByKey("discord", "bot_client_id");
    
    if (tokenSetting?.enabled && tokenSetting.value && clientIdSetting?.enabled && clientIdSetting.value) {
      console.log("Auto-starting Discord bot...");
      const result = await initializeDiscordBot(tokenSetting.value, clientIdSetting.value);
      
      if (result.success) {
        console.log("Discord bot auto-started successfully");
      } else {
        console.error("Failed to auto-start Discord bot:", result.message);
      }
    }
  } catch (error) {
    console.error("Error auto-starting Discord bot:", error);
  }
};