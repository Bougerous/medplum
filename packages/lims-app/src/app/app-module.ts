import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { BrowserModule, provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Home } from './home/home';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { PatientRegistration } from './patient-registration/patient-registration';
import { SpecimenAccessioning } from './specimen-accessioning/specimen-accessioning';
import { TestOrdering } from './test-ordering/test-ordering';
import { ResultEntry } from './result-entry/result-entry';
import { SampleTracking } from './sample-tracking/sample-tracking';
import { Reports } from './reports/reports';

// Import portal components
import { PatientPortalComponent } from './portals/patient-portal/patient-portal';
import { ProviderPortalComponent } from './portals/provider-portal/provider-portal';
import { AccessDeniedComponent } from './components/access-denied/access-denied.component';

@NgModule({
  declarations: [
    App,
    Home,
    Login,
    Dashboard,
    PatientRegistration,
    SpecimenAccessioning,
    TestOrdering,
    ResultEntry
  ],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    SampleTracking,
    Reports,
    PatientPortalComponent,
    ProviderPortalComponent,
    AccessDeniedComponent
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay())
  ],
  bootstrap: [App]
})
export class AppModule { }
