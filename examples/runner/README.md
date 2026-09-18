# Run an explicit command with Loomplane context

`loomplane run` compiles one packet, verifies it, records a caller-reported run
receipt, and launches the command after `--` without a shell:

```sh
loomplane --db .loomplane/loomplane.sqlite run \
  --stream str_REPLACE_ME \
  --task "Implement the scoped change" \
  -- node ./scripts/my-agent.mjs
```

The child receives absolute paths in these environment variables:

- `LOOMPLANE_CONTEXT_FILE` — rendered context text.
- `LOOMPLANE_PACKET_FILE` — the complete packet as JSON.
- `LOOMPLANE_PACKET_ID` — the exact packet ID registered by the receipt.
- `LOOMPLANE_DB` — the selected database path.

The command must explicitly read one of the context files. Loomplane does not
inject text into prompts or assume a provider-specific agent CLI. Temporary
files are private and removed after the command unless the caller selects the
keep-files option.

Use an explicit source root when packet evidence contains file fingerprints:

```sh
loomplane --db .loomplane/loomplane.sqlite run \
  --stream str_REPLACE_ME \
  --root "$PWD" \
  -- node ./scripts/my-agent.mjs
```

The runner refuses an invalid preflight before launching. A nonzero child exit
is preserved and its receipt is abandoned. If the child exits zero but packet
or source context changed during the run, the runner exits 2 and abandons the
receipt. Only a zero child exit with fresh postflight checks records completion.

A completed receipt says the command exited successfully while the exact
packet remained fresh. It does not prove the command read or obeyed the
context, and it does not mean anyone reviewed the resulting work.

The runner forwards termination signals to its direct child. Abrupt host termination or SIGKILL can leave a started receipt and temporary files; inspect and abandon that receipt explicitly after recovery. It does not supervise detached child processes.

Try the included non-model fixture from the Loomplane checkout after `loomplane init`:

```sh
loomplane remember "Amounts use minor units" --body "Use amount_minor and currency_exponent."
loomplane run --task "Inspect the contract" -- node examples/runner/read-context.mjs
```

It reads and prints the exact packet text. Replace the fixture with an agent command that explicitly reads the file when using real coding tools.
