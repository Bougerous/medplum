import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app/app';
import { routes } from './app/app-routing-module';
import { CurrencyService } from './app/services/currency.service';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    CurrencyService
  ]
}).catch(err => console.error(err));
