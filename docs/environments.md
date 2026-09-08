# Environment Files

Timeful uses one root app env file per environment:

- `.env.development` for local development
- `.env.test` for isolated browser and database-backed tests
- `.env.staging` for staging deployments and staging-style runs
- `.env.production` for production builds and production-style runs

Caddy uses a separate root edge env file:

- `.env.edge` for staging and production hostnames

The application-level deployment environment is defined separately from toolchain mode:

- backend runtime: `APP_ENV`
- frontend build-time/browser boundary: `VITE_APP_ENV`

Allowed values for both are `development`, `test`, `staging`, and `production`.
When unset, blank, or invalid, both sides default to `development`.
Normal deployments should keep `APP_ENV` and `VITE_APP_ENV` aligned.
`staging` is preserved as a distinct label, but it uses production-like defaults unless overridden explicitly.

Shareable defaults live in:

- `.env.development.example`
- `.env.test.example`
- `.env.staging.example`
- `.env.production.example`
- `.env.edge.example`

## How the env files are used

- Frontend dev tooling reads `.env.development` through `frontend/config/tooling.ts`.
- Frontend browser tests read `.env.test` through `e2e/config/tooling.ts` and run Vite in test mode.
- Frontend staging-style builds read `.env.staging`.
- Frontend production builds and `vite preview` read `.env.production`.
- Vite client env loading uses the repo root as `envDir`, so `import.meta.env.VITE_*` also comes from the same root file for the active mode.
- Docker Compose reads the selected root env file through `--env-file`.
- `frontend-artifacts` receives frontend build-time values from that same Compose env file.
- `server` receives backend runtime variables from Compose interpolation based on that same file.
- The edge Caddy Compose project reads `.env.edge`; it passes only its `CADDY_*` values into Caddy.
- The Go server runs through Docker Compose.
  Compose injects its complete runtime environment; direct `go run` is unsupported.
- `SESSION_SECRET` is required and must contain at least 32 characters.
- The server uses `FRONTEND_DIST` when set.
  Otherwise, it looks for frontend artifacts at `./frontend/dist`, then `../frontend/dist`.

## Variable ownership

Frontend tooling variables:

- `VITE_DEV_HOST`
- `VITE_DEV_PORT`
- `VITE_API_PROXY_TARGET`
- `VITE_PREVIEW_HOST`
- `VITE_PREVIEW_PORT`

Isolated browser E2E network variables:

- `E2E_VITE_HOST`
- `E2E_VITE_PORT`
- `E2E_API_HOST`
- `E2E_API_PORT`
- `E2E_API_INTERNAL_PORT`

Frontend build-time variables:

- `VITE_APP_ENV`
- `VITE_POSTHOG_API_KEY`
- `VITE_POSTHOG_API_HOST`
- `VITE_ENABLE_SIGN_IN`
- `VITE_ENABLE_RICH_LANDING`
- `VITE_FEEDBACK_URL`
- `VITE_SUPPORT_EMAIL`
- `VITE_GITHUB_REPO_URL`

Compose-to-frontend build arg mappings:

- `CLIENT_ID` -> `VITE_GOOGLE_CLIENT_ID`
- `MICROSOFT_CLIENT_ID` -> `VITE_MICROSOFT_CLIENT_ID`
- the `VITE_*` build-time flags above are passed through directly

## Frontend build-time flag semantics

- **`VITE_ENABLE_SIGN_IN`** — Controls sign-in and sign-up availability in the frontend.
  Defaults to `true` when unset or blank.
  Set to `false` to hide sign-in buttons, redirect
  sign-in/sign-up routes away, and replace sign-in-gated feature prompts with
  "Requires sign-in, which is disabled in this build." Existing auth sessions still
  work, so previously signed-in users retain access to auth-protected routes.
  This is a frontend-only gate; backend auth endpoints remain live regardless.
- **`VITE_ENABLE_RICH_LANDING`** — Controls whether the full landing page is shown.
  Defaults to `true` when unset or blank.
  Set to `false` to keep only the Timeful
  brand, the header "How it works" action, the GitHub icon, the "Find a time to meet"
  heading, the primary create-event CTA, and the hero preview card.
  This minimal mode
  hides landing sign-in affordances, the in-page how-it-works section, testimonials, the FAQ,
  and the footer.
