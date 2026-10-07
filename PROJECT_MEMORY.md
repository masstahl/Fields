# Fields — PROJECT_MEMORY.md

> **Purpose:** Persistent project memory for the Fields field-heading application. This document is intended to preserve architecture, infrastructure, product requirements, known-good states, known failures, deployment procedures, and decisions so future development can continue without repeating previous investigation.

**Last updated:** 2026-10-06  
**Repository:** `masstahl/Fields`  
**Primary deployment:** Cloudflare Worker + Workers Assets + D1  
**Primary Worker:** `field-headings`  
**Environment:** `production`

---

## 1. Project Overview

Fields is a mobile-first field-heading management application intended primarily for use on iPhone. The application allows an operator to search and manage agricultural field records, including field name, heading, planting information, and optional geographic coordinates.

The target experience is a professional, premium application rather than a generic CRUD dashboard. The visual design should remain restrained, modern, and neutral.

### Core goals

- Extremely fast field lookup on iPhone.
- Search by field name and/or heading.
- Display field details clearly.
- Edit and delete field records.
- Record activity/audit events.
- Support geographic coordinates and an interactive field map.
- Work as a normal mobile website and as an iPhone Home Screen PWA.
- Preserve existing Home Screen installations when the application is updated whenever technically possible.
- Avoid unnecessary visual/layout changes when adding functionality.
- Keep the interface professional and neutral; avoid loud colors or hobbyist styling.

---

## 2. Repository

GitHub repository:

`masstahl/Fields`

Important source files:

- `public/index.html`
  - Main front-end application.
  - Contains the primary UI, field cards/details, modal editing UI, search, tabs, and interactive map integration.
- `public/manifest.webmanifest`
  - PWA manifest.
- `public/icon.svg`
  - Application icon.
- `public/fix.js`
  - PWA/service-worker registration and update/recovery behavior.
  - Also contains application boot/loading logic and activity/admin handling.
- `public/service-worker.js`
  - Service worker used by the PWA in versions where the front end registers it.
- `src/worker.js`
  - Cloudflare Worker API and asset-routing code.
- `PROJECT_MEMORY.md`
  - This file. Update it when architecture, deployment, or important product behavior changes.

### Important Git commits

Emergency PWA recovery endpoint was originally added in:

`117f0a03f168c0c274d03a8b891a6ec925707b26`

The recovery code was subsequently corrected because the source contained escaped newline characters that would have made the JavaScript block incorrect. The corrected commit is:

`11992fb24eefe801fe797bf735773aa9d95818e9`

Do not assume either commit is deployed to production until Cloudflare explicitly confirms a new production Worker deployment.

---

## 3. Cloudflare Infrastructure

### Account

Cloudflare account ID:

`2ae2d9dcdd314bf2e28be89feb75509c`

### Worker

Worker name:

`field-headings`

Environment:

`production`

Worker URL:

`https://field-headings.stahlsays.workers.dev`

Cloudflare dashboard URL:

`https://dash.cloudflare.com/2ae2d9dcdd314bf2e28be89feb75509c/workers/services/view/field-headings/production`

### D1

Database ID:

`c2e9677e-38f2-4c32-a625-76365146367d`

The production D1 database contains approximately 440 field records.

Verified previously:

`SELECT COUNT(*) AS count FROM fields`

returned:

`440`

The binding has appeared under two names during development. Worker code intentionally supports both:

`env.DB || env["field-headings"]`

Do not remove that compatibility unless the binding is deliberately standardized.

---

## 4. D1 Data Safety

The D1 database is production data.

### Verified field examples

Search for `6-4` previously returned:

- id 156 — `Highline 26-4` — heading `0`
- id 170 — `Hoefel 16-4` — heading `90`
- id 246 — `Kagele 26-4` — heading `89`
- id 273 — `Kagle 26-4` — heading `90`

### Critical rule

Do not reset, recreate, truncate, seed, or replace the D1 database during front-end or PWA troubleshooting.

PWA/service-worker problems must be solved independently of the field data.

