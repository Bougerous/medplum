import { MedplumClient } from '@medplum/core';
import { Bot, Subscription } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllBotConfigurations } from './index';

/**
 * Bot Deployment Script
 * 
 * This script deploys all LIMS workflow automation bots to a Medplum instance.
 * It creates Bot resources and sets up the necessary Subscription resources
 * to trigger the bots based on FHIR resource events.
 */

export class BotDeployer {
  constructor(private medplum: MedplumClient) {}

  /**
   * Deploy all bots to Medplum
   */
  async deployAllBots(): Promise<void> {
    console.log('Starting bot deployment...');
    
    const configurations = getAllBotConfigurations();
    
    for (const [botName, config] of Object.entries(configurations)) {
      try {
        console.log(`Deploying ${config.name}...`);
        
        // Read bot source code
        const sourceCode = this.readBotSourceCode(config.sourceCodePath);
        
        // Create or update bot
        const bot = await this.createOrUpdateBot(botName, config, sourceCode);
        
        // Create subscriptions for bot triggers
        await this.createBotSubscriptions(bot, config.triggers);
        
        console.log(`✅ Successfully deployed ${config.name} (ID: ${bot.id})`);
        
      } catch (error) {
        console.error(`❌ Failed to deploy ${config.name}:`, error);
      }
    }
    
    console.log('Bot deployment completed.');
  }

  /**
   * Deploy a specific bot
   */
  async deployBot(botName: string): Promise<void> {
    const configurations = getAllBotConfigurations();
    const config = configurations[botName];
    
    if (!config) {
      throw new Error(`Bot configuration not found: ${botName}`);
    }
    
    console.log(`Deploying ${config.name}...`);
    
    // Read bot source code
    const sourceCode = this.readBotSourceCode(config.sourceCodePath);
    
    // Create or update bot
    const bot = await this.createOrUpdateBot(botName, config, sourceCode);
    
    // Create subscriptions for bot triggers
    await this.createBotSubscriptions(bot, config.triggers);
    
    console.log(`✅ Successfully deployed ${config.name} (ID: ${bot.id})`);
  }