- **`VITE_FEEDBACK_URL`** — Controls where frontend “Give feedback” links point.
  Defaults to `https://github.com/deemp/timeful/issues` when unset or blank.
- **`VITE_SUPPORT_EMAIL`** — Controls the support email address shown in the frontend.
  Support
  affordances are hidden when unset or blank.
- **`VITE_POSTHOG_API_HOST`** — Optional PostHog API host.
  Set this when analytics uses a
  self-hosted or reverse-proxied PostHog endpoint; otherwise the PostHog SDK default is used.
- **`VITE_GITHUB_REPO_URL`** — Controls where frontend GitHub links point.
  This value
  is required for Docker-built frontend artifacts.

Backend runtime variables:

- `APP_ENV`
- `APP_PORT`
- `APP_BASE_URL`
- `SERVER_BIND_HOST` (Compose host binding only)
- `CLIENT_ID`
- `CLIENT_SECRET`
- `ANDROID_CLIENT_ID`
- `IOS_CLIENT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `POSTGRES_DATABASE`
- `POSTGRES_TEST_DATABASE` (test only)
- `POSTGRES_BIND_HOST`
- `POSTGRES_PORT`
- `POSTGRES_BOOTSTRAP_USERNAME`
- `POSTGRES_BOOTSTRAP_PASSWORD`
- `POSTGRES_MIGRATOR_USERNAME`
- `POSTGRES_MIGRATOR_PASSWORD`
- `POSTGRES_APPLICATION_USERNAME`
- `POSTGRES_APPLICATION_PASSWORD`
- `POSTGRES_BACKUP_USERNAME`
- `POSTGRES_BACKUP_PASSWORD`
- `POSTGRES_MIGRATOR_URI`
- `POSTGRES_APPLICATION_URI`
- `POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED`
- `POSTGRES_CONNECT_TIMEOUT_SECONDS`
- `POSTGRES_MAX_CONNS`
- `TEST_DB_PERSIST` (test only)
- `MONGODB_ROOT_USERNAME`
- `MONGODB_ROOT_PASSWORD`
- `MONGODB_APP_USERNAME`
- `MONGODB_APP_PASSWORD`
- `ENCRYPTION_KEY`
- `SESSION_SECRET`
- `CORS_ORIGINS`
- `SERVICE_ACCOUNT_KEY_PATH`
- `ANALYTICS_USERNAME`
- `ANALYTICS_PASSWORD`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_CHANNEL`
- `GUILD_ID`
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_TASKS_LOCATION`
- `GOOGLE_CLOUD_TASKS_QUEUE`
- `SLACK_DEV_WEBHOOK_URL`
- `SLACK_PROD_WEBHOOK_URL`
- `MAILCHIMP_API_KEY`
- `MAILJET_API_KEY`
- `MAILJET_API_SECRET`
- `MAILJET_LIST_ID`
- `LISTMONK_ENABLED`
- `LISTMONK_URL`
- `LISTMONK_USERNAME`
- `LISTMONK_PASSWORD`
- `LISTMONK_LIST_ID`
- `LISTMONK_INITIAL_EMAIL_REMINDER_ID`
- `LISTMONK_SECOND_EMAIL_REMINDER_ID`
- `LISTMONK_FINAL_EMAIL_REMINDER_ID`
- `LISTMONK_OTP_EMAIL_TEMPLATE_ID`
- `LISTMONK_OTP_FROM_ADDRESS`
- `GMAIL_APP_PASSWORD`
- `TIMEFUL_EMAIL_ADDRESS`
- `GIN_MODE`

Deployment environment semantics:

- `APP_ENV=development` defaults the Go server to port `3002` and defaults Gin to debug unless `GIN_MODE` overrides it.
- `APP_ENV=test` defaults the Go server to port `3003` and defaults Gin to debug unless `GIN_MODE` overrides it.
- `APP_ENV=staging` defaults the Go server to port `3004` and defaults Gin to release unless `GIN_MODE` overrides it.
- `APP_ENV=production` defaults the Go server to port `3005`, and defaults Gin to release unless `GIN_MODE` overrides it.
- `VITE_APP_ENV` is the frontend-facing mirror for browser-exposed environment-dependent behavior and should normally match `APP_ENV`.
- `APP_BASE_URL` is required and must be an absolute HTTP(S) origin without a path.
  The backend uses it for generated email links, Cloud Tasks payloads, and Slack messages.
- `CORS_ORIGINS` is an optional comma-separated list of additional browser origins.
  The normalized
  `APP_BASE_URL` is always allowed, so use this for `www`, localhost, preview, or alternate-client
  origins only.
- `APP_PORT` is required by Compose and selects both the server listener and its container port.
  `SERVER_BIND_HOST` is required by Compose and selects the host interface for that binding.
- `LISTMONK_OTP_FROM_ADDRESS` is the sender used for OTP emails.
  It must be a valid mailbox or
  RFC 5322 display-name address when an OTP email is sent.

## Precedence

- For frontend tooling, shell variables override values from the selected root env file.
- For Compose commands, shell variables passed into `docker compose --env-file ...` override values from the selected env file during interpolation.

## Commands

Development:

```sh
cp .env.development.example .env.development
docker compose --env-file .env.development -f compose.yaml -f compose.development.yaml up --build mongo postgres server
cd frontend
npm run dev
```

Staging Docker Compose:

```sh
cp .env.staging.example .env.staging
docker compose --project-name timeful-staging --env-file .env.staging -f compose.yaml -f compose.staging.yaml up -d --build
```

Production-style local build/preview:

```sh
cp .env.production.example .env.production
cd frontend
npm run build
npm run preview
```

Production Docker Compose:

```sh
cp .env.production.example .env.production
docker compose --project-name timeful-production --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --build
```

Route and browser tests:

```sh
cp .env.test.example .env.test
docker compose --env-file .env.test -f compose.yaml -f compose.test.yaml up -d mongo-test postgres-test
```

## Ports and isolation

| Environment        | Frontend                      | Backend host binding        | Backend container port  | PostgreSQL host binding | MongoDB database      | PostgreSQL database            |
| ------------------ | ----------------------------- | --------------------------- | ----------------------- | ----------------------- | --------------------- | ------------------------------ |
| Development        | `127.0.0.1:4173`              | `127.0.0.1:3002`            | `3002`                  | `127.0.0.1:5432`        | `timeful-development` | `timeful-postgres-development` |
| Test / browser E2E | `E2E_VITE_HOST:E2E_VITE_PORT` | `E2E_API_HOST:E2E_API_PORT` | `E2E_API_INTERNAL_PORT` | `127.0.0.1:5433`        | `timeful-test`        | `timeful-test-*`               |
| Staging            | Caddy                         | `127.0.0.1:3004`            | `3004`                  | `127.0.0.1:5434`        | `timeful-staging`     | `timeful-postgres-staging`     |
| Production         | Caddy                         | `127.0.0.1:3005`            | `3005`                  | `127.0.0.1:5435`        | `timeful-production`  | `timeful-postgres-production`  |

The shared Caddy edge owns public TCP ports `80` and `443` and UDP port `443`. `VITE_PREVIEW_PORT=4173` in the staging and production app env files only configures local `vite preview`; Docker deployments serve frontend artifacts through Caddy.
PostgreSQL is published only to `POSTGRES_BIND_HOST`, which defaults to `127.0.0.1` in every environment; do not change it to a public interface.
Development, test, staging, and production use distinct Compose projects, networks, and database volumes.
MongoDB is never published to the host.
Browser E2E always targets the isolated test server; it must not target the development server or `timeful-development` database.

Compose has no application-value fallbacks.
Every variable it interpolates must be declared in the selected env file.
Variables with intentionally optional values may be declared blank; deployment configuration, database credentials, ports, and session secrets must be non-blank.

## Shared HTTPS edge

Local development does not run Caddy.
It uses the Vite server and its same-origin API proxy.
When staging and production share a host, a single Docker Caddy service owns public ports 80 and 443, issues certificates, and routes requests by hostname to each stack over the `timeful-edge` Docker network.

Set these values in `.env.edge` to DNS names whose `A` and, if applicable, `AAAA` records point to the host:

- `CADDY_PRODUCTION_DOMAIN`
- `CADDY_PRODUCTION_WWW_DOMAIN`
- `CADDY_PRODUCTION_UPSTREAM`
- `CADDY_STAGING_DOMAIN`
- `CADDY_STAGING_WWW_DOMAIN`
- `CADDY_STAGING_UPSTREAM`

Each canonical Caddy hostname must match the hostname in that environment's `APP_BASE_URL`.
`CADDY_STAGING_UPSTREAM` must be `staging-server:3004` and `CADDY_PRODUCTION_UPSTREAM` must be `production-server:3005`, matching the port selected by each app stack's `APP_ENV`.

Provision the shared network and artifact volumes once.
They are external so tearing down one Compose project cannot remove resources used by another:

```sh
docker network create timeful-edge
docker volume create timeful-production-frontend-dist
docker volume create timeful-staging-frontend-dist
```

Then create the edge configuration and start the edge:

```sh
cp .env.edge.example .env.edge
docker compose --env-file .env.edge -f compose.edge.yaml up -d
```

Then start each app as a separate project:

```sh
docker compose --project-name timeful-production --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --build
docker compose --project-name timeful-staging --env-file .env.staging -f compose.yaml -f compose.staging.yaml up -d --build
```

The edge configuration is split into `caddy/Caddyfile`, shared handlers in `caddy/snippets/timeful.caddy`, and one site file per environment.
Keep shared routing in the snippet; site files should only provide hostnames, upstreams, and frontend roots.

Open inbound TCP ports 80 and 443 and UDP port 443.
Caddy automatically redirects HTTP to HTTPS and obtains certificates after DNS points to the host.
Update OAuth redirect URIs and allowed origins to use the configured HTTPS canonical hostnames.

## MongoDB authentication

Development and test Compose stacks use unauthenticated, isolated MongoDB instances.
Staging and production require separate root and application credentials.
Their overlays create the root account and an application account with `readWrite` access only to the configured `MONGODB_DATABASE`.
Set `MONGODB_URI` explicitly with the application credentials; its password must be URL encoded.
The environment defaults are `timeful-development`, `timeful-staging`, and `timeful-production`.

Changing `MONGODB_DATABASE` selects a different database; it does not rename or copy existing data.
Migrate a populated deployment by backing up the old database, restoring it under the new name, creating the application user for the new database, then deploying the changed environment.

## External Service Names

`GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_TASKS_LOCATION`, and `GOOGLE_CLOUD_TASKS_QUEUE` form the Cloud Tasks parent used for reminder jobs.
The defaults name the Timeful project and existing `us-central1` / `SendReminderEmail` resources.
Create the target project and queue, grant the configured service account access, and update these values before retiring the old Google Cloud project; Google Cloud project IDs cannot be renamed in place.

`DISCORD_BOT_CHANNEL` selects the channel used by the Discord bot.
Set it explicitly for each environment after creating the replacement channel; the Timeful defaults are only used when the variable is unset.

Mongo initialization scripts run only for an empty data volume.
To enable authentication for an existing unauthenticated staging or production volume, first populate the new credentials in the selected env file and run the bootstrap script against the currently running unauthenticated stack:

```sh
./scripts/mongo/bootstrap-existing-users.sh production
```

Then stop the existing stack and start it with the appropriate authenticated overlay.
The bootstrap script is idempotent and does not remove data.

## PostgreSQL roles and migrations

PostgreSQL uses `postgres:18.6-bookworm` pinned to its OCI index digest.
The standard `POSTGRES_*` container bootstrap account owns initialization only.
`POSTGRES_MIGRATOR_URI` is used by the one-shot Goose migration service; `POSTGRES_APPLICATION_URI` is the server's least-privilege connection.
A backup role is provisioned for future operational work, but backup automation, restore drills, and recovery objectives are intentionally deferred in phase one.

Use the selected environment's `POSTGRES_BIND_HOST` and `POSTGRES_PORT` with a local PostgreSQL client.
For example, development can be accessed with:

```sh
psql --host 127.0.0.1 --port 5432 --username timeful_postgres_admin --dbname timeful-postgres-development
```

For staging and production, connect through an SSH tunnel to the deployment host rather than exposing PostgreSQL on a public interface.

Compose starts `postgres-migrate` after PostgreSQL is healthy and starts the server only when the migration service exits successfully. `/api/health/live` reports process liveness; `/api/health` is readiness and requires both MongoDB and PostgreSQL.
SQL migrations are forward-only and must remain compatible with the prior PostgreSQL-aware server release.

## Test isolation

Pure Go unit tests can run either on the host or in a container.

Mongo-backed route tests and browser E2E use the isolated Compose overlay.
It runs `mongo-test` and `postgres-test` in the `timeful-test` project and uses test-only volumes, never either development database volume. `.env.test` supplies the complete server and PostgreSQL role configuration.
E2E creates a fresh `timeful-test-*` PostgreSQL database for each run.

Route tests:

```sh
cp .env.test.example .env.test
docker volume create timeful-test-go-build-cache timeful-test-go-mod-cache
POSTGRES_TEST_DATABASE=timeful-test-postgres docker compose --env-file .env.test -f compose.yaml -f compose.test.yaml up -d mongo-test postgres-test postgres-test-bootstrap postgres-test-migrate
POSTGRES_TEST_DATABASE=timeful-test-postgres docker compose --env-file .env.test -f compose.yaml -f compose.test.yaml run --rm server-route-test
```

Do not gate this sequence on `docker compose wait postgres-test-migrate`.
Compose `wait` only lists running containers, so the one-shot migrate container has usually already exited by the time the command runs and the command fails with `no containers for project`.
`server-route-test` declares `postgres-test-migrate` with the `service_completed_successfully` dependency condition, and `docker compose run` enforces it before starting the tests.

Browser E2E starts its own isolated `mongo-test`, `postgres-test`, and `server-test` services, waits for `http://E2E_API_HOST:E2E_API_PORT/api/health`, and launches a fresh Vite process at `http://E2E_VITE_HOST:E2E_VITE_PORT`. `server-test` listens on `E2E_API_INTERNAL_PORT`; Compose publishes it at `E2E_API_HOST:E2E_API_PORT`.
It inherits the complete `.env.test` server environment contract.
The E2E harness overrides only the generated PostgreSQL database name and the opt-in anonymous PostgreSQL creation flag; `.env.test` clears external integration secrets to prevent side effects:

