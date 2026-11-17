# AeroLab pages and API configuration

- `/` redirects to `/research`, the Research Analytics homepage.
- `/research` loads the run selector and all three research charts.
- `/demo` loads the NASA prediction, sweep, comparison, and training tools.

Both pages are enabled in development and production. They share the
`API_BASE_URL` injection token in `src/app/api-config.ts`. By default it uses
`http://127.0.0.1:8000` in development and the existing Azure API in production.
Set the `aerolab-api-base-url` meta tag in `src/index.html` to override it:

```html
<meta name="aerolab-api-base-url" content="https://your-api.example">
```

The same setting can be changed in the generated `index.html` before serving
the build. It is public configuration, so never put secrets in it. Relative
base paths such as `/api` are also supported when a reverse proxy is available.
HTTPS frontends require an HTTPS API.

The backend must expose `/research/runs` and `/research/action-lift`, have access
to its observations CSV, and allow the frontend origin through `FRONTEND_ORIGINS`
when hosted on a different origin. Enabling the frontend does not deploy or
update the API. No experimental records are embedded in the frontend or copied
to public assets; research observations are fetched at runtime.

Azure Static Web Apps receives `public/staticwebapp.config.json` for SPA route
fallback. Other hosts must similarly serve `index.html` for direct visits to
`/research` and `/demo`.

## Local checks

From the repository root, start FastAPI:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

From `frontend`, run `npm start`. Visit `/`, select a research run, navigate to
`/demo`, then return to `/research`. Research and demo requests are only started
by their respective pages; navigation cancels pending requests and destroys
the page's Chart.js instances.

```powershell
npm run build -- --configuration development
npm run build -- --configuration production
npm test -- --watch=false --browsers=ChromeHeadless
```
