/**
 * API Status Checker
 * Provides utilities for checking the status of various integration APIs
 */
import axios from 'axios';
import { storage } from './storage';
import { IntegrationSetting } from '@shared/schema';

interface ApiStatus {
  name: string;
  status: 'online' | 'offline' | 'unknown';
  message?: string;
  lastChecked: Date;
}

interface ApiStatusResponse {
  statuses: ApiStatus[];
  timestamp: Date;
}

/**
 * Check Airtable API status
 */
async function checkAirtableStatus(): Promise<ApiStatus> {
  try {
    // Get Airtable API key from integration settings
    const setting = await storage.getIntegrationSettingByKey('airtable', 'api_key');
    
    if (!setting?.value) {
      return {
        name: 'Airtable',
        status: 'unknown',
        message: 'API key not configured',
        lastChecked: new Date()
      };
    }
    
    // Make a simple API call to check status
    const response = await axios.get('https://api.airtable.com/v0/meta/bases', {
      headers: {
        Authorization: `Bearer ${setting.value}`
      }
    });
    
    return {
      name: 'Airtable',
      status: response.status >= 200 && response.status < 300 ? 'online' : 'offline',
      lastChecked: new Date()
    };
  } catch (error) {
    return {
      name: 'Airtable',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date()
    };
  }
}

/**
 * Check Instagram API status
 */
async function checkInstagramStatus(): Promise<ApiStatus> {
  try {
    // Get Instagram API credentials from integration settings
    const accessToken = await storage.getIntegrationSettingByKey('instagram', 'access_token');
    
    if (!accessToken?.value) {
      return {
        name: 'Instagram',
        status: 'unknown',
        message: 'Access token not configured',
        lastChecked: new Date()
      };
    }
    
    // Check Instagram API status
    const response = await axios.get(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken.value}`);
    
    return {
      name: 'Instagram',
      status: response.status >= 200 && response.status < 300 ? 'online' : 'offline',
      lastChecked: new Date()
    };
  } catch (error) {
    return {
      name: 'Instagram',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date()
    };
  }
}

/**
 * Check ImgBB API status
 */
async function checkImgBBStatus(): Promise<ApiStatus> {
  try {
    // Get ImgBB API key from integration settings
    const setting = await storage.getIntegrationSettingByKey('imgbb', 'api_key');
    
    if (!setting?.value) {
      return {
        name: 'ImgBB',
        status: 'unknown',
        message: 'API key not configured',
        lastChecked: new Date()
      };
    }
    
    // ImgBB doesn't have a dedicated status endpoint, we'll check by making a simple API request
    const response = await axios.get(`https://api.imgbb.com/1/upload?key=${setting.value}`, { 
      timeout: 5000 
    });
    
    return {
      name: 'ImgBB',
      status: 'online', // If no error is thrown, we assume it's online
      lastChecked: new Date()
    };
  } catch (error) {
    // We expect a 400 error because we didn't provide an image, but the API is still online
    const err = error as any;
    const isExpectedError = err.response && err.response.status === 400;
    
    return {
      name: 'ImgBB',
      status: isExpectedError ? 'online' : 'offline',
      message: isExpectedError ? undefined : (error instanceof Error ? error.message : 'Unknown error'),
      lastChecked: new Date()
    };
  }
}

/**
 * Check database status
 */
async function checkDatabaseStatus(): Promise<ApiStatus> {
  try {
    // Simply try to run a database query
    const users = await storage.getAllUsers();
    
    return {
      name: 'Database',
      status: 'online',
      lastChecked: new Date()
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'offline',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date()
    };
  }
}

/**
 * Get the status of all APIs
 */
export async function getAllApiStatuses(): Promise<ApiStatusResponse> {
  // Run all checks concurrently for better performance
  const [airtable, instagram, imgbb, database] = await Promise.all([
    checkAirtableStatus(),
    checkInstagramStatus(),
    checkImgBBStatus(),
    checkDatabaseStatus()
  ]);
  
  return {
    statuses: [airtable, instagram, imgbb, database],
    timestamp: new Date()
  };
}
