/**
 * LIMS Workflow Automation Bots
 * 
 * This module exports all the bot implementations for Medplum workflow automation.
 * Each bot is a TypeScript function that can be deployed to Medplum as a Bot resource.
 */

export { handler as billingAutomationBot } from './billing-automation-bot';
export { handler as orderSplittingBot } from './order-splitting-bot';
export { handler as patientRegistrationBot } from './patient-registration-bot';
export { handler as workflowValidationBot } from './workflow-validation-bot';

/**
 * Bot deployment configurations
 */
export const BOT_CONFIGURATIONS = {
  patientRegistration: {
    name: 'Patient Registration Bot',
    description: 'Automatically process patient registration from questionnaire responses',
    triggers: [{
      resourceType: 'QuestionnaireResponse',
      criteria: 'QuestionnaireResponse?questionnaire=patient-registration',
      event: 'create' as const
    }],
    sourceCodePath: './patient-registration-bot.ts'
  },

  orderSplitting: {
    name: 'Order Splitting Bot',
    description: 'Automatically split service requests into multiple specimens',
    triggers: [{
      resourceType: 'ServiceRequest',
      criteria: 'ServiceRequest?status=active',
      event: 'create' as const
    }],
    sourceCodePath: './order-splitting-bot.ts'
  },

  billingAutomation: {
    name: 'Billing Automation Bot',
    description: 'Automatically create claims for finalized diagnostic reports',
    triggers: [{
      resourceType: 'DiagnosticReport',
      criteria: 'DiagnosticReport?status=final',
      event: 'update' as const
    }],
    sourceCodePath: './billing-automation-bot.ts'
  },

  workflowValidation: {
    name: 'Workflow Validation Bot',
    description: 'Validate diagnostic reports for completeness and quality',
    triggers: [{
      resourceType: 'DiagnosticReport',
      criteria: 'DiagnosticReport?status=preliminary',
      event: 'update' as const
    }],
    sourceCodePath: './workflow-validation-bot.ts'
  }
};

/**
 * Bot deployment helper
 */
export interface BotDeploymentConfig {
  name: string;
  description: string;
  triggers: Array<{
    resourceType: string;
    criteria: string;
    event: 'create' | 'update' | 'delete';
  }>;
  sourceCodePath: string;
}

/**
 * Get all bot configurations
 */
export function getAllBotConfigurations(): Record<string, BotDeploymentConfig> {
  return BOT_CONFIGURATIONS;
}

/**
 * Get bot configuration by name
 */
export function getBotConfiguration(name: keyof typeof BOT_CONFIGURATIONS): BotDeploymentConfig {
  return BOT_CONFIGURATIONS[name];
}