# LIMS (Laboratory Information Management System)

A comprehensive Laboratory Information Management System built with Angular and designed to integrate with the Medplum platform for FHIR-compliant healthcare data management.

## Features

### Phase 1: Core LIMS Functionality (MVP)
- ✅ **Patient Registration**: Register new patients with demographics, contact information, and insurance details
- ✅ **Specimen Accessioning**: Process and track specimen collection with automated accession number generation
- ✅ **Test Ordering**: Create laboratory test orders with comprehensive test catalogs organized by specialty
- ✅ **Role-Based UI**: Clean, responsive interface with navigation between different modules

### Architecture Overview
- **Frontend**: Angular 20+ with TypeScript
- **Backend Ready**: Designed to integrate with Medplum FHIR server
- **Data Model**: FHIR R4 compliant resources (Patient, Specimen, ServiceRequest, DiagnosticReport)
- **Authentication**: Prepared for Medplum authentication integration
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Angular CLI 20+

### Installation

1. Navigate to the LIMS application directory:
```bash
cd packages/lims-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npx @angular/cli ng serve
```

4. Open your browser and navigate to `http://localhost:4200`

### Building for Production
```bash
npm run build
```

The built application will be available in the `dist/lims-app` directory.

## Application Modules

### 1. Home Dashboard
The main landing page provides navigation to all LIMS modules:
- Patient Registration
- Specimen Accessioning  
- Test Ordering

### 2. Patient Registration
**Features:**
- Patient demographics (name, DOB, gender)
- Contact information (phone, email, address)
- Insurance information (provider, policy number)
- FHIR Patient resource creation
- Form validation and error handling

**Workflow:**
1. Fill out patient information form
2. Submit to create Patient resource
3. Receive confirmation with patient ID

### 3. Specimen Accessioning
**Features:**
- Patient search and selection
- Specimen type selection (blood, urine, serum, etc.)
- Collection details (date, method, container)
- Automatic accession number generation
- QR code generation for specimen labeling
- Printable specimen labels

**Workflow:**
1. Search for existing patient
2. Enter specimen collection details
3. Submit to generate accession number
4. Print specimen label with QR code

### 4. Test Ordering
**Features:**
- Patient search and selection
- Provider information entry
- Test catalog organized by specialty:
  - Hematology (CBC, PT/PTT)
  - Chemistry (BMP, CMP, Lipid Panel)
  - Microbiology (Cultures)
  - Immunology (HIV, Hepatitis)
  - Molecular (COVID-19, Influenza PCR)
- Order priority setting (Routine, Urgent, STAT)
- Clinical information documentation
- LOINC code integration for standardization

**Workflow:**
1. Search for patient
2. Enter ordering provider information
3. Select tests from categorized catalog
4. Set priority and add clinical information
5. Submit to create ServiceRequest resources

## Technical Details

### Data Models
The application uses FHIR R4 resources:

**Patient Resource:**
```typescript
{
  resourceType: 'Patient',
  name: [{ family: 'Doe', given: ['John'] }],
  birthDate: '1980-01-01',
  gender: 'male',
  telecom: [{ system: 'phone', value: '555-1234' }]
}
```

**Specimen Resource:**
```typescript
{
  resourceType: 'Specimen',
  status: 'available',
  type: { text: 'blood' },
  subject: { reference: 'Patient/123' },
  accessionIdentifier: { value: 'SP20250719001' },
  collection: { collectedDateTime: '2025-07-19T10:00:00Z' }
}
```

**ServiceRequest Resource:**
```typescript
{
  resourceType: 'ServiceRequest',
  status: 'draft',
  intent: 'order',
  code: { text: 'Complete Blood Count' },
  subject: { reference: 'Patient/123' },
  requester: { display: 'Dr. Smith' }
}
```

### Development Notes

**Current Status:**
- Mock implementation for development/demonstration
- Ready for Medplum backend integration
- All FHIR resources properly modeled
- Responsive design implemented

**Next Steps for Production:**
1. Replace mock MedplumService with actual Medplum integration
2. Add authentication and authorization
3. Implement real-time notifications
4. Add reporting and analytics features
5. Deploy with proper HIPAA compliance measures

### File Structure
```
src/
├── app/
│   ├── home/                    # Dashboard component
│   ├── patient-registration/    # Patient intake module
│   ├── specimen-accessioning/   # Sample processing module
│   ├── test-ordering/          # Lab test ordering module
│   ├── medplum.service.ts      # Backend integration service
│   └── app-routing-module.ts   # Application routing
├── styles.scss                 # Global styles
└── index.html                  # Application shell
```

### Styling
- Custom SCSS styling with professional healthcare UI design
- Responsive grid layouts
- Form validation styling
- Interactive components with hover effects
- Print-friendly specimen labels

## Integration with Medplum

This application is designed to work with the Medplum platform:

1. **Replace Mock Service**: Update `medplum.service.ts` with actual Medplum client
2. **Authentication**: Implement Medplum authentication flow
3. **Error Handling**: Add proper error handling for network requests
4. **Real-time Updates**: Use Medplum subscriptions for live updates
5. **Compliance**: Leverage Medplum's HIPAA compliance features

### Example Medplum Integration
```typescript
// Replace mock implementation in medplum.service.ts
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  clientId: 'your-client-id'
});
```

## Contributing

1. Follow Angular style guide
2. Use TypeScript strict mode
3. Implement proper error handling
4. Add unit tests for components
5. Follow FHIR R4 specifications
6. Maintain HIPAA compliance considerations

## License

This project is part of the Medplum ecosystem and follows applicable licensing terms.

## Support

For questions or issues:
1. Check the Medplum documentation
2. Review FHIR R4 specifications
3. Consult Angular documentation for framework-specific issues
