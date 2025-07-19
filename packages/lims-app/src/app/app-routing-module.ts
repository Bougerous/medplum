import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { PatientRegistration } from './patient-registration/patient-registration';
import { SpecimenAccessioning } from './specimen-accessioning/specimen-accessioning';
import { TestOrdering } from './test-ordering/test-ordering';
import { ResultEntry } from './result-entry/result-entry';
import { SampleTracking } from './sample-tracking/sample-tracking';
import { Reports } from './reports/reports';
import { PatientPortalComponent } from './portals/patient-portal/patient-portal';
import { ProviderPortalComponent } from './portals/provider-portal/provider-portal';
import { AccessDeniedComponent } from './components/access-denied/access-denied.component';
import { AuthGuard } from './guards/auth.guard';
import { PatientPortalGuard, ProviderPortalGuard } from './guards/portal.guard';

const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard, canActivate: [AuthGuard] },
  { path: 'patient-registration', component: PatientRegistration, canActivate: [AuthGuard] },
  { path: 'specimen-accessioning', component: SpecimenAccessioning, canActivate: [AuthGuard] },
  { path: 'test-ordering', component: TestOrdering, canActivate: [AuthGuard] },
  { path: 'result-entry', component: ResultEntry, canActivate: [AuthGuard] },
  { path: 'sample-tracking', component: SampleTracking, canActivate: [AuthGuard] },
  { path: 'reports', component: Reports, canActivate: [AuthGuard] },
  
  // Portal Routes
  { 
    path: 'patient-portal', 
    component: PatientPortalComponent, 
    canActivate: [PatientPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['patient'],
        resourceType: 'Patient',
        allowedActions: ['read', 'update']
      }
    }
  },
  { 
    path: 'provider-portal', 
    component: ProviderPortalComponent, 
    canActivate: [ProviderPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['provider'],
        requiresPatientRelationship: true,
        resourceType: 'ServiceRequest',
        allowedActions: ['read', 'create', 'update']
      }
    }
  },
  
  // Portal sub-routes (for future expansion)
  { 
    path: 'patient-portal/report/:id', 
    component: PatientPortalComponent, // Would be a specific report component
    canActivate: [PatientPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['patient'],
        resourceType: 'DiagnosticReport',
        allowedActions: ['read']
      }
    }
  },
  { 
    path: 'provider-portal/report/:id', 
    component: ProviderPortalComponent, // Would be a specific report component
    canActivate: [ProviderPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['provider'],
        requiresPatientRelationship: true,
        resourceType: 'DiagnosticReport',
        allowedActions: ['read']
      }
    }
  },
  { 
    path: 'provider-portal/order/:id', 
    component: ProviderPortalComponent, // Would be a specific order component
    canActivate: [ProviderPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['provider'],
        resourceType: 'ServiceRequest',
        allowedActions: ['read', 'update']
      }
    }
  },
  { 
    path: 'provider-portal/patient/:id', 
    component: ProviderPortalComponent, // Would be a specific patient component
    canActivate: [ProviderPortalGuard],
    data: {
      portalConfig: {
        requiredRoles: ['provider'],
        requiresPatientRelationship: true,
        resourceType: 'Patient',
        allowedActions: ['read']
      }
    }
  },
  
  // Error routes
  { path: 'access-denied', component: AccessDeniedComponent },
  { path: 'error', component: AccessDeniedComponent }, // Generic error page
  
  // Catch-all redirect
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