---

## 5. Database Tables

Known tables include:

### `fields`

Used for field records.

The Worker currently reads/writes fields using columns including:

- `id`
- `name`
- `heading`
- `planted`
- `lat`
- `lng`
- `updated_by`
- `updated_at`

### `activity`

Used for audit/activity logging.

The Worker writes activity entries containing:

- `user`
- `action`
- `detail`

Activity is ordered by descending ID when retrieved.

---

## 6. Current Worker API

The Worker supports:

### `GET /api/health`

Runs a D1 count query and returns database health plus field count.

Expected conceptual response:

```json
{"ok":true,"fields":440}
```

### `GET /api/fields`

Returns all fields ordered by name.

### `GET /api/fields?q=...`

Searches `name` and `heading`.

The search query is escaped for SQL LIKE wildcard characters.

### `POST /api/fields`

Creates a field.

Required:

- name
- heading

Optional:

- planted
- lat
- lng

### `PUT /api/fields/:id`

Updates:

- name
- heading
- planted
- lat
- lng

Also records the editor and update timestamp.

### `DELETE /api/fields/:id`

Deletes the field and records a deletion activity entry.

### `POST /api/open`

Logs application opening/install activity.

### `GET /api/log`

Returns recent activity.

This endpoint is intended to be administrator-protected using:

`env.ADMIN_KEY`

and request header:

`x-admin`

If `ADMIN_KEY` is absent, the endpoint correctly denies access.

---

## 7. Front-End Design Direction

The application should look like a professional commercial application costing $10,000+, not a basic hobby project.

### Design requirements

- Neutral palette only.
- Premium/minimal aesthetic.
- Clean typography.
- Strong spacing and hierarchy.
- Subtle borders and shadows.
- No excessive gradients.
- No bright novelty colors.
- No unnecessary illustrations.
- Do not change the existing layout simply because a new feature is being added.
- Mobile/iPhone usability is a primary requirement.

The user specifically prefers preserving the existing overall feel when implementing new functionality.

---

## 8. Interactive Map

The map is a real interactive map, not a static image.

### Current technology

Leaflet 1.9.4.

External map sources currently include:

- Esri World Imagery for satellite view.
- Esri World Street Map for road/map view.

### Required map behavior

- Pinch zoom on iPhone.
- Touch pan.
- Mouse pan.
- + and - zoom controls.
- Satellite/road toggle.
- Field marker.
- Heading indicator.
- Recenter button.
- Mobile-friendly controls.
- Restore the exact previous map center and zoom for each individual field.

### Per-field map persistence

Map state is stored in localStorage under:

`fieldMapStates`

State is keyed by field ID and contains approximately:

```js
{
  lat,
  lng,
  zoom,
  updated
}
```

The map saves its state after movement/zoom events.

When a field is opened later, its saved map state should be restored.

The map should not use one global map position for all fields.

### Default behavior

If no saved position exists for a field, use the field's coordinates and a default zoom around 17.

Recenter should return to the actual field coordinates at approximately zoom 17.

Map mode is persisted separately under:

`mapMode`

### Future map enhancements

Field boundaries and acreage may eventually be added if reliable data becomes available.

Do not invent field boundaries, acreage, or coordinates.

---

## 9. PWA Requirements

The app is expected to be usable as:

1. Normal Safari/Edge browser website.
2. iPhone Home Screen standalone application.

The Home Screen application is especially important.

### PWA manifest

The manifest was configured with:

- `display: standalone`
- explicit `scope`
- explicit `id`
- explicit HTTPS `start_url`
- `prefer_related_applications: false`
- neutral theme/background colors
- `/icon.svg`

Versioned query strings have been used during cache-busting.

---

## 10. Major PWA Problem History

The project has experienced a serious PWA failure where:

> Safari says it cannot open the page.

At various points:

- Edge worked while Home Screen standalone failed.
- Safari standalone failed.
- Eventually both Safari and Edge also stopped working after repeated Worker/service-worker changes.
- Rolling back the Cloudflare Worker alone did not necessarily fix clients.

