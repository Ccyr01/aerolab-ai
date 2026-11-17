# AeroLab AI deployment review

Prepared November 16, 2026 (America/Denver). Nothing staged, committed, pushed,
merged, remotely built, or deployed. No model training or scientific-data edits.

## Repository and scope

- Remote: `https://github.com/Ccyr01/aerolab-ai.git`.
- Checked out: `research-analytics`.
- Local `main`, `research-analytics`, and cached `origin/main` all point to
  `f7ed38a` (`Add professional project README`); branch divergence is 0/0.
- No remote `research-analytics` ref is present locally. No fetch was performed,
  so remote freshness is unverified.
- All dashboard work was already uncommitted. No branch switches were attempted.
- Git initially rejected the sandbox user's differing ownership. Read-only Git
  commands used a command-scoped `-c safe.directory=...`; no global config changed.
- Existing workflow `.github/workflows/azure-static-web-apps-happy-ocean-045bd8f1e.yml`
  publishes production on pushes to `main`; PRs targeting `main` can publish previews.
  Pushing `research-analytics` alone does not publish production.
- Workflow app location is `./frontend`, API location is empty, output location is
  `dist/frontend/browser`. The backend is not deployed by this workflow.

## Changes made during this review

- `.gitignore`: exclude unused feature matrix, local PowerShell cache, and Azure,
  AWS, and Docker credential directories. Existing generated-file rules retained.
- `.dockerignore`: exclude those local directories and generated `results/`;
  restrict `data/` to the NASA `.dat` and the four required research files.
- `Dockerfile`: explicit data copies; retain saved model in `backend/models/`,
  experiment runner, and `demo_results/` copied to container `/app/results/`.
  Default container `ENABLE_TRAINING=false`.
- `backend/main.py`: training guard returns 403 before calling the runner when
  `ENABLE_TRAINING` is anything except case-insensitive `true`, `1`, or `yes`.
  An unset variable enables local training. Production frontend origin is the
  default when `FRONTEND_ORIGINS` is unset; a supplied value overrides that default.
  Existing localhost origins remain allowed.
- `backend/test_production.py`: two tests exercise the training gate with a mocked
  runner; no model fitting occurs.
- This report. All frontend code, styling, labels, chart values, and research
  files were left as found.

## Complete modified and untracked file inventory

Modified tracked files (all should enter the release):

```text
.dockerignore
.gitignore
Dockerfile
backend/main.py
frontend/package-lock.json
frontend/package.json
frontend/src/app/app.config.ts
frontend/src/app/app.html
frontend/src/app/app.routes.ts
frontend/src/app/app.scss
frontend/src/app/app.spec.ts
frontend/src/app/app.ts
frontend/src/index.html
```

Untracked files (all should enter the release):

```text
DEPLOYMENT_REVIEW.md
backend/research/router.py
backend/research/test_repeatability.py
backend/research/test_supervised.py
backend/test_production.py
data/research/dataset_info.json
data/research/observations.csv
data/research/repeatability_by_step.csv
data/research/supervised_summary.csv
frontend/ROUTING.md
frontend/public/staticwebapp.config.json
frontend/src/app/api-config.ts
frontend/src/app/dashboard.scss
frontend/src/app/demo.html
frontend/src/app/demo.ts
frontend/src/app/feature-performance.spec.ts
frontend/src/app/feature-performance.ts
frontend/src/app/repeatability.spec.ts
frontend/src/app/repeatability.ts
frontend/src/app/research-overview.scss
frontend/src/app/research.html
frontend/src/app/research.ts
frontend/src/plotly-basic.d.ts
```

Retain existing tracked requirements, workflow, NASA source/data, saved model,
and all three `demo_results/*.json` files. `data/airfoil.zip` is already tracked;
it is not copied into Docker. No need to remove existing NASA files from Git.

Do not stage or ship `data/research/features.csv` (12,492,402 bytes), raw waveform
archives, unrelated research outputs, `.venv/`, `node_modules/`, `__pycache__/`,
`.angular/`, `dist/`, `coverage/`, local caches/logs/temp files, `Microsoft/`,
generated `results/`, `.env` secret files, or local credential directories.
`demo_results/` is required and is distinct from generated `results/`.
`git check-ignore` confirmed the feature matrix and PowerShell cache are ignored.
No environment/credential/key files matched the tracked-file check.

