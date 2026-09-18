# Team runtime: first shared-server slice

## Goal

Make the same context coordination loop usable from separate machines without sharing a SQLite file. Keep the local personal experience zero-configuration. Add a usable open-source team foundation; do not mislabel it enterprise identity or production hardening.

## Product boundary

The open core includes basic scoped API credentials and revocation. Charging for elementary access isolation would make the free server unsafe and undermine adoption. The prospective paid product operates identity, managed sync, policy/retention, deployment and service guarantees. No enterprise capabilities are claimed merely because the API has keys.

## Shared-server mode

- `LOOMPLANE_AUTH=required` enables project-scoped API credentials stored as SHA-256 token digests.
- `LOOMPLANE_TOKEN` remains an optional instance administrator secret. Existing bearer-only behavior remains compatible when scoped mode is off.
- A scoped key authorizes exactly one project with role `reader` or `writer`; it cannot create a project, create keys, enumerate other projects, or load demo data.
- CLI `loomplane access create --project ID --role reader|writer --name NAME` prints a newly generated secret once. `list` reveals only metadata. `revoke` disables it. CLI requires local database filesystem access and is an administrator operation.
- Authentication precedes resource handling. Resource IDs are resolved to their owning project before a scoped key can access them. Denied resources return a generic forbidden/not-found response without their content.
- Snapshot and project list are filtered. Event streams deliver only permitted project changes. Revocation terminates active event subscriptions.
- Local-only default remains unchanged. Any non-loopback server must have scoped authentication or an administrator token.

## Clients

- HTTP SDK accepts bearer token and supports the same domain operations.
- MCP can use a local database or a remote API through the SDK. `--url` / `LOOMPLANE_URL` selects remote; `LOOMPLANE_API_TOKEN` supplies the secret. Secrets never go in example configs or logs.
- Workbench shared-server mode offers a token sign-in; token is held in browser session storage, never a URL. Sign out clears it. API requests attach Authorization. SSE uses fetch with Authorization; no query-string tokens.
- Remote deployment requires TLS provided by the operator. The token is a service credential, not a verified human identity. Every holder of a writer key can act in that project.

## Limits

Single shared server, synchronous SQLite and no distributed database. Scoped tokens do not provide source-document permissions, SSO, SCIM, tenant billing, retention guarantees, or secure workload isolation. No direct Internet deployment claim. Backup and recovery remain explicit portable export/restore. Basic role and cross-project checks get small real HTTP scenarios, not a broad security certification claim.

## Verification

Create projects A/B and reader/writer keys for A. Verify A read/write as applicable, B inaccessible via every resource route, no project enumeration, no privileged demo/project creation, wrong/revoked key fails, SSE emits A only, remote MCP can compile/check with writer but not reader. Verify personal localhost still works with no key. No production credentials are used.
