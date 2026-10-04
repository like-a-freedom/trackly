#!/usr/bin/env bash
# check-orphans.sh — CI guardrail to catch dead backend exports early (ADR 0013).
#
# Why this exists: rustc/clippy's `dead_code` lint CANNOT see unused `pub` items
# in a library crate (they are assumed reachable by downstream consumers), and
# this project has no downstream consumers — only the binary. Verified: with 16
# genuinely dead `pub` symbols present, `cargo clippy --all-targets` reported
# zero dead_code warnings.
#
# Scope: `pub fn` / `pub struct` / `pub enum` / `pub type` in backend/src/ that
# have ZERO references anywhere in backend/src/. Private dead code is already
# covered by clippy, so this is complementary rather than overlapping.
#
# Exit 0 = clean, Exit 1 = orphan found.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAIL=0

echo "── Checking backend pub exports for orphans ──"
BACKEND_SRC="$REPO_ROOT/backend/src"

TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

grep -rn --include='*.rs' -E '^\s*pub (fn|struct|enum|type) ' "$BACKEND_SRC" \
  | grep -v '#\[cfg(test)\]' \
  | grep -v 'mod tests' > "$TMPFILE" || true

while IFS=: read -r file line decl; do
  sym=$(echo "$decl" | sed -E 's/.*pub (fn|struct|enum|type) ([A-Za-z_][A-Za-z0-9_]*).*/\2/')
  if [ -z "$sym" ]; then continue; fi

  # Count references. Same-file references count: a symbol used only inside its
  # defining module is legitimate (e.g. an axum extractor declared in the same
  # file as its handler), not an orphan. Only a symbol with ZERO references
  # anywhere in backend/src/ is dead.
  total=$(grep -rn --include='*.rs' "\b${sym}\b" "$BACKEND_SRC" \
    | grep -v '#\[cfg(test)\]' \
    | wc -l | tr -d ' ')

  # Subtract the single declaration itself to detect true dead code.
  refs=$((total - 1))

  if [ "$refs" -le 0 ]; then
    mod_path=$(echo "${file#$BACKEND_SRC/}" | sed 's|/mod\.rs$||; s|\.rs$||; s|/|::|g')
    echo "  ORPHAN: $mod_path::$sym (${file#$REPO_ROOT/}:${line}) — no references anywhere"
    FAIL=1
  fi
done < "$TMPFILE"

if [ "$FAIL" -eq 0 ]; then
  echo "✅ No orphaned backend exports found."
  exit 0
else
  echo "❌ Orphaned backend exports detected. Remove or wire them before merging."
  exit 1
fi
