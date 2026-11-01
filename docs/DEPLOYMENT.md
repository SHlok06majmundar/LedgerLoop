# Deployment

| Piece | Host | Notes |
|---|---|---|
| Web (`apps/web`) | Vercel | Root directory `apps/web`; `vercel.json` installs from the monorepo root |
| API + worker (`apps/api`) | Render web service | `RUN_WORKER=true`; persistent disk at `/var/data` for uploads |
| Scheduler | Render background worker | Exactly one instance; runs `dist/scheduler.js` |
| Database | MongoDB Atlas | Replica set (required for transactions and change streams) |
| Email | SMTP (Gmail app password, SES, Resend…) | `SMTP_*` variables |
| Mobile | Expo EAS | `EXPO_PUBLIC_API_URL` points at the API |

The uploads disk can attach to only one Render service, so the job worker runs inside the API service. The scheduler only enqueues jobs and needs no disk. See ADR 0007.

## Free demo on Render

`render.yaml` describes two free web services: `ledgerloop-api` (job worker and
scheduler in-process, `TRUST_PROXY_HOPS=1`) and `ledgerloop-web`. Free services
sleep after 15 idle minutes (the first request takes about a minute) and have no
disk, so uploaded files do not survive a restart; data in Atlas does.

1. New → Blueprint → pick this repository.
2. Fill the `sync: false` values: Atlas URI, SMTP, `WEB_ORIGINS` and `APP_URL`
   (the web service URL), and `NEXT_PUBLIC_API_URL` (the API service URL).
3. In Atlas → Network Access allow `0.0.0.0/0`: free services have no fixed outbound IP.

The web app and API are on different `onrender.com` sites, so the refresh cookie
is cross-site. Safari blocks such cookies, so Safari users sign in again after a
reload. Serving both from one custom domain (`app.` and `api.`) with
`COOKIE_DOMAIN` fixes this.

## API on Render

1. Create the services from `render.yaml` (New → Blueprint), or create them by hand with the same commands.
2. Set the secret variables: `MONGODB_URI`, `JWT_ACCESS_SECRET` (shared by API and scheduler), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `WEB_ORIGINS` (e.g. `https://app.ledgerloop.in`) and `APP_URL` (the web URL used in email links).
3. In Atlas → Network Access, allow Render's outbound IPs.
4. Check `https://<api>/health` returns `database: up`.

## Web on Vercel

1. Import the repository and set the root directory to `apps/web`.
2. Set `NEXT_PUBLIC_API_URL` to the API URL.
3. Add the Vercel domain to the API's `WEB_ORIGINS`.

Because the web app and API are on different sites, the refresh cookie is `SameSite=None; Secure`. Serve both over HTTPS. To tighten this, serve the API from a subdomain of the web domain and set `COOKIE_DOMAIN`.

## Mobile with Expo EAS

```bash
cd apps/mobile
npx eas-cli build --platform android   # or ios
```

Set `EXPO_PUBLIC_API_URL` in the EAS environment to the production API URL.

## Environments

Use separate Atlas databases (or clusters) for development, staging and production, each with its own `JWT_ACCESS_SECRET`. Never run the e2e test suite against a shared database.

## Backups

Enable Atlas continuous backups and test a restore before going live. Back up the uploads disk (Render disk snapshots) on the same schedule.
