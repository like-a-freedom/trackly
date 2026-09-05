# ADR-0036: Delete Unused Editor Pinia Store

## Status
Accepted

## Context
ADR-0016 adopted Pinia for state management. An editor Pinia store (`stores/editor.ts`, 258 LOC) was created but never wired into the editor facade (`useTrackEditor.ts` uses composables, not the store). The store was only referenced by test files, not by any production code.

## Decision
Delete `stores/editor.ts` and its test file `__tests__/stores/editor.ts`. The editor's state lives in composables (`composables/editor/*.ts`), not Pinia.

## Consequences
- Removes 258 LOC of dead code
- Three test files that depended on the store were also deleted (they tested standalone functions that were already dead)
- Future editor state management will use composables, not Pinia
- Consistent with the actual architecture: the facade composes composables, not stores
