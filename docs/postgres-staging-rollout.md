# PostgreSQL Staging Rollout

## Preconditions

- Revoke the Microsoft Graph credential previously committed in the legacy test.
- Merge the PostgreSQL-aware application and run the CI gates.
- Populate every required PostgreSQL role credential and URI in `.env.staging`.

## Deploy

```sh
docker compose --project-name timeful-staging --env-file .env.staging -f compose.yaml -f compose.staging.yaml config --quiet
docker compose --project-name timeful-staging --env-file .env.staging -f compose.yaml -f compose.staging.yaml up -d --build
docker compose --project-name timeful-staging --env-file .env.staging -f compose.yaml -f compose.staging.yaml ps
curl -fsS https://staging.timeful.fun/api/health/live
curl -fsS https://staging.timeful.fun/api/health
```

Confirm `postgres-migrate` completed successfully, legacy MongoDB event reads and writes remain intact, and both readiness endpoints return successfully.

## Smoke Test

Supported new events are always created in PostgreSQL; no creation flag is required.
Create one anonymous timed poll and one dates-only poll.
Confirm each has one bare eight-character Crockford ID and exercise guest response mutation, selected schedule save/clear, plugin `set-slots`/`get-slots`, and a signed-in response.
Confirm PostgreSQL account responses remain absent from the dashboard and `/api/user/events`.

## Rollback

Supported creation no longer has a flag-based rollback.
Reverting to MongoDB creation requires the migration rollback boundaries in the PostgreSQL core migration runbook, not an environment variable.
Do not roll back the additive SQL schema.
PostgreSQL backup and recovery automation remain deferred in phase one.
