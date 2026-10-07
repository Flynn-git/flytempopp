# Deploying hovering.today (Cloudflare)

The site is served by a Cloudflare **Worker with static assets** (`wrangler.jsonc`). There's no server
code yet; the Worker just serves `apps/web/dist` with the headers in `apps/web/public/_headers`. When
SoundCloud sign-in needs a token-exchange endpoint, it can be added to this same Worker.

`.github/workflows/deploy.yml` runs on every push to `main` and every PR:

| Event | Result |
|---|---|
| Push to `main` | Tests, typecheck, build, then **production** deploy to https://hovering.today |
| Pull request | Same checks, then a **preview** at `https://pr-<n>-hovering-today.<your-subdomain>.workers.dev`. Production is untouched. Previews start working after the first production deploy, since they're versions of the existing site. |
| Secrets not set yet, or a PR from a fork | Checks run; deploy is skipped with a notice (no red CI) |

Each run also uploads the built connector extension as a `connector` artifact.

## One-time setup

### 1. Put hovering.today on Cloudflare
If the domain isn't on Cloudflare yet: Cloudflare dashboard → **Add a domain** → `hovering.today`, then
change the nameservers at your registrar to the two Cloudflare gives you. Wait until the zone shows **Active**.

If the apex (`hovering.today`) already has an A/AAAA/CNAME record pointing somewhere else, delete it.
The Worker's custom domain creates its own record, and the first deploy fails if one is in the way.

### 2. Create an API token
Dashboard → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers**.
- Account resources: your account
- Zone resources: `hovering.today`

If the first deploy fails while attaching the custom domain with a permissions error, edit the token and
add **Zone → DNS → Edit** for `hovering.today`.

### 3. Add the GitHub secrets
Repo → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | dashboard → **Workers & Pages** → Account ID (right-hand side) |
| Variable | `CONNECTOR_ID` | the connector's Chrome Web Store ID, once published (optional until then) |

### 4. Deploy
Merge to `main`. PR previews only start working after this first production deploy. The first deploy creates the `hovering-today` Worker
and attaches hovering.today; the certificate can take a few minutes.

### Optional: www
To send `www.hovering.today` to the apex: add a proxied DNS record `www` (e.g. `AAAA www 100::`), then
**Rules → Redirect Rules → Redirect from WWW to root** (a built-in template).

## Local

```sh
npm run build -w @hovering/web
npx wrangler dev          # serves dist with production headers at http://localhost:8787
npx wrangler deploy --dry-run   # validates config without an account
```

Previews can't talk to the connector extension. It only accepts hovering.today (and localhost in dev
builds). Use production or local dev to test connector flows.
