#!/bin/sh
set -eu

if [ -z "${LOOMPLANE_DB:-}" ] || [ -z "${LOOMPLANE_PACKET_ID:-}" ]; then
  echo "LOOMPLANE_DB and LOOMPLANE_PACKET_ID must be set for exact Loomplane preflight" >&2
  exit 2
fi

# A Stop hook can fire again after its own block. Allow that second stop so the
# hook cannot create an infinite continuation loop. The original failure stays
# visible in the transcript and the packet must still be revalidated explicitly.
hook_input=$(cat)
if [ -n "$hook_input" ] && printf '%s' "$hook_input" | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    try { process.exit(JSON.parse(input).stop_hook_active === true ? 0 : 1); }
    catch { process.exit(1); }
  });
'; then
  exit 0
fi

set -- --db "$LOOMPLANE_DB" check --packet "$LOOMPLANE_PACKET_ID"
if [ -n "${LOOMPLANE_SOURCE_ROOT:-}" ]; then
  set -- "$@" --root "$LOOMPLANE_SOURCE_ROOT"
fi

if preflight_output=$(loomplane "$@" 2>&1); then
  exit 0
fi

echo "Exact Loomplane packet preflight failed. Recompile context, revalidate the work, and set the new LOOMPLANE_PACKET_ID before continuing." >&2
echo "$preflight_output" >&2
exit 2