## Backend data and routes

Verified research CSV counts: observations 3,276; repeatability 147; supervised
summary 52. Metadata reports 156 runs with 21 observations per run.

The research router resolves `Path(__file__).resolve().parents[2] / 'data' /
'research'`, which becomes `/app/data/research` in the container. It reads
observations, repeatability, and supervised summary; metadata is packaged as
requested, but there is currently no metadata API endpoint. No route reads
`features.csv`.

Verified HTTP routes:

- `GET /research/runs`: 156 runs.
- `GET /research/action-lift`: default 200-record cap; every run queried by
  `DatasetName` returned its complete 21 records.
- `GET /research/repeatability`: seven groups, 147 total points.
- `GET /research/supervised`: 52 records.
- `GET /`, `POST /predict`, `POST /predict/sweep`, `GET /models/comparison`.
- `POST /experiments/train`: 403 with production flag disabled.

Production environment:

```text
ENABLE_TRAINING=false
FRONTEND_ORIGINS=https://happy-ocean-045bd8f1e.6.azurestaticapps.net
```

Use `--set-env-vars`, preserving unrelated environment values. Do not print secret
values. The disabled Hyperparameter Lab remains visible in the preserved NASA
demo and receives an API denial; explicitly enabling training restores it.

## Validation results

| Check | Result |
| --- | --- |
| Existing backend research tests | 6 passed |
| New training-gate tests | 2 passed, runner mocked |
| Python `pip check` | No broken requirements |
| Installed direct dependencies | Match all six requirements.txt pins |
| Angular development build | Passed |
| Angular production build | Passed; initial bundle 295.02 kB |
| Angular ChromeHeadless tests | 6 passed |
| Production build warning | Plotly CommonJS optimization warning; no budget failure |
| HTTP research/NASA routes | Passed as described above |
| Production-origin CORS preflight | Passed |
| Local frontend `/research`, `/demo` | Both returned app shell; routing and selected-run charts also covered by browser tests |
| Existing backend on port 8000 | Status endpoint returned running |
| SWA routing config | Emitted in dist/frontend/browser and byte-identical to public source |
| Git diff whitespace check | Passed; CRLF conversion notices only |
| Container data packaging | Dockerfile paths inspected; all explicit input files exist |
| Built image inspection | BLOCKED: Docker Linux engine is not running |

Builds/tests required sandbox escalation because Node could not traverse the user
directory. They succeeded outside the sandbox. A temporary backend on port 8001
tested current source with training disabled. Temporary frontend/backend servers
started for verification were stopped; the pre-existing port-8000 server was
left alone. No existing server was restarted to apply changes.

The root route redirects to `/research`; `/demo` remains available. Production
API fallback is `https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io`.
The HTML API override is empty, so this fallback applies in the production build.
Live Azure routing and current deployed configuration still require verification.

