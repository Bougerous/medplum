Of course. Here is an ultra-detailed to-do list to accomplish the task of building a comprehensive Laboratory Information Management System (LIMS) on the Medplum platform, based on the provided blueprint.

### **Phase 1: Core LIMS and General Workflow (Minimum Viable Product)**

This phase focuses on establishing the foundational architecture and implementing the core workflows necessary for basic laboratory operations.

#### **Part 1: Foundational Architecture & Setup**

*   **[ ] 1.1. Project Kick-off & Team Onboarding**
    *   [ ] 1.1.1. Assemble the core development, DevOps, and product teams.
    *   [ ] 1.1.2. Conduct training sessions on the Medplum ecosystem:
        *   [ ] Clinical Data Repository (CDR) and the FHIR-native model.
        *   [ ] Medplum RESTful API fundamentals.
        *   [ ] Medplum Bots & Subscriptions for workflow automation.
        *   [ ] Medplum SDK (`@medplum/core`) and React Component Library (`@medplum/react`).
    *   [ ] 1.1.3. Review Medplum's Storybook documentation for available UI components.

*   **[ ] 1.2. Platform Deployment & Configuration**
    *   [ ] 1.2.1. **Decision:** Finalize the deployment model. (Recommendation: Medplum Hosted Service).
    *   [ ] 1.2.2. If using Hosted Service:
        *   [ ] Procure a Medplum Hosted Service plan.
        *   [ ] Receive and securely store access credentials.
        *   [ ] Review provided compliance documentation (HIPAA, SOC 2).
    *   [ ] 1.2.3. If Self-Hosting:
        *   [ ] Allocate DevOps resources.
        *   [ ] Choose a cloud provider (Recommendation: AWS).
        *   [ ] Deploy the Medplum stack using the provided templates.
        *   [ ] Develop a plan and timeline for achieving HIPAA and SOC 2 compliance.

*   **[ ] 1.3. Identity and Access Management (IAM) Configuration**
    *   [ ] 1.3.1. Create the primary Medplum `Project` for the LIMS.
    *   [ ] 1.3.2. Define all user roles required for the MVP (e.g., Lab Technician, Lab Manager, Pathologist, Biller, Administrator).
    *   [ ] 1.3.3. For each role, create a corresponding `AccessPolicy` resource.
        *   [ ] Write granular access rules using FHIRPath.
        *   [ ] Example Rule: A Pathologist can only read a `DiagnosticReport` if they are the `resultsInterpreter`.
        *   [ ] Example Rule: A Lab Technician can create `Specimen` resources but cannot finalize a `DiagnosticReport`.
    *   [ ] 1.3.4. Establish the user onboarding process:
        *   [ ] Create a `Practitioner` resource for each new staff member to serve as their profile.
        *   [ ] Create a `User` resource for their login credentials.
        *   [ ] Create a `ProjectMembership` resource to link the `User` to the `Project` with the correct `Practitioner` profile and `AccessPolicy`.

#### **Part 2: Pre-Analytical Workflow Implementation**

*   **[ ] 2.1. Patient & Specimen Accessioning UI/UX**
    *   [ ] 2.1.1. **Patient Registration:**
        *   [ ] Design the patient registration UI.
        *   [ ] Create a FHIR `Questionnaire` resource defining all patient intake fields (demographics, insurance, consents).
        *   [ ] Build the UI using the `@medplum/react` `QuestionnaireForm` component.
        *   [ ] Develop a Medplum Bot (`patient-onboarding-bot`) triggered by the `QuestionnaireResponse`.
        *   [ ] Bot Logic: Validate data, use `createResourceIfNoneExist` to prevent duplicate `Patient` records, and create associated `Coverage` and `Consent` resources.
    *   [ ] 2.1.2. **Specimen Accessioning:**
        *   [ ] Design the specimen accessioning UI.
        *   [ ] Build the UI to create a FHIR `Specimen` resource, capturing `type`, `subject` (link to Patient), `collection` details, and generating a unique `accessionIdentifier`.

