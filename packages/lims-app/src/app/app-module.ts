import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule, provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { App } from './app';
import { AppRoutingModule } from './app-routing-module';
// import { AccessDeniedComponent } from './components/access-denied/access-denied.component';
import { Dashboard } from './dashboard/dashboard';
import { Home } from './home/home';
import { Login } from './login/login';
import { PatientRegistration } from './patient-registration/patient-registration';
// Import portal components
// import { PatientPortalComponent } from './portals/patient-portal/patient-portal';
// import { ProviderPortalComponent } from './portals/provider-portal/provider-portal';
import { Reports } from './reports/reports';
import { ResultEntry } from './result-entry/result-entry';
// import { SampleTracking } from './sample-tracking/sample-tracking';
// Import services
import { CurrencyService } from './services/currency.service';
import { SpecimenAccessioning } from './specimen-accessioning/specimen-accessioning';
import { TestOrdering } from './test-ordering/test-ordering';

@NgModule({
  declarations: [
    // All components are standalone, so they should be in imports, not declarations
  ],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    // Standalone components
    App,
    Home,
    Login,
    Dashboard,
    PatientRegistration,
    SpecimenAccessioning,
    TestOrdering,
    ResultEntry,
    Reports,
    // SampleTracking,
    // PatientPortalComponent,
    // ProviderPortalComponent,
    // AccessDeniedComponent
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay()),
    CurrencyService
  ],
  bootstrap: [App]
})
export class AppModule { }
