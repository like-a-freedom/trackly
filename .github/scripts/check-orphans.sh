#!/usr/bin/env bash
# check-orphans.sh — CI guardrail to catch dead backend exports early (ADR 0013).
#
# Fails the build if a pub fn / pub struct / pub enum in backend/src/
# has no caller outside its own module.
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

  # Count callers outside the defining file
  callers=$(grep -rn --include='*.rs' "\b${sym}\b" "$BACKEND_SRC" \
    | grep -v "^${file}:" \
    | grep -v '#\[cfg(test)\]' \
    | wc -l | tr -d ' ')

  if [ "$callers" -eq 0 ]; then
    mod_path=$(echo "${file#$BACKEND_SRC/}" | sed 's|/mod\.rs$||; s|\.rs$||; s|/|::|g')
    echo "  ORPHAN: $mod_path::$sym (${file#$REPO_ROOT/}:${line})"
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
