# Security

Loomplane is an early local prototype, not a hardened multi-user or enterprise service.

The default HTTP server binds to loopback, rejects unexpected Host headers and cross-origin API requests, and performs project-boundary checks. Local access does not imply per-user isolation: any process with access to your database or trusted local API can read its contents.

Binding outside loopback requires `LOOMPLANE_TOKEN` or scoped authentication with `--auth` / `LOOMPLANE_AUTH=required`. `LOOMPLANE_TOKEN` is an instance-wide administrator secret. Scoped keys are hashed at rest and grant reader/writer access to one project; they can be revoked through the local CLI. Neither mechanism provides human identity, source-document authorization, or isolated execution. Use a TLS reverse proxy and a trusted private network if experimenting with remote access. Do not expose the prototype directly to the public internet. The workbench supports token sign-in to the same server; it does not introduce additional authorization beyond that server’s project-scoped keys.

Do not import sessions containing credentials unless you have reviewed and sanitized them. Import is explicit and local; there is no automatic home-directory scanner. A generic secret detector cannot guarantee that content is safe to share. Exported context includes source text and evidence references.

MCP clients control access to the local tools. Retrieved capsules are untrusted historical data and must not override current user or system instructions. Evidence URIs are not executed by the core.

Use [GitHub private vulnerability reporting](https://github.com/davidbergman256/loomplane/security/advisories/new). Avoid putting exploitable details, private source material, or credentials in public issues.