Reproduce checks from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/research -p 'test_*.py' -v
.\.venv\Scripts\python.exe -m unittest backend.test_production -v
.\.venv\Scripts\python.exe -m pip check
Push-Location frontend
npm.cmd run build -- --configuration development
npm.cmd run build -- --configuration production
npm.cmd test -- --watch=false --browsers=ChromeHeadless
Pop-Location
```

After starting Docker Desktop's Linux engine, local-only validation remains:

```powershell
docker build -t aerolab-backend:review .
docker run --rm --entrypoint python aerolab-backend:review -c "from pathlib import Path; from backend.main import model; from backend.research.router import get_runs,get_repeatability,get_supervised; root=Path('/app/data'); assert sorted(p.name for p in (root/'research').iterdir()) == ['dataset_info.json','observations.csv','repeatability_by_step.csv','supervised_summary.csv']; assert (root/'airfoil_self_noise.dat').is_file(); assert not (root/'airfoil.zip').exists(); assert len(get_runs())==156; assert len(get_supervised())==52; assert sum(map(len,get_repeatability().values()))==147; print('Image data and model OK')"
docker run --rm -p 8001:8000 aerolab-backend:review
```

## Azure discovery blocker

Azure CLI exists. Cached account metadata says `Azure subscription 1`, Enabled.
Authenticated resource queries (`containerapp list`, `acr list`, `staticwebapp
list`) all failed with AADSTS9002313 and an interactive-login requirement.
No fresh login or account mutation was attempted.

Registry name/login server, resource group, current image repository, revision
mode/traffic, registry pull identity, and deployed environment values could not
be verified. `aerolab-api` is evidenced by the configured FQDN, but management-plane
identity remains unconfirmed. Do not invent names or run a deployment yet.

Required login and read-only discovery, after review:

```powershell
az login --scope https://management.core.windows.net//.default
az account list --query '[].{name:name,isDefault:isDefault}' -o table
# Select the intended existing subscription if the default is incorrect.
az containerapp list --query '[].{name:name,resourceGroup:resourceGroup,fqdn:properties.configuration.ingress.fqdn,images:properties.template.containers[].image}' -o json
az acr list --query '[].{name:name,resourceGroup:resourceGroup,loginServer:loginServer}' -o json
az staticwebapp list --query '[].{name:name,resourceGroup:resourceGroup,defaultHostname:defaultHostname,branch:branch,repositoryUrl:repositoryUrl}' -o json
```

The exact backend build/push/deploy command cannot be finalized until that output
is available. Existing use of ACR is also unverified. If the current image uses
ACR, the following conditional procedure derives all names from live metadata
instead of assuming them. This is a future procedure, not executed:

```powershell
$apps = @(az containerapp list -o json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Azure discovery failed' }
$matches = @($apps | Where-Object { $_.properties.configuration.ingress.fqdn -eq 'aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io' })
if ($matches.Count -ne 1) { throw 'Expected exactly one existing backend' }
$app = $matches[0]
$appName = $app.name
$resourceGroup = $app.resourceGroup
$containers = @($app.properties.template.containers)
if ($containers.Count -ne 1) { throw 'Review multi-container configuration manually' }
$previousImage = $containers[0].image
$previousRevision = $app.properties.latestReadyRevisionName
$registryHost = ($previousImage -split '/')[0]
$registries = @(az acr list -o json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Registry discovery failed' }
$registryMatches = @($registries | Where-Object { $_.loginServer -eq $registryHost })
if ($registryMatches.Count -ne 1) { throw 'Existing image does not identify one accessible ACR; review actual registry procedure' }
$registry = $registryMatches[0]
$repository = ($previousImage -split '/',2)[1] -replace '@.*$','' -replace ':[^/]+$',''
$releaseTag = git rev-parse --short=12 HEAD
if ($LASTEXITCODE -ne 0) { throw 'Git revision lookup failed' }
$releaseImage = "$($registry.loginServer)/${repository}:$releaseTag"
az containerapp revision list --name $appName --resource-group $resourceGroup --query '[].{name:name,active:properties.active,health:properties.healthState,traffic:properties.trafficWeight}' -o table
# Record previousImage, previousRevision, revision mode and traffic before proceeding.
# Confirm the app already has pull permission for the existing registry/repository.
# Remote build and push: requires separate approval, not performed in this review.
az acr build --registry $registry.name --image "${repository}:$releaseTag" .
if ($LASTEXITCODE -ne 0) { throw 'Remote image build failed' }
az containerapp update --name $appName --resource-group $resourceGroup --image $releaseImage --set-env-vars ENABLE_TRAINING=false FRONTEND_ORIGINS=https://happy-ocean-045bd8f1e.6.azurestaticapps.net
if ($LASTEXITCODE -ne 0) { throw 'Backend update failed' }
```

For multiple-revision mode, inspect and deliberately manage traffic before
calling the backend released. Do not assume a new revision receives traffic.
Container Apps image/environment updates and revision operations are documented
in [Azure CLI containerapp](https://learn.microsoft.com/en-us/cli/azure/containerapp?view=azure-cli-latest)
and [revision management](https://learn.microsoft.com/en-us/azure/container-apps/revisions-manage).
ACR remote build is described in [Microsoft's update tutorial](https://learn.microsoft.com/en-us/azure/container-apps/tutorial-update-from-code).

## Proposed Git and frontend publication commands

Only after approving this review, stage these explicit paths; inspect the staged
diff before committing. No `git add .` is needed:

```powershell
git add -- .gitignore .dockerignore Dockerfile DEPLOYMENT_REVIEW.md backend/main.py backend/test_production.py backend/research/router.py backend/research/test_repeatability.py backend/research/test_supervised.py data/research/observations.csv data/research/repeatability_by_step.csv data/research/supervised_summary.csv data/research/dataset_info.json frontend/package.json frontend/package-lock.json frontend/ROUTING.md frontend/public/staticwebapp.config.json frontend/src/index.html frontend/src/plotly-basic.d.ts frontend/src/app/app.config.ts frontend/src/app/app.html frontend/src/app/app.routes.ts frontend/src/app/app.scss frontend/src/app/app.spec.ts frontend/src/app/app.ts frontend/src/app/api-config.ts frontend/src/app/dashboard.scss frontend/src/app/demo.html frontend/src/app/demo.ts frontend/src/app/feature-performance.spec.ts frontend/src/app/feature-performance.ts frontend/src/app/repeatability.spec.ts frontend/src/app/repeatability.ts frontend/src/app/research-overview.scss frontend/src/app/research.html frontend/src/app/research.ts
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "Prepare complete research dashboard for Azure deployment"
git push -u origin research-analytics
```

Do not publish `main` until the new backend is healthy and the four research routes
work at its public URL. Before branch operations, require a clean worktree and
fetch to recheck remote changes. The following conservative fast-forward sequence
stops if `main` diverged; reconcile separately without resetting or force-pushing:

```powershell
git fetch origin
if (git status --porcelain) { throw 'Preserve outstanding work before switching branches' }
git switch main
git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Main needs review' }
git merge --ff-only research-analytics
if ($LASTEXITCODE -ne 0) { throw 'Branches diverged; review integration before publication' }
git push origin main
```

That final push triggers the existing frontend production workflow. A PR targeting
main is an alternative integration path but can itself create a public preview.
Verify the existing workflow token/OIDC access in GitHub; it was not accessible
for inspection here. No new hosting resource or frontend deploy command is needed.

## Deployment order, rollback, and live verification

1. Resolve Azure authentication, verify existing resource identities/environment,
   start Docker, and pass local image validation. Save old image/revision and
   traffic settings plus frontend commit `f7ed38a` (or the then-current main).
2. Approve and commit the release. Build/push its uniquely tagged backend image.
3. Update the existing backend with training disabled and the explicit frontend
   origin; verify revision health and actual public traffic before publishing UI.
4. Publish frontend through `main`; monitor the existing GitHub Actions deployment.
5. Roll back frontend first if necessary by reverting the approved release commit
   on main and pushing normally (use `git revert -m 1` only if the actual release
   is a merge commit). Do not reset or force-push.
6. Backend rollback depends on verified revision mode. In multiple mode, reactivate
   the recorded healthy revision if needed and restore its recorded traffic weights.
   In single mode, create a revision from the recorded previous revision with
   `az containerapp revision copy --name $appName --resource-group $resourceGroup --from-revision $previousRevision --set-env-vars ENABLE_TRAINING=false FRONTEND_ORIGINS=https://happy-ocean-045bd8f1e.6.azurestaticapps.net`.
   Keep the old image available; verify compatibility and health. This preserves
   recorded revision configuration while explicitly retaining production settings;
   an older image without the new gate cannot enforce ENABLE_TRAINING.

Live checklist:

- Open the frontend root; confirm it lands on `/research`.
- Directly load and refresh `/research` and `/demo` without 404s.
- Verify Experiment Overview, both Plotly charts, selectors and uncertainty bars.
- Select several experimental runs and verify all selected-run charts populate.
- Exercise NASA prediction, sweep and comparison; confirm training is denied.
- Confirm browser requests use the HTTPS Container Apps URL, with no CORS errors.
- Query research routes publicly; confirm 156 runs, 147 repeatability points, and
  52 supervised results, and check a selected run has 21 observations.
- Confirm no missing assets, console errors, or scientific-label/value changes.

Remaining blockers: Azure login/resource verification, running Docker/image
validation, verification of live Azure environment/traffic and GitHub deployment
credentials. Public deployment and browser refresh on Azure have not been tested.
