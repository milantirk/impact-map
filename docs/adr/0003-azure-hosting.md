# ADR 0003: Azure hosting with Front Door, App Service and PostgreSQL Flexible Server

- Status: accepted
- Date: 2026-10-21

## Context

Impact Map must feel instant for everyone, everywhere. It is public and anonymous at first. The
engine runs in the browser ([ADR 0001](0001-engine-in-the-browser.md)), so the server mainly
delivers static files and saves and opens shared decision models. The API is a Fastify container
that also serves the SPA. PostgreSQL stores the shared models.

Requirements:

- Fast first load worldwide: edge caching and TLS close to the user.
- A WAF and rate limits in front of a public, anonymous API.
- A private database without passwords.
- Two environments (dev, prod), deployed from GitHub without stored cloud secrets.
- Safe production releases with a quick rollback.
- Low operating effort for a small team, and predictable cost.

## Options

### A: Front Door + App Service (Linux container) + PostgreSQL Flexible Server (chosen)

Azure Front Door (Standard; Premium when prod scales up) caches static files and runs the WAF. It
forwards to one Linux App Service that runs the container image from a shared ACR. App Service
uses VNet integration to reach a private PostgreSQL Flexible Server with Entra ID authentication.

### B: Static Web Apps + Container Apps + PostgreSQL Flexible Server

Static Web Apps hosts the SPA on its own global CDN. Container Apps runs the API. PostgreSQL is
the same as in A.

### Comparison

| Criterion           | A: Front Door + App Service                                                                 | B: Static Web Apps + Container Apps                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Speed               | One edge for all traffic; immutable assets cached at the edge; always-on app, no cold start | Fast static files; API cold starts when scaled to zero; API calls do not go through the same edge |
| WAF and rate limits | Front Door WAF for site and API (managed rules, bot rules, rate limits)                     | No WAF in Static Web Apps; a WAF needs Front Door in front anyway                                 |
| Deployment unit     | One image: API and SPA always match                                                         | Two artefacts (SPA and API) that must be released together                                        |
| Safe releases       | Deployment slot: health check, swap, swap back                                              | Container Apps revisions with traffic splitting (good); SPA and API releases are separate         |
| Private database    | VNet integration + delegated subnet + private DNS                                           | Same, with a VNet-injected Container Apps environment                                             |
| Origin lock-down    | Access restriction: Front Door service tag + `X-Azure-FDID` header                          | Container Apps ingress restrictions; Static Web Apps needs the Standard plan for more control     |
| Cost at low traffic | Fixed: App Service plan and Front Door base fee are paid even when idle                     | Lower: scale to zero and a cheap static host, until a WAF is needed                               |
| Operations          | Few moving parts; mature Terraform support                                                  | More parts (two hosts, Container Apps environment and its subnet)                                 |

## Decision

We use option A: Azure Front Door → Linux App Service (container from ACR, VNet integrated) →
PostgreSQL Flexible Server (private, Entra ID only). Dev uses small SKUs (Front Door Standard, B1,
Burstable PostgreSQL). Prod starts lean (decided 2026-10-21): Front Door Standard with custom WAF
rules, one P0v3 instance with a staging slot, Burstable PostgreSQL (B2s) with 35-day geo-redundant
backups. Prod scales up with variables only: Front Door Premium with managed WAF rules, two P1v3
instances, and zone-redundant PostgreSQL.

The main reasons are one edge with a WAF for all traffic, one image for API and SPA, no cold
starts, and slot swaps as a simple, fast rollback.

## Consequences

- One image is built per commit and promoted to prod by digest. API and SPA never drift apart.
- Static files are served from the edge; the origin handles only `index.html` revalidation and
  the API.
- The App Service plan and the Front Door base fee are fixed costs, also when there is no
  traffic. The lean prod start costs about twice as much as dev; scaling up (Front Door Premium,
  HA standby, second instance) costs about five times more
  ([cost estimate](../deployment.md#monthly-cost-rough-estimate)).
- The App Service has a public endpoint that accepts only this Front Door profile. A fully private
  origin (Front Door Private Link) is a later hardening step.
- The app's managed identity is the PostgreSQL Entra administrator. Least-privilege database roles
  are a later step.
- Schema changes must stay backward compatible for one release, because the staging slot and
  production share the database during a swap and a rollback.
- Revisit option B if traffic stays very low for a long time and cost matters more than a WAF, or
  if the API needs to scale independently from the static files.