### Key diagnosis

A Worker rollback does **not** remove a service worker that was already installed and controlling a browser/PWA client.

Therefore:

- A later broken service worker can survive a Worker deployment rollback.
- The old service worker can continue intercepting navigation.
- It can continue serving stale or broken cached responses.
- This can make a known-good Cloudflare Worker appear broken from the user's device.

This is currently considered one of the strongest explanations for the recurring Safari/standalone failures.

---

## 11. Known-Good Cloudflare Worker Baseline

Production was previously rolled back to Worker version 34.

That version is considered the last known-good Worker baseline before the later map/PWA sequence.

The production Worker at that point had the basic structure:

```js
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    return handle(request, env, ...url.pathname.slice(5).split("/").filter(Boolean));
  }
};
```

It had:

- Workers Assets
- D1 binding
- normal API handling

It did **not** necessarily contain the later service-worker recovery endpoint.

### Important

Rolling back to version 34 is useful as a baseline, but it does not itself uninstall a service worker already installed on a device.

---

## 12. Emergency PWA Recovery Strategy

The chosen recovery strategy is to make the Cloudflare Worker dynamically serve a special `/service-worker.js` endpoint.

The endpoint returns a tiny service worker whose job is:

1. Install immediately.
2. `skipWaiting()`.
3. Claim clients.
4. Unregister itself.
5. Reload controlled clients.

The intended source logic is conceptually:

```js
if (url.pathname === "/service-worker.js") {
  return new Response(
    "self.addEventListener(\"install\",()=>self.skipWaiting());" +
    "self.addEventListener(\"activate\",e=>" +
    "e.waitUntil(" +
    "self.clients.claim()" +
    ".then(()=>self.registration.unregister())" +
    ".then(()=>self.clients.matchAll())" +
    ".then(cs=>Promise.all(cs.map(c=>c.navigate(c.url))))" +
    "));",
    {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
```

The exact production source should be taken from the current GitHub `src/worker.js`, not copied from memory.

### Important deployment requirement

The emergency endpoint is useful only if it is actually deployed to the live Cloudflare Worker.

GitHub being updated does not prove Cloudflare is updated.

Never tell the user that the recovery endpoint is live unless Cloudflare confirms the new deployment/version.

---

## 13. Current Emergency Recovery Code Status

The recovery endpoint was added to GitHub and then corrected.

Latest relevant commit:

`11992fb24eefe801fe797bf735773aa9d95818e9`

The corrected code is in:

`src/worker.js`

### Production status

At the last verified point, production was still running the known-good Worker baseline and the emergency recovery endpoint had **not yet been confirmed live**.

This distinction is critical.

---

## 14. Cloudflare Deployment Problem

The main remaining infrastructure issue is deploying the corrected Worker while retaining the existing Workers Assets.

A direct multipart Worker upload was attempted.

Cloudflare returned:

`100307: Assets cannot be provided on this endpoint. Use the correct upload endpoint for asset-backed Workers.`

A version upload route was also attempted and returned:

`10405: Method not allowed for this authentication scheme`

### Cloudflare's documented asset deployment flow

Cloudflare documents a direct asset upload process involving:

1. Create an assets upload session.
2. Upload assets through the Workers assets upload endpoint.
3. Receive a short-lived JWT.
4. Deploy Worker code with asset metadata/JWT or `keep_assets: true`.

Cloudflare's Worker Module upload API supports `keep_assets`, which is important because we want to replace Worker code without replacing the known-good static assets.

### Current tooling limitation

The available Cloudflare API tool can make API requests, but the current authentication/tool path does not expose enough control over arbitrary authorization headers for the documented short-lived asset-upload flow.

Do not work around this by exposing credentials in source code.

---

## 15. Safe Deployment Options

### Preferred

Use Cloudflare's dashboard or Wrangler with a properly scoped Cloudflare API token.

The token should be limited to the minimum required Worker deployment permissions.

Never use the user's Cloudflare password.