*   **[ ] 2.2. Test Ordering & Tracking**
    *   [ ] 2.2.1. **Order Management:**
        *   [ ] Model the lab's test compendium using LOINC codes.
        *   [ ] Build a basic internal interface for creating a `ServiceRequest` (the "order").
        *   [ ] Implement logic to manage the `ServiceRequest.status` lifecycle (`draft`, `active`, `completed`).
    *   [ ] 2.2.2. **Workflow Automation:**
        *   [ ] Create a `Subscription` that listens for `ServiceRequest` status changes to trigger downstream analytical processes.

*   **[ ] 2.3. Specimen Labeling & Tracking**
    *   [ ] 2.3.1. **QR Code Generation:**
        *   [ ] Select and install a client-side QR code library (Recommendation: `react-qr-code`).
        *   [ ] Create a `Subscription` that triggers on the creation of a new `Specimen`.
        *   [ ] Implement the workflow: The `Subscription` notifies the accessioning UI, which then uses the `Specimen.accessionIdentifier` to generate a QR code.
    *   [ ] 2.3.2. **Label Printing:**
        *   [ ] Procure specialized label printers (e.g., Zebra) and durable labels (e.g., Cryo-Babies).
        *   [ ] Design a printable HTML view that combines the QR code with human-readable patient/specimen details.
        *   [ ] Implement browser print functionality to send this view to the label printer.
    *   [ ] 2.3.3. **QR Code Scanning:**
        *   [ ] Implement a JavaScript event listener in the UI to capture input from USB/Bluetooth barcode scanners (keyboard wedge functionality).
        *   [ ] On scan, the UI should use the captured `accessionIdentifier` to fetch the corresponding `Specimen` resource from Medplum.

#### **Part 3: Post-Analytical Workflow (MVP)**

*   **[ ] 3.1. Reporting and Validation**
    *   [ ] 3.1.1. **Report Generation:**
        *   [ ] Develop a Bot or UI service to assemble a `DiagnosticReport`.
        *   [ ] This process should gather all `Observation` resources linked to a `ServiceRequest`.
        *   [ ] Implement PDF generation for the `presentedForm` of the report and attach it as a `Binary` resource.
    *   [ ] 3.1.2. **Validation Workflow:**
        *   [ ] Implement the `DiagnosticReport.status` lifecycle (`preliminary`, `final`, `amended`).
        *   [ ] Develop a Bot to enforce validation rules (e.g., cannot move to `final` until `resultsInterpreter` is populated).
        *   [ ] Implement a "digital sign-off" feature where a user action creates an `AuditEvent`, which is required by the validation Bot to release the report.

*   **[ ] 3.2. Role-Based User Interface (Core)**
    *   [ ] 3.2.1. Build the main SPA shell using React.
    *   [ ] 3.2.2. Implement login flow using `@medplum/react` `SignInForm`.
    *   [ ] 3.2.3. On login, the UI must fetch the user's `ProjectMembership` and `AccessPolicy`.
    *   [ ] 3.2.4. Implement logic to dynamically render UI elements (menus, buttons, data views) based on the user's role and permissions.

---

### **Phase 2: Advanced Analytical Modules and Portals**

This phase builds on the core system to add complex, discipline-specific workflows and external-facing portals.

*   **[ ] 4.1. Histopathology Workflow**
    *   [ ] 4.1.1. **Data Modeling:** Map the entire workflow (grossing, processing, etc.) to a sequence of `Procedure` and `Observation` resources, using SNOMED CT codes.
    *   [ ] 4.1.2. **Digital Pathology (WSI) Integration:**
        *   [ ] Procure a WSI scanner.
        *   [ ] Deploy the Medplum Agent on the lab's local network.
        *   [ ] Configure the Agent as a DICOM C-STORE endpoint to receive images from the scanner.
        *   [ ] Model WSI data using `ImagingStudy`, `Binary` (for the image file), and `Media` resources.
    *   [ ] 4.1.3. **WSI Viewer Integration:**
        *   [ ] Select and integrate a web-based WSI viewer (e.g., OpenSeadragon).
        *   [ ] Implement the workflow to fetch a presigned URL for the `Binary` image data and pass it to the viewer component.

