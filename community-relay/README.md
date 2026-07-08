# E-Class Record Community Relay

This is the small v1 HTTP relay used by the app's `Ask the Community` feature
and global sidebar sponsor ads. It stores recent general help questions and the
current sidebar ad config in local JSON files for development/testing.

## Run Locally

```powershell
node .\community-relay\server.js
```

The default URL is:

```text
http://localhost:8787
```

The desktop app now uses the official bundled production relay automatically:

```text
https://eclassrecord-community-relay.jerniqz.workers.dev
```

Normal users do not need to paste or edit a relay URL in Settings. This local
Node relay is kept as a development/testing fallback and as a reference service
for future hosting changes.

To test owner ad saving locally, start the relay with an admin token:

```powershell
$env:ADS_ADMIN_TOKEN="paste-a-long-private-token-here"
node .\community-relay\server.js
```

## Deploy

Host this folder on a Node-capable service and set the `PORT` environment
variable if your host requires it. If the production relay changes, update the
bundled endpoint in the app source instead of asking users to configure it.

For the production Cloudflare Worker, use
`community-relay/cloudflare-worker.js` as the Worker source, bind the existing
D1 database as `DB`, and set a Worker secret named `ADS_ADMIN_TOKEN`.

Normal app users can read sidebar ads without the token. Only the hidden owner
editor can save ads, and it sends the token as:

```text
Authorization: Bearer <ADS_ADMIN_TOKEN>
```

The Worker creates these D1 tables automatically if they do not exist:

- `questions`
- `dismissals`
- `app_config`

## Endpoints

- `GET /health`
- `POST /community/questions`
- `GET /community/questions/recent?since=2026-07-06T00:00:00.000Z`
- `POST /community/questions/:id/dismiss`
- `GET /ads/sidebar`
- `PUT /admin/sidebar-ads`

## Sidebar Ad Rules

`GET /ads/sidebar` is public and returns the current normalized ad list. If no
global ads are configured yet, the app falls back to cached ads or bundled house
ads.

`PUT /admin/sidebar-ads` is owner-only. The relay validates every saved ad:

- maximum of 8 ads
- title is required
- `clickUrl` is required and must be `http` or `https`
- image and preview URLs must be `http` or `https` when provided
- private/local URLs such as `localhost`, `127.0.0.1`, `192.168.x.x`, and
  `10.x.x.x` are rejected

The app does not permanently store the admin token. Paste it into the hidden
owner editor only when saving global ads.

## Privacy Boundary

The relay accepts only these fields:

- `question`
- `appVersion`
- `matchedFaqId`
- `installId`
- `timestamp`

Do not send learner names, LRNs, grades, attendance records, school profile
fields, rosters, backups, exported files, or private documents.