Never request or store an unrestricted global API key.

### Alternative

Set up GitHub Actions to deploy the Worker with Wrangler.

This requires a properly configured GitHub secret containing a scoped Cloudflare API token.

Do not assume the secret already exists.

---

## 16. Do Not Make These Mistakes

### Do not repeatedly modify the front end while the PWA recovery issue is unresolved

Repeated front-end/service-worker changes can create more cached versions and make diagnosis harder.

First stabilize:

1. Cloudflare Worker.
2. Static assets.
3. Service-worker state.
4. Normal browser access.

Then resume UI work.

### Do not reset D1

The database is not the cause of the Safari service-worker failure.

### Do not claim a deployment succeeded based on a GitHub commit

GitHub and Cloudflare are separate deployment states unless an explicit deployment integration is confirmed.

### Do not infer that the Worker is down just because the ChatGPT web tool cannot open `workers.dev`

The web tool has had difficulty accessing the `workers.dev` URL directly.

Use Cloudflare's API/dashboard or an actual browser/client to verify live behavior.

### Do not add more PWA cache layers unnecessarily

The goal is to simplify recovery and minimize stale-client behavior.

---

## 17. Current Service Worker Architecture

At one point the service worker used a versioned cache such as:

`field-headings-static-v20261005-0700`

It cached:

- `/index.html`
- versioned manifest
- icon

It also intercepted:

- API requests
- navigation requests
- static assets

The navigation handler had previously attempted to avoid redirect-related failures.

### WebKit concern

Research found known WebKit/iOS standalone PWA problems involving service-worker navigation responses and redirects.

Therefore navigation handling must be conservative.

Avoid unnecessary navigation interception unless there is a clear benefit.

For this application, reliability of opening the Home Screen app is more important than sophisticated offline behavior.

---

## 18. PWA Recovery Testing Procedure

After the emergency Worker endpoint is confirmed live:

### Test 1 — normal browser

Open:

`https://field-headings.stahlsays.workers.dev/`

in Safari.

Wait approximately 10–15 seconds.

Reload.

### Test 2 — Edge

Open the same URL in Edge.

Confirm:

- page loads
- fields appear
- search works
- no blank page
- no Safari/connection error

### Test 3 — existing Home Screen installation

Open the existing Fields Home Screen icon.

Expected result:

- app opens
- stale service worker updates/unregisters
- app reloads
- field data loads

### Test 4 — map

Open a field.

Verify:

- map loads
- marker appears
- heading indicator appears
- pinch zoom works
- map pan works
- satellite/road toggle works
- recenter works

### Test 5 — map persistence

For Field A:

1. Open map.
2. Pan to a recognizable location.
3. Zoom to a specific level.
4. Close field.
5. Reopen Field A.
6. Verify exact/same center and zoom return.

Then open Field B and verify its map position is independent.

### Test 6 — data integrity

Confirm field count remains 440 unless intentional edits have been made.

---

## 19. If PWA Recovery Still Fails

If the emergency service-worker endpoint is confirmed live and Safari/Edge still cannot open the site:

1. Verify the live Worker deployment/version.
2. Verify `/service-worker.js` is returning the emergency script.
3. Inspect Worker request/log behavior.
4. Test normal browser navigation separately from Home Screen navigation.
5. Check whether a browser-specific WebKit issue remains.
6. Only after those steps consider manually removing/reinstalling the Home Screen PWA.

A delete/reinstall should be considered a last resort because the project's explicit goal is to make existing Home Screen installations update/recover without reinstalling whenever possible.

---

## 20. Security

### Current activity protection

`GET /api/log` checks:

`env.ADMIN_KEY`

against:

`x-admin`

Do not remove this protection.

### User identification

The Worker reads:

`x-user`

and limits the decoded value before logging.

This is not a strong authentication mechanism by itself.

If the app eventually needs authenticated multi-user access, implement proper authentication rather than treating `x-user` as trusted identity.

---

## 21. Deployment Checklist

Before deploying a Worker change:

