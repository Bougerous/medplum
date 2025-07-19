# LIMS Workflow Automation Bots

This directory contains the TypeScript bot implementations for Medplum workflow automation.

## Bot Types

1. **Patient Registration Bot** - Processes QuestionnaireResponse resources to create Patient, Coverage, and Consent resources
2. **Order Splitting Bot** - Splits ServiceRequest resources into multiple specimens based on test requirements
3. **Billing Bot** - Creates Claim resources from finalized DiagnosticReport resources
4. **Workflow Validation Bot** - Validates DiagnosticReport resources for completeness and quality

## Bot Deployment

These bots are deployed to Medplum as Bot resources and triggered via Subscription resources.