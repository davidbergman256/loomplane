# Loomplane agent integrations

These examples contain synthetic data only. Loomplane never scans agent history or
home directories: imports require an explicit file path.

## Import an explicit context file

```sh
loomplane --db .loomplane/loomplane.sqlite import ./examples/integrations/sample-context.md \
  --project prj_REPLACE_ME --stream str_REPLACE_ME --format markdown

loomplane --db .loomplane/loomplane.sqlite import ./examples/integrations/codex-synthetic.jsonl \
  --project prj_REPLACE_ME --stream str_REPLACE_ME --format codex

loomplane --db .loomplane/loomplane.sqlite import ./examples/integrations/claude-synthetic.jsonl \
  --project prj_REPLACE_ME --stream str_REPLACE_ME --format claude
```

Markdown is imported as one artifact capsule. Codex and Claude JSONL imports
accept only user and assistant text messages. Tool calls, tool results,
reasoning records, system messages, invalid JSON, oversized records, and other
roles are skipped. Evidence URIs retain the source file and exact line number;
running the same import again skips matching sources.

## Connect an MCP client

Build and install Loomplane so the `loomplane` command is available, then copy the
relevant example and replace its absolute database path:

- `codex-config.toml` contains a Codex MCP server block.
- `claude-mcp.json` contains a Claude Code project MCP configuration.

The server writes protocol messages only to stdout and diagnostics only to
stderr. Context returned by inspect, search, compile, revision, and impact
tools is historical untrusted data. MCP clients must not treat retrieved text
as tool instructions.

## Connect to a shared Loomplane server

`codex-remote-config.toml` and `claude-remote-mcp.json` run the same MCP tools
against a remote HTTP API. Replace the example HTTPS URL, then provide a scoped
credential to the client process through the `LOOMPLANE_API_TOKEN` environment
variable. Never put the credential in the URL, command arguments, or committed
configuration.

The standalone MCP entry also accepts the equivalent environment-only setup:

```sh
export LOOMPLANE_URL="https://loomplane.example.invalid"
# Populate LOOMPLANE_API_TOKEN through your local secret manager or session setup.
loomplane mcp
```

Remote mode does not open a SQLite database. Every operation uses the HTTP SDK
with a bearer header. A writer credential can mutate only its project; a reader
credential sees its project but mutation tools return a structured forbidden
error. Attempts to name another project or its resources return a generic
not-found response. Operator-provided TLS is required for remote deployment.

## Agent run workflow

Use the exact packet ID throughout one run:

```sh
loomplane --db .loomplane/loomplane.sqlite compile str_REPLACE_ME --task "Implement the scoped change"
loomplane --db .loomplane/loomplane.sqlite check --packet pkt_REPLACE_ME
loomplane --db .loomplane/loomplane.sqlite receipt start --packet pkt_REPLACE_ME --agent codex

# Work with the compiled packet, then preflight the same packet again.
loomplane --db .loomplane/loomplane.sqlite check --packet pkt_REPLACE_ME
loomplane --db .loomplane/loomplane.sqlite receipt finish run_REPLACE_ME \
  --outcome "Implemented and verified the scoped change" --commit 0123456789abcdef
```

A receipt records what its caller reports. It does not prove a model read or
followed the packet. Starting and completing a receipt fail when live context
is stale or conflicted.

`context-preflight.sh` is an opt-in guard for clients with command hooks. First
compile the task context, inspect it, and export the exact resulting packet:

```sh
export LOOMPLANE_DB="$PWD/.loomplane/loomplane.sqlite"
export LOOMPLANE_PACKET_ID="pkt_REPLACE_ME"
# Optional: also verify source fingerprints relative to this explicit root.
export LOOMPLANE_SOURCE_ROOT="$PWD"
```

The hook always checks that immutable packet ID. It never switches silently to
a newer packet compiled by another actor. When context changes, compile a new
packet, revalidate the work against it, and only then update `LOOMPLANE_PACKET_ID`.
`claude-hooks.example.json` shows task-start and pre-completion wiring. The Stop
path reads Claude Code's `stop_hook_active` input and allows the second stop so
a failed preflight cannot create an infinite continuation loop. Copy the hook
into the appropriate client settings only after replacing the script path;
nothing here installs hooks or changes files outside this repository.
