import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, isDevMode, PLATFORM_ID } from '@angular/core';

// Set <meta name="aerolab-api-base-url" content="https://your-api.example"> in
// index.html to override the API for both pages without changing their code.
export const API_BASE_URL = new InjectionToken<string>('AeroLab API base URL', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    const configured = document.querySelector<HTMLMetaElement>('meta[name="aerolab-api-base-url"]')?.content.trim();
    const fallback = isDevMode()
      ? 'http://127.0.0.1:8000'
      : 'https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io';
    const url = new URL(configured || fallback, document.baseURI);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('AeroLab API URL must be an HTTP(S) base URL without credentials, query, or fragment.');
    }
    if (isPlatformBrowser(inject(PLATFORM_ID)) && document.location.protocol === 'https:' && url.protocol !== 'https:') {
      throw new Error('AeroLab requires an HTTPS API when the frontend uses HTTPS.');
    }
    return url.href.replace(/\/+$/, '');
  },
});
