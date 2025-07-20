import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { App } from './app/app';
import { serverRoutes } from './app/app.routes.server';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { routes } from './app/app-routing-module';
import { CurrencyService } from './app/services/currency.service';

export default () => bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideServerRendering(withRoutes(serverRoutes)),
    CurrencyService
  ]
});