- [ ] Confirm D1 database ID.
- [ ] Confirm Assets binding.
- [ ] Confirm Worker name `field-headings`.
- [ ] Confirm production environment.
- [ ] Preserve existing static assets.
- [ ] Do not alter D1 schema unless intentionally required.
- [ ] Syntax-check `src/worker.js`.
- [ ] Verify API routes.
- [ ] If changing service-worker behavior, increment cache/version identifiers intentionally.
- [ ] Deploy.
- [ ] Confirm new production deployment/version.
- [ ] Verify `/api/health`.
- [ ] Verify normal browser.
- [ ] Verify existing Home Screen PWA.
- [ ] Only then continue with additional feature work.

---

## 22. Product Requirements Backlog

### High priority

- Reliable iPhone Home Screen PWA behavior.
- Existing PWA installations should update without reinstall whenever possible.
- Stable search and field editing.
- Interactive map with per-field saved view.
- Reliable production deployment process.
- Audit/activity logging.

### Medium priority

- Field boundaries.
- Acreage display.
- Better map field visualization.
- More detailed field history.
- Improved administrator activity UI.

### Future

- Authentication and user accounts if required.
- Multi-user permissions.
- More advanced GIS features.
- Offline support, but only if it does not compromise normal navigation/PWA reliability.

---

## 23. Development Philosophy

The user values **functional stability over unnecessary novelty**.

When adding a feature:

1. Preserve the existing layout unless the user specifically asks for redesign.
2. Make the smallest safe change.
3. Test the changed behavior.
4. Do not bundle unrelated architectural changes into a feature update.
5. Keep production data untouched.
6. Treat PWA/service-worker changes as high risk.
7. Prefer simple, reliable browser behavior over clever caching.
8. Preserve the premium neutral visual identity.

---

## 24. Current Known State — 2026-10-06

### GitHub

Latest relevant Worker recovery commit:

`11992fb24eefe801fe797bf735773aa9d95818e9`

### Cloudflare

Production was last verified at the known-good Worker baseline (version 34) before the recovery endpoint was deployed.

The emergency recovery endpoint is **not to be considered live until a Cloudflare deployment explicitly confirms it**.

### Database

D1 remains intact.

Previously verified count:

**440 fields**

### Immediate next task

Deploy the corrected `src/worker.js` to Cloudflare while retaining the existing Workers Assets.

After deployment, test normal Safari/Edge access first, then test the existing iPhone Home Screen installation.

---

## 25. Quick Reference

| Item | Value |
|---|---|
| GitHub repo | `masstahl/Fields` |
| Worker | `field-headings` |
| Environment | `production` |
| Worker URL | `https://field-headings.stahlsays.workers.dev` |
| Cloudflare account | `2ae2d9dcdd314bf2e28be89feb75509c` |
| D1 database | `c2e9677e-38f2-4c32-a625-76365146367d` |
| Verified field count | 440 |
| Known-good Worker baseline | Version 34 |
| Recovery commit | `11992fb24eefe801fe797bf735773aa9d95818e9` |
| Main Worker source | `src/worker.js` |
| Main UI | `public/index.html` |
| PWA helper | `public/fix.js` |
| Manifest | `public/manifest.webmanifest` |
| Service worker | `public/service-worker.js` |

---

## 26. Handoff Notes for Future AI/Developer

Before changing anything, read this document completely.

If the user says the app is not opening:

1. Determine whether the failure is:
   - normal browser,
   - Home Screen PWA,
   - both.
2. Check Cloudflare production Worker state.
3. Check whether a service worker is involved.
4. Do not immediately rewrite the UI.
5. Do not touch D1 unless database evidence indicates a database problem.
6. Do not claim a GitHub change is deployed.
7. If a recovery Worker exists in GitHub but is not deployed, deployment is the priority.
8. Once the PWA is stable, resume feature development.

The most important architectural lesson from this project is:

> **A Cloudflare Worker rollback does not roll back a service worker already installed on a user's device. PWA client state must be treated as an independent deployment layer.**
