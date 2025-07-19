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

const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard },
  { path: 'patient-registration', component: PatientRegistration },
  { path: 'specimen-accessioning', component: SpecimenAccessioning },
  { path: 'test-ordering', component: TestOrdering },
  { path: 'result-entry', component: ResultEntry },
  { path: 'sample-tracking', component: SampleTracking },
  { path: 'reports', component: Reports }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
