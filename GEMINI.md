# Gemini Instructions for Angular/Medplum LIMS App Project

## Project Overview
This is an Angular-based Laboratory Information Management System (LIMS) application built with Medplum. The project uses modern TypeScript/Angular patterns and integrates with FHIR-based healthcare data standards.

## Development Environment Setup

### Package Management
- **ALWAYS use `uv` CLI wrapper** for all Python-related commands
- Examples:
  - `uv pip install <package>`
  - `uv alembic upgrade head`
  - Never use system pip or venv directly

### Code Quality Tools
- **Python**: Use Ruff for linting and formatting
- **TypeScript/JavaScript**: Use Biome for linting and formatting
- **Lint command**: Only run in the `lims-app` directory

## Coding Standards

### TypeScript/Angular Best Practices
1. **Service Architecture**: Follow the existing service pattern seen in `qr-scanner.service.ts`
   - Use dependency injection properly
   - Implement proper observables with RxJS
   - Create clear interfaces for data structures
   - Use BehaviorSubject and Subject appropriately

2. **Import Management**:
   - Use relative imports as configured in VSCode settings
   - Enable auto-imports for better development experience
   - Follow Angular's import organization patterns

3. **Type Safety**:
   - Always define proper TypeScript interfaces
   - Use strict typing for FHIR data structures
   - Define clear return types for all methods

4. **Error Handling**:
   - Implement proper error handling services
   - Use notification services for user feedback
   - Follow the existing error handling patterns

### Angular Configuration
- **Ivy Rendering Engine**: Enabled and preferred
- **Strict Mode**: Currently disabled but follow strict typing principles
- **Template Type Checker**: Enabled for better template safety

### File Organization
- Place services in appropriate service directories
- Use proper Angular file naming conventions (`.service.ts`, `.component.ts`, etc.)
- Organize imports logically (Angular core, third-party, local)

## Development Workflow

### When Writing Code:
1. **Check existing patterns** in the codebase before implementing new features
2. **Use proper dependency injection** for all services
3. **Implement proper cleanup** in components (OnDestroy lifecycle)
4. **Follow the established service interfaces** like `ScanResult`, `ScannerConfig`

### When Debugging:
1. **Use Angular DevTools** for component inspection
2. **Leverage TypeScript strict checking** for compile-time error detection
3. **Check the browser console** for runtime errors
4. **Use proper logging** through established services

### When Editing Existing Code:
1. **Maintain existing code style** and patterns
2. **Update related tests** when modifying functionality
3. **Check for breaking changes** in dependent services
4. **Ensure proper typing** is maintained

## FHIR/Medplum Integration
- Use proper FHIR data types as defined in the project
- Follow Medplum's data handling patterns
- Implement proper validation for healthcare data
- Respect FHIR resource relationships

## Key Services to Understand
- **QrScannerService**: Handles QR code scanning functionality
- **ErrorHandlingService**: Centralized error management
- **NotificationService**: User notification system
- **SpecimenService**: Laboratory specimen management

## VSCode Configuration
The project is configured with:
- Auto-imports enabled
- Angular Language Server optimizations
- HTML/TypeScript integration
- Emmet support for templates

## Commands Reference