  /**
   * Read bot source code from file
   */
  private readBotSourceCode(sourceCodePath: string): string {
    try {
      const fullPath = join(__dirname, sourceCodePath);
      return readFileSync(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read bot source code from ${sourceCodePath}: ${error}`);
    }
  }

  /**
   * Create or update a bot resource
   */
  private async createOrUpdateBot(
    botName: string, 
    config: any, 
    sourceCode: string
  ): Promise<Bot> {
    // Check if bot already exists
    const existingBots = await this.medplum.searchResources('Bot', {
      name: config.name
    });
    
    const botData: Bot = {
      resourceType: 'Bot',
      name: config.name,
      description: config.description,
      sourceCode: {
        contentType: 'application/typescript',
        data: btoa(sourceCode) // Base64 encode the source code
      }
    };
    
    if (existingBots.length > 0) {
      // Update existing bot
      const existingBot = existingBots[0];
      const updatedBot: Bot = {
        ...existingBot,
        ...botData
      };
      
      return await this.medplum.updateResource(updatedBot);
    } else {
      // Create new bot
      return await this.medplum.createResource(botData);
    }
  }

  /**
   * Create subscriptions for bot triggers
   */
  private async createBotSubscriptions(
    bot: Bot, 
    triggers: Array<{
      resourceType: string;
      criteria: string;
      event: 'create' | 'update' | 'delete';
    }>
  ): Promise<void> {
    // Remove existing subscriptions for this bot
    await this.removeExistingSubscriptions(bot);
    
    // Create new subscriptions
    for (const trigger of triggers) {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: `Bot trigger for ${bot.name}`,
        criteria: trigger.criteria,
        channel: {
          type: 'rest-hook',
          endpoint: `https://api.medplum.com/fhir/R4/Bot/${bot.id}/$execute`,
          payload: 'application/fhir+json',
          header: [
            'Authorization: Bearer [ACCESS_TOKEN]'
          ]
        },
        extension: [{
          url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
          valueCode: trigger.event
        }]
      };
      
      await this.medplum.createResource(subscription);
      console.log(`  📡 Created subscription for ${trigger.resourceType} ${trigger.event} events`);
    }
  }

  /**
   * Remove existing subscriptions for a bot
   */
  private async removeExistingSubscriptions(bot: Bot): Promise<void> {
    const existingSubscriptions = await this.medplum.searchResources('Subscription', {
      url: `https://api.medplum.com/fhir/R4/Bot/${bot.id}/$execute`
    });
    
    for (const subscription of existingSubscriptions) {
      await this.medplum.deleteResource('Subscription', subscription.id!);
    }
  }

  /**
   * List all deployed bots
   */
  async listDeployedBots(): Promise<void> {
    console.log('Deployed LIMS Bots:');
    console.log('==================');
    
    const bots = await this.medplum.searchResources('Bot', {});
    const limsBotsNames = Object.values(getAllBotConfigurations()).map(config => config.name);
    
    const limsBots = bots.filter(bot => limsBotsNames.includes(bot.name || ''));
    
    if (limsBots.length === 0) {
      console.log('No LIMS bots found.');
      return;
    }
    
    for (const bot of limsBots) {
      console.log(`\n🤖 ${bot.name} (ID: ${bot.id})`);
      console.log(`   Description: ${bot.description}`);
      
      // Get subscriptions for this bot
      const subscriptions = await this.medplum.searchResources('Subscription', {
        url: `https://api.medplum.com/fhir/R4/Bot/${bot.id}/$execute`
      });
      
      if (subscriptions.length > 0) {
        console.log('   Triggers:');
        for (const subscription of subscriptions) {
          console.log(`   - ${subscription.criteria} (${subscription.status})`);
        }
      } else {
        console.log('   No active triggers');
      }
    }
  }

  /**
   * Test a bot with sample data
   */
  async testBot(botId: string, testData: any): Promise<any> {
    console.log(`Testing bot ${botId}...`);
    
    try {
      const result = await this.medplum.executeBot(botId, testData);
      console.log('✅ Bot test successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Bot test failed:', error);
      throw error;
    }
  }

  /**
   * Monitor bot executions
   */
  async monitorBotExecutions(botId?: string): Promise<void> {
    console.log('Monitoring bot executions...');
    
    // In a real implementation, this would set up monitoring
    // For now, we'll just query recent AuditEvent resources
    const auditEvents = await this.medplum.searchResources('AuditEvent', {
      entity: botId ? `Bot/${botId}` : 'Bot',
      _sort: '-date',
      _count: '10'
    });
    
    console.log(`Found ${auditEvents.length} recent bot executions:`);
    
    for (const event of auditEvents) {
      console.log(`\n📊 ${event.recorded}`);
      console.log(`   Outcome: ${event.outcome === '0' ? 'Success' : 'Error'}`);
      console.log(`   Agent: ${event.agent?.[0]?.who?.display || 'Unknown'}`);
      console.log(`   Entity: ${event.entity?.[0]?.what?.reference || 'Unknown'}`);
    }
  }
}

/**
 * CLI interface for bot deployment
 */
export async function deployBotsFromCLI(): Promise<void> {
  // This would typically get the MedplumClient from environment configuration
  // For now, we'll assume it's configured elsewhere
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  // This is a placeholder - in a real implementation, you'd initialize the MedplumClient
  // with proper authentication and configuration
  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/',
    clientId: process.env.MEDPLUM_CLIENT_ID,
    clientSecret: process.env.MEDPLUM_CLIENT_SECRET
  });
  
  const deployer = new BotDeployer(medplum);
  
  switch (command) {
    case 'deploy':
      const botName = args[1];
      if (botName) {
        await deployer.deployBot(botName);
      } else {
        await deployer.deployAllBots();
      }
      break;
      
    case 'list':
      await deployer.listDeployedBots();
      break;
      
    case 'monitor':
      const monitorBotId = args[1];
      await deployer.monitorBotExecutions(monitorBotId);
      break;
      
    default:
      console.log('Usage:');
      console.log('  npm run deploy-bots deploy [botName]  - Deploy all bots or specific bot');
      console.log('  npm run deploy-bots list             - List deployed bots');
      console.log('  npm run deploy-bots monitor [botId]  - Monitor bot executions');
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  deployBotsFromCLI().catch(console.error);
}