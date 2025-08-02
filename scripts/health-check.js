#!/usr/bin/env node

/**
 * Application Health Monitor
 * Checks the status of all integrations and core systems
 */

import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');

// Load environment variables
dotenv.config();

class HealthMonitor {
  constructor() {
    this.checks = [];
  }

  async runAllChecks() {
    console.log('🔍 Starting health checks...\n');

    await this.checkEnvironmentVariables();
    await this.checkDatabaseConfiguration();
    await this.checkAPIConfigurations();
    await this.checkFileStructure();
    await this.checkPortAvailability();

    return this.generateReport();
  }

  async checkEnvironmentVariables() {
    console.log('📋 Checking environment variables...');
    
    const requiredVars = [
      'DATABASE_URL',
      'SESSION_SECRET'
    ];

    const optionalVars = [
      'DISCORD_BOT_TOKEN',
      'AIRTABLE_API_KEY',
      'IMGUR_CLIENT_ID',
      'FACEBOOK_APP_ID'
    ];

    let missingRequired = 0;
    let missingOptional = 0;

    // Check required variables
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        missingRequired++;
      }
    });

    // Check optional variables
    optionalVars.forEach(varName => {
      if (!process.env[varName]) {
        missingOptional++;
      }
    });

    if (missingRequired > 0) {
      this.addCheck({
        name: 'Environment Variables',
        status: 'error',
        message: `Missing ${missingRequired} required environment variables`,
        timestamp: new Date().toISOString(),
        details: { requiredVars, missingRequired, missingOptional }
      });
    } else if (missingOptional > 0) {
      this.addCheck({
        name: 'Environment Variables',
        status: 'warning',
        message: `Missing ${missingOptional} optional environment variables`,
        timestamp: new Date().toISOString(),
        details: { optionalVars, missingOptional }
      });
    } else {
      this.addCheck({
        name: 'Environment Variables',
        status: 'healthy',
        message: 'All environment variables configured',
        timestamp: new Date().toISOString()
      });
    }
  }

  async checkDatabaseConfiguration() {
    console.log('🗄️  Checking database configuration...');
    
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl) {
      this.addCheck({
        name: 'Database Configuration',
        status: 'error',
        message: 'DATABASE_URL not configured',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      // Basic URL validation
      const url = new URL(dbUrl);
      
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('Invalid database protocol');
      }

      this.addCheck({
        name: 'Database Configuration',
        status: 'healthy',
        message: 'Database URL properly configured',
        timestamp: new Date().toISOString(),
        details: {
          protocol: url.protocol,
          host: url.hostname,
          database: url.pathname.slice(1)
        }
      });
    } catch (error) {
      this.addCheck({
        name: 'Database Configuration',
        status: 'error',
        message: 'Invalid database URL format',
        timestamp: new Date().toISOString(),
        details: { error: error.message }
      });
    }
  }

  async checkAPIConfigurations() {
    console.log('🔌 Checking API configurations...');
    
    const apiConfigs = {
      Discord: ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID'],
      Airtable: ['AIRTABLE_API_KEY'],
      Instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
      Imgur: ['IMGUR_CLIENT_ID', 'IMGUR_CLIENT_SECRET']
    };

    let configuredAPIs = 0;
    let totalAPIs = Object.keys(apiConfigs).length;

    Object.entries(apiConfigs).forEach(([apiName, vars]) => {
      const configuredVars = vars.filter(varName => process.env[varName]);
      
      if (configuredVars.length === vars.length) {
        configuredAPIs++;
      }
    });

    if (configuredAPIs === 0) {
      this.addCheck({
        name: 'API Configurations',
        status: 'warning',
        message: 'No external APIs configured',
        timestamp: new Date().toISOString(),
        details: { configuredAPIs, totalAPIs }
      });
    } else if (configuredAPIs < totalAPIs) {
      this.addCheck({
        name: 'API Configurations',
        status: 'warning',
        message: `${configuredAPIs}/${totalAPIs} APIs configured`,
        timestamp: new Date().toISOString(),
        details: { configuredAPIs, totalAPIs }
      });
    } else {
      this.addCheck({
        name: 'API Configurations',
        status: 'healthy',
        message: 'All APIs configured',
        timestamp: new Date().toISOString(),
        details: { configuredAPIs, totalAPIs }
      });
    }
  }

  async checkFileStructure() {
    console.log('📁 Checking file structure...');
    
    const fs = await import('fs');
    const requiredDirs = ['client', 'server', 'shared', 'tests'];
    const requiredFiles = ['package.json', 'tsconfig.json', 'README.md'];

    let missingDirs = [];
    let missingFiles = [];

    // Check directories
    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        missingDirs.push(dir);
      }
    });

    // Check files
    requiredFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        missingFiles.push(file);
      }
    });

    if (missingDirs.length > 0 || missingFiles.length > 0) {
      this.addCheck({
        name: 'File Structure',
        status: 'error',
        message: `Missing ${missingDirs.length} directories and ${missingFiles.length} files`,
        timestamp: new Date().toISOString(),
        details: { missingDirs, missingFiles }
      });
    } else {
      this.addCheck({
        name: 'File Structure',
        status: 'healthy',
        message: 'All required files and directories present',
        timestamp: new Date().toISOString()
      });
    }
  }

  async checkPortAvailability() {
    console.log('🌐 Checking port availability...');
    
    const net = await import('net');
    const port = process.env.PORT || 5000;

    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.close(() => {
          this.addCheck({
            name: 'Port Availability',
            status: 'healthy',
            message: `Port ${port} is available`,
            timestamp: new Date().toISOString(),
            details: { port }
          });
          resolve();
        });
      });

      server.on('error', () => {
        this.addCheck({
          name: 'Port Availability',
          status: 'warning',
          message: `Port ${port} is in use`,
          timestamp: new Date().toISOString(),
          details: { port }
        });
        resolve();
      });
    });
  }

  addCheck(check) {
    this.checks.push(check);
    
    const statusIcon = {
      healthy: '✅',
      warning: '⚠️',
      error: '❌'
    }[check.status];
    
    console.log(`   ${statusIcon} ${check.name}: ${check.message}`);
  }

  generateReport() {
    const summary = {
      healthy: this.checks.filter(c => c.status === 'healthy').length,
      warnings: this.checks.filter(c => c.status === 'warning').length,
      errors: this.checks.filter(c => c.status === 'error').length
    };

    let overall = 'healthy';
    if (summary.errors > 0) {
      overall = 'error';
    } else if (summary.warnings > 0) {
      overall = 'warning';
    }

    return {
      overall,
      timestamp: new Date().toISOString(),
      checks: this.checks,
      summary
    };
  }
}

// Main execution
async function main() {
  const monitor = new HealthMonitor();
  const report = await monitor.runAllChecks();

  console.log('\n📊 Health Check Summary:');
  console.log(`Overall Status: ${report.overall.toUpperCase()}`);
  console.log(`✅ Healthy: ${report.summary.healthy}`);
  console.log(`⚠️  Warnings: ${report.summary.warnings}`);
  console.log(`❌ Errors: ${report.summary.errors}`);
  console.log(`\nTimestamp: ${report.timestamp}`);

  // Exit with appropriate code
  if (report.overall === 'error') {
    process.exit(1);
  } else if (report.overall === 'warning') {
    process.exit(0); // Warnings don't fail the check
  } else {
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  });
}