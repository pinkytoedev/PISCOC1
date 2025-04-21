/**
 * GitHub Integration
 * Provides functionality to connect to GitHub repositories and retrieve information.
 */
import { Request, Response, Express } from "express";
import axios from "axios";
import { storage } from "../storage";
import { log } from "../vite";

// GitHub API base URL
const GITHUB_API_BASE = "https://api.github.com";

/**
 * Configure GitHub routes
 */
export function setupGithubRoutes(app: Express) {
  // Get GitHub integration settings
  app.get('/api/github/settings', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const settings = await storage.getIntegrationSettings('github');
      res.json(settings);
    } catch (error) {
      console.error('Error fetching GitHub settings:', error);
      res.status(500).json({ 
        message: 'Failed to fetch GitHub settings',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update GitHub integration setting
  app.post('/api/github/settings/:key', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { key } = req.params;
      const { value, enabled } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ message: 'Value is required' });
      }
      
      // Check if setting already exists
      const setting = await storage.getIntegrationSettingByKey('github', key);
      
      if (setting) {
        // Update existing setting
        const updated = await storage.updateIntegrationSetting(setting.id, {
          value,
          enabled: enabled !== undefined ? enabled : setting.enabled
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'update',
          resourceType: 'integration_setting',
          resourceId: setting.id.toString(),
          details: { service: 'github', key }
        });
        
        res.json(updated);
      } else {
        // Create new setting
        const newSetting = await storage.createIntegrationSetting({
          service: 'github',
          key,
          value,
          enabled: enabled !== undefined ? enabled : true
        });
        
        // Log the activity
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'create',
          resourceType: 'integration_setting',
          resourceId: newSetting.id.toString(),
          details: { service: 'github', key }
        });
        
        res.status(201).json(newSetting);
      }
    } catch (error) {
      console.error('Error updating GitHub settings:', error);
      res.status(500).json({
        message: 'Failed to update GitHub settings',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get GitHub repository information
  app.get('/api/github/repository', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get GitHub settings
      const accessTokenSetting = await storage.getIntegrationSettingByKey('github', 'access_token');
      const repositorySetting = await storage.getIntegrationSettingByKey('github', 'repository');
      
      if (!accessTokenSetting?.value || !repositorySetting?.value) {
        return res.status(400).json({ 
          status: 'not_configured', 
          message: 'GitHub integration is not fully configured. Please provide access token and repository.'
        });
      }
      
      // Parse the repository string (format: owner/repo)
      const [owner, repo] = repositorySetting.value.split('/');
      
      if (!owner || !repo) {
        return res.status(400).json({ 
          message: 'Invalid repository format. Should be "owner/repo"' 
        });
      }
      
      // Get repository information
      const repoResponse = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `token ${accessTokenSetting.value}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      // Get issues
      const issuesResponse = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
        headers: {
          'Authorization': `token ${accessTokenSetting.value}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        params: {
          state: 'open',
          per_page: 5
        }
      });
      
      // Get commits
      const commitsResponse = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, {
        headers: {
          'Authorization': `token ${accessTokenSetting.value}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        params: {
          per_page: 5
        }
      });
      
      // Get pull requests
      const prResponse = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`, {
        headers: {
          'Authorization': `token ${accessTokenSetting.value}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        params: {
          state: 'open',
          per_page: 5
        }
      });
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'view',
        resourceType: 'github_repository',
        resourceId: repositorySetting.value,
        details: { repository: repositorySetting.value }
      });
      
      res.json({
        repository: repoResponse.data,
        issues: issuesResponse.data,
        commits: commitsResponse.data,
        pullRequests: prResponse.data
      });
    } catch (error) {
      log(`Error fetching GitHub repository information: ${error}`, 'github');
      
      // Check if this is an API rate limit error
      if (axios.isAxiosError(error) && error.response?.status === 403 && 
          error.response?.data?.message?.includes('API rate limit exceeded')) {
        return res.status(429).json({
          message: 'GitHub API rate limit exceeded. Please try again later.'
        });
      }
      
      // Check if it's an authentication error
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return res.status(401).json({
          message: 'GitHub API authentication failed. Please check your access token.'
        });
      }
      
      // Handle not found repository
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return res.status(404).json({
          message: 'GitHub repository not found. Please check the repository name.'
        });
      }
      
      res.status(500).json({
        message: 'Failed to fetch GitHub repository information',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Check GitHub API status
 * Used by the API status checker
 */
export async function checkGithubApiStatus() {
  try {
    // Get GitHub API token from integration settings
    const accessTokenSetting = await storage.getIntegrationSettingByKey('github', 'access_token');
    
    if (!accessTokenSetting?.value) {
      return {
        name: 'GitHub',
        status: 'unknown',
        message: 'API token not configured',
        lastChecked: new Date()
      };
    }
    
    // Check GitHub API status by making a simple API call to the user endpoint
    const response = await axios.get(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': `token ${accessTokenSetting.value}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    return {
      name: 'GitHub',
      status: response.status >= 200 && response.status < 300 ? 'online' : 'offline',
      lastChecked: new Date()
    };
  } catch (error) {
    return {
      name: 'GitHub',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date()
    };
  }
}