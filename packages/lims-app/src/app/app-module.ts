import { NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule, provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Home } from './home/home';
import { PatientRegistration } from './patient-registration/patient-registration';
import { SpecimenAccessioning } from './specimen-accessioning/specimen-accessioning';
import { TestOrdering } from './test-ordering/test-ordering';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { Reports } from './reports/reports';
import { ResultEntry } from './result-entry/result-entry';
import { SampleTracking } from './sample-tracking/sample-tracking';

// Import the new terminology module
import { TerminologyModule } from './modules/terminology.module';

@NgModule({
  declarations: [
    App,
    Home,
    PatientRegistration,
    SpecimenAccessioning,
    TestOrdering,
    Login
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    Dashboard,
    Reports,
    ResultEntry,
    SampleTracking,
    TerminologyModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay())
  ],
  bootstrap: [App]
})
export class AppModule { }
