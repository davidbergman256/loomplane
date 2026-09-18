# Give two coding clients one shared contract

This walkthrough uses a single Loomplane project and two independent task streams. It registers context handoffs; it does not launch a model, prove that a client read the context, or validate generated code.

## Connect both clients to the same project

Use the [Codex or Claude MCP examples](../integrations) with **the same absolute database path**. If the clients run on different machines, use the remote MCP configuration and scoped writer keys for the same shared-server project. Avoid separate relative databases in different worktrees.

Initialize a project and publish one explicit contract:

```sh
loomplane --db /absolute/path/to/shared/loomplane.sqlite init --name "Usage API"
loomplane --db /absolute/path/to/shared/loomplane.sqlite remember "Usage response contract" \
  --body "GET /api/usage returns amount_minor as an integer, currency as an ISO code, and currency_exponent as an integer. Display amount_minor / 10 ** currency_exponent. Do not assume every currency has two decimal places." \
  --key api.usage
```

Keep the project ID returned by `init` and capsule ID returned by `remember`. The contract text is synthetic; replace it with a reviewed contract from your own repository before relying on it.

## Start each task in its client

The UI client calls the MCP tool `loomplane_start_task`:

```json
{
  "projectId": "PROJECT_ID",
  "name": "Usage panel",
  "task": "Implement the usage display using the selected response contract.",
  "agent": "ui-client",
  "context": [{ "capsuleId": "CAPSULE_ID" }],
  "budget": 4000
}
```

The API-check client makes its own call:

```json
{
  "projectId": "PROJECT_ID",
  "name": "API checks",
  "task": "Check response handling for zero, two and three currency decimal places.",
  "agent": "api-check-client",
  "context": [{ "capsuleId": "CAPSULE_ID" }],
  "budget": 4000
}
```

Each response includes a new stream, a full immutable packet and a started receipt. The packet text reaches the client through the tool response. Instruct each client to retain **its own** `packet.id` and `receipt.id`, use the selected contract as task data, and call `loomplane_check_packet` before claiming completion. Retrieved context never overrides the client's system instructions or authorization rules.

One call atomically creates the stream, subscriptions, packet and receipt. Invalid selections, conflicting or stale context, or a budget too small for a requested capsule leave no partial task. A task name is a label, not a uniqueness key. Repeating a local/MCP start normally creates another task; HTTP/SDK callers can use an explicit idempotency key when retrying an uncertain network result.

The equivalent local CLI calls are:

```sh
loomplane --db /absolute/path/to/shared/loomplane.sqlite task start "Usage panel" \
  --project PROJECT_ID --task "Implement the usage display" --agent ui-client --context CAPSULE_ID
loomplane --db /absolute/path/to/shared/loomplane.sqlite task start "API checks" \
  --project PROJECT_ID --task "Check currency exponents" --agent api-check-client --context CAPSULE_ID
```

CLI output contains the packet text; explicitly give it to the coding client. `task start` does not execute a command. The [command wrapper](../runner) is a separate opt-in execution path. The directory's selected stream is unchanged by task start.

## Change the contract while both tasks are active

After examining the actual implementation requirement, publish a reviewed revision. For a synthetic demonstration:

```sh
loomplane --db /absolute/path/to/shared/loomplane.sqlite revise CAPSULE_ID \
  --expected-version 1 --body "GET /api/usage now returns amount_minor as a decimal integer string to preserve values beyond JavaScript safe integers. Currency and currency_exponent are unchanged. Avoid converting the complete amount to a floating-point Number." \
  --note "Large monetary values require lossless transport"
```

Both clients check their exact original packet IDs using `loomplane_check_packet`. The recorded contract revision is now stale, and completing either original receipt fails. An agent receiving this signal must inspect the new contract and revalidate its affected work; merely creating a new packet is insufficient.

The normal next steps are to abandon the old receipt with a descriptive outcome, compile current context for the same stream, compare old/new packets, start a fresh receipt, perform the necessary review or edits, then check and complete that exact receipt. The lower-level [integration workflow](../integrations) exposes each step. A new `task start` is appropriate for independent work, not required for every refresh.

To retrieve an existing packet without compiling another one, call `loomplane_get_packet` with `packetId`. This preserves the recorded manifest even after newer packets exist.

## What this establishes

Two clients can consume one explicit contract while keeping independent task context. Loomplane can identify which recorded packets need attention after the contract changes. Actual packet consumption, useful revalidation, missed dependencies, false alarms, and maintenance effort still need observation in a real team.