```sh
cd e2e
npm run test:e2e
```

Browser E2E uses MongoDB creation by default.
Set `E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED=true` when running the PostgreSQL namespaced-event lifecycle spec.

`TEST_DB_PERSIST` defaults to `false`, removing the test stack and both database volumes after E2E for repeatable runs.
Set it to `true` to stop only the test server and retain both database states after successful or failed E2E setup for inspection.

`server-test` and `server-route-test` share a persistent Go build cache in the external `timeful-test-go-build-cache` volume (`GOCACHE=/go-build-cache`), so `go run` and `go test` compile incrementally instead of from cold on every container start.
They also share the external `timeful-test-go-mod-cache` volume mounted at `/go/pkg/mod` (`GOMODCACHE=/go/pkg/mod`), which carries the downloaded Go modules.
Compose does not create external volumes, so the route-test snippet creates both first; `docker volume create` is idempotent when the volume already exists.
Backend CI runs the same step before its `compose run` because a fresh runner has no volumes.
Compose `down -v` does not remove them (they are external); delete them with `docker volume rm timeful-test-go-build-cache timeful-test-go-mod-cache` to force a clean compile and module re-download.

Remove persistent test state explicitly:

```sh
docker compose --env-file .env.test -f compose.yaml -f compose.test.yaml down -v
```

Host-run Mongo-backed tests are opt-in.
They require explicit `MONGODB_URI` and `MONGODB_DATABASE`; the database must be `timeful-test` or start with `timeful-test-`.
The application has no localhost MongoDB or default database fallback.
