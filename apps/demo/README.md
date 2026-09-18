# Loomplane concept demo

A static, entirely synthetic demonstration of versioned context across independent agent streams. It runs without a backend, model key, framework, build step, tracking, or browser storage. Reloading or choosing Reset returns to the initial state.

Serve this directory with any static server or publish it as a GitHub Pages artifact. All application assets use relative paths; repository/documentation links point to the public Loomplane repository.

```sh
python3 -m http.server 4321 --directory apps/demo
```

The local font files are DM Sans and Manrope. Their original OFL notices are included alongside the files in `assets/`.

## Scenario

1. Record a synthetic UI task against an immutable packet containing API v1 and UI rule v1.
2. Publish the synthetic API v2 with `amount_minor` and `currency_exponent`.
3. Inspect direct and transitive impact, including the QA plan derived from the UI rule.
4. Optionally recompile before review: the new packet includes API v2 but still fails preflight because the UI claim depends on v1.
5. Review the displayed before/after rules, explicitly publish UI claim v2, and compile a current packet.
6. Compare the original snapshot. It remains immutable and stale. QA deliberately retains responsibility for reviewing its own plan.

The scenario is a small simulation, not an alternative implementation of the production compiler. Its estimated token count is calculated from the entire generated demonstration packet at four characters per token; it is not a provider billing count. No agents are executed and no model compliance is inferred.
