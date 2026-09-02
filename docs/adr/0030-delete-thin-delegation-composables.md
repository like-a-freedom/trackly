# Delete thin delegation composables (stage 4, ADR 0030)

`useToast.js` (16 LOC), `useUnits.js` (23 LOC), and `useSearchState.js` (22 LOC) are pure delegation wrappers — their public interface is identical to the underlying Pinia store. Deletion test: deleting them concentrates nothing, just moves the binding. Components import stores directly: `import { useToastStore } from '../stores/toast'`. The `useAuth.js` wrapper is intentionally preserved because it re-exports from 5 auth modules (pkce, oauth-client, refresh, profile, migration) — it has a real interface transformation role.