*   **[ ] 4.2. Microbiology Workflow**
    *   [ ] 4.2.1. **Data Modeling:**
        *   [ ] Model organism identification using `Observation` with SNOMED CT codes.
        *   [ ] Model Antimicrobial Susceptibility Testing (AST) using a panel `Observation` with `hasMember` references to individual antibiotic `Observation`s.
        *   [ ] Ensure consistent use of LOINC for tests and SNOMED CT for organisms.

*   **[ ] 4.3. Patient & Provider Portals**
    *   [ ] 4.3.1. **Patient Portal:**
        *   [ ] Build a separate React application for the patient portal.
        *   [ ] Create a restrictive `AccessPolicy` for patients, limiting access to their own data.
        *   [ ] Implement features: view results (`DiagnosticReport`), schedule appointments, secure messaging (`Communication`), and view/complete `Questionnaire` forms.
    *   [ ] 4.3.2. **Provider Portal:**
        *   [ ] Build a separate React application for referring providers.
        *   [ ] Create an `AccessPolicy` for providers, limiting data access to patients with whom they have a documented relationship.
        *   [ ] Implement features: Electronic Order Entry (CPOE) for `ServiceRequest`, real-time order status tracking, and secure result delivery.

---

### **Phase 3: Full Revenue Cycle Management and Analytics**

This phase focuses on commercial viability by implementing a complete RCM module and advanced analytics.

*   **[ ] 5.1. Revenue Cycle Management (RCM) Automation**
    *   [ ] 5.1.1. **Billing Integration:**
        *   [ ] Select and contract with a billing partner (Recommendation: Candid Health).
        *   [ ] Configure and deploy the Medplum "Candid bot" for integration.
    *   [ ] 5.1.2. **Claim Generation Workflow:**
        *   [ ] Create a `Subscription` to trigger a "Billing Bot" when a `DiagnosticReport` status becomes `final`.
        *   [ ] Develop the Billing Bot to gather all related resources (`Patient`, `Coverage`, `ServiceRequest`) and construct a FHIR `Claim` resource.
        *   [ ] The Bot submits the claim data to the billing partner via their API.
    *   [ ] 5.1.3. **Adjudication & Response:**
        *   [ ] Implement the workflow to receive adjudication data (as a `ClaimResponse`) back from the billing partner.
        *   [ ] Develop a Bot to create a consolidated `ExplanationOfBenefit` (EOB) from the `Claim` and `ClaimResponse`.

*   **[ ] 5.2. Payment Processing**
    *   [ ] 5.2.1. **Patient Payments:**
        *   [ ] Integrate with a payment processor (Recommendation: Stripe).
        *   [ ] Develop a Bot to create a Stripe payment link from a Medplum `Invoice` resource.
        *   [ ] Create a webhook endpoint to listen for payment confirmation from Stripe.
        *   [ ] The webhook triggers a Bot to create a `PaymentReconciliation` resource, closing the loop on the patient's invoice.
    *   [ ] 5.2.2. **Insurance Payments:**
        *   [ ] Design and build the UI and logic for manually or electronically recording bulk insurance payments using the `PaymentReconciliation` resource.

*   **[ ] 5.3. Advanced Analytics**
    *   [ ] 5.3.1. **Operational Dashboards:**
        *   [ ] Design and build interactive dashboards within the LIMS for roles like Lab Manager.
        *   [ ] Power each dashboard widget with a targeted FHIR search query (e.g., turnaround time, specimen volume).
    *   [ ] 5.3.2. **Bulk Data Export & Analysis:**
        *   [ ] Establish a process for using the FHIR Bulk Data Export API for retrospective analysis.
        *   [ ] Set up a data warehouse or data lake for ingesting exported data.
        *   [ ] Develop a de-identification pipeline using `AccessPolicy` for privacy-sensitive research.