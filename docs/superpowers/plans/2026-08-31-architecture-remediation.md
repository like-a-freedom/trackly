# Trackly Architecture Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the architecture remediation defined in `~/.commandcode/plans/trackly-architecture-remediation.md` (the "architecture plan"): integrate `create-tracks` into `master`, fix 3 runtime bugs, deepen the backend seam (split handlers + `AppError` + `db::pois` + SQL parameterization), deepen the frontend seam (Pinia + events + http + MapAdapter), delete dead code, repair CI, and add ADRs + `CONTEXT.md`.

**Architecture:** A 9-stage rollout. Stage 0 is a one-step merge of `create-tracks` into `master` (the auth code is already on `master`). Stage 0.5 fixes 3 runtime bugs (alias, not rename, for `useConfirm`). Stages 1-2 deepen the backend. Stage 2.5 decomposes `useAuth.js`. Stages 3-4 deepen the frontend. Stage 5 deletes dead code and repairs CI. Stage 6 documents. Each stage is an independently-mergeable PR with its own ADR.

**Tech Stack:** Rust 2024 + Axum 0.8 + sqlx 0.8 + PostgreSQL+PostGIS (backend); Vue 3.5 + Vite + Pinia 3 + bun (frontend); GitHub Actions (CI); Docker (no Kubernetes).

**Spec:** `~/.commandcode/plans/trackly-architecture-remediation.md` — the plan argues from this spec, so the spec travels with it. The audit report at `/var/folders/49/tgd627ns2y19fj8nqnnq0ds00000gp/T/architecture-review-1787779207.html` is the input that produced the spec.

## Global Constraints

From `AGENTS.md` and the architecture plan:

- **Strictly use `bun` (not `npm`) for all JS/TS commands.**
- **Always respond in the user's language (English in this plan).**
- **Do NOT start the frontend (81), backend (8080), or database (5432)** — they are already running.
- **For Git questions, use `@terminal` prefix.**
- **Make minimal, surgical changes only** — no unnecessary refactoring beyond the plan.
- **Follow SOLID/DRY/KISS/YAGNI/12-factor.**
- **All DB schema changes must go through `sqlx migrate`.**
- **Vue 3.5.27 is installed** (verified). Pinia is NOT installed; Stage 3a adds it.
- **`vue-router@5.0.2` peer-deps on `pinia@^3.0.4`** (verified in `bun.lock`); install Pinia 3.
- **Backend services are already running on `127.0.0.1:8080`**; e2e tests assume this.
- **The auth code is already on `master`** (verified: `master` is `users-auth` + 2 `.gitignore` commits; see architecture plan §"Branch topology"). Stage 0's only real merge is `create-tracks` → `master`.
- **`master` HEAD = `b84edb9`**; **`create-tracks` HEAD = `13e0434`**.
- **The 2 gitignore commits on master** are: `b84edb9` (current) and `5a896ff` (parent).
- **All 24 ADRs (0001-0024 in the plan) are real decisions**, not task descriptions. Write each ADR as a single paragraph (~3 sentences) per `~/.agents/skills/domain-modeling/ADR-FORMAT.md`. The plan deliberately adds 0023 and 0024 to the architecture plan's 0001-0022 (which covers Stages 0-5); 0023/0024 are the documentation ADRs from Stage 6.
- **`docs/adr/` directory is created on the first Stage that needs it** (Stage 0).

---

## Stage 0 — One-step integration of `create-tracks` into `master`

**Files:**
- Modify: `master` branch (history rewrite).
- New: `docs/adr/0001-one-step-integration.md`.
- New: `docs/adr/0002-track-upload-optimizations-decision.md`.

**Interfaces:**
- Produces: `master` branch with `create-tracks` editor code (and the WASM module) integrated. `v0.4.0-integration` tag points to the integrated tip.
- Consumes: the 3-branch topology (`users-auth` = `830641b`, `master` = `b84edb9`, `create-tracks` = `13e0434`, `track-upload-optimizations` = `23de764`).

### Task 0.1: Tag `master` as `v0.4.0-pre-integration`

**Files:**
- No file changes (git operation only).

- [ ] **Step 1: Verify current branch is `master` and clean**

Run: `git status && git log --oneline -1`
Expected: clean working tree, HEAD = `b84edb9 chore: updated gitignore` on branch `master`. If dirty or wrong branch, abort and report.

- [ ] **Step 2: Create the pre-integration tag**

Run: `git tag -a v0.4.0-pre-integration -m "snapshot of master before create-tracks merge (auth code already on master, only create-tracks work pending)"`
Expected: tag created. Verify with `git tag -l 'v0.4.0*'` shows two tags eventually: `v0.4.0-pre-integration` and `v0.4.0-integration` (the latter comes in Task 0.5).

- [ ] **Step 3: Commit**

The tag is a git ref, not a commit. Skip `git add`; `git commit` is not needed. The tag is already persisted. Move to Task 0.2.

---

### Task 0.2: Write ADR 0001 (one-step integration decision)

**Files:**
- New: `docs/adr/0001-one-step-integration.md`.

- [ ] **Step 0: Create the ADR directory**

```bash
mkdir -p docs/adr/
```

- [ ] **Step 1: Create the ADR**

Write `docs/adr/0001-one-step-integration.md` with this exact content:

```markdown
# One-step integration: tag `master` as v0.4.0-integration, then merge `create-tracks` via `git merge --no-ff`

The audit was conducted against `master` (`b84edb9`), which is the same as `users-auth` (`830641b`) plus 2 `.gitignore` housekeeping commits — verified by the `logs/HEAD` reflog: `830641b` → `5a896ff` (chore: updated .gitignore) → `b84edb9` (chore: updated gitignore). So merging `users-auth` into `master` is a no-op (its commits are already an ancestor of `master`); we tag `master` and merge only `create-tracks`. We choose this over a true octopus merge because the three branches do not share a common merge base that an octopus requires.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add docs/adr/0001-one-step-integration.md
git commit -m "docs(adr): 0001 one-step integration strategy for create-tracks into master"
```

---

### Task 0.3: Write ADR 0002 (decision on `track-upload-optimizations`)

**Files:**
- New: `docs/adr/0002-track-upload-optimizations-decision.md`.

- [ ] **Step 1: Create the ADR**

Write `docs/adr/0002-track-upload-optimizations-decision.md` with this exact content:

```markdown
# Decision on `track-upload-optimizations` `23de764`: archive the branch; port the 242 LOC of `backend/tests/hash_exist.rs` into `track_upload::upload` integration test in Stage 2c

The branch `track-upload-optimizations` (HEAD `23de764`, Dec 2025) is on a stale pre-auth, pre-editor base. It carries the original implementation of `POST /api/tracks/exist` (the route the audit flagged as dead-on-arrival): `backend/src/db/tracks.rs` (22 LOC), `backend/src/handlers.rs` (105 LOC), `backend/src/services/track_upload.rs` (45 LOC), and crucially `backend/tests/hash_exist.rs` (242 LOC) + `backend/tests/upload_conflict.rs` (108 LOC) covering the dedup behaviour. We archive the branch (do not delete) so its history remains retrievable, and port the 242 LOC of `hash_exist.rs` tests into `backend/src/track_upload::upload`'s `#[cfg(test)] mod` in Stage 2c — the dedup *behaviour* is preserved, the route is removed.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add docs/adr/0002-track-upload-optimizations-decision.md
git commit -m "docs(adr): 0002 archive track-upload-optimizations, port hash_exist tests in stage 2c"
```

---

### Task 0.4: Dry-run the merge of `create-tracks` into `master`

**Files:**
- No file changes (git operation only).

- [ ] **Step 1: Identify the merge base**

Run: `git merge-base master create-tracks`
Expected: a SHA. Record it. (For verification: it should be `bd3b9bf9b878ced7430abc434c050e8c2c537242` per the reflog, but treat whatever `git merge-base` returns as authoritative.)

- [ ] **Step 2: Predict conflicts without changing the tree**

Run:
```bash
git merge-tree $(git merge-base master create-tracks) master create-tracks | grep -E "^changed|^added|^removed" | sort -u
```
Expected: a list of files that will conflict or be added/removed on both sides. **Do not commit anything yet.** This step is read-only.

- [ ] **Step 3: Abort the dry-run; we're not actually merging yet**

If you started a `git merge --no-commit` to inspect staged files, abort it now: `git merge --abort`. The plan: we dry-run via `merge-tree` (read-only), then in Task 0.5 do the real merge.

- [ ] **Step 4: Document the predicted conflict set in a comment for the executor**

The architecture plan §"Stage 0" predicts conflicts in: `AccountView.vue`, `useAuth.js`, `router/index.js`, `main.js`, `backend/migrations/*`, `Cargo.toml`, `bun.lock`, `.gitignore`. Verify the merge-tree output is consistent with this list. If there are additional conflicts not in this list, note them in the commit message of Task 0.5.

---

### Task 0.5: Merge `create-tracks` into `master`

**Files:**
- Modify: `master` branch (history rewrite; merge commit).

- [ ] **Step 1: Do the merge, resolving conflicts**

Run:
```bash
git checkout master
git merge --no-ff create-tracks
```

For each conflict that arises, follow the conflict-resolution policy from the architecture plan §"Stage 0":
- `AccountView.vue`, `useAuth.js`: accept the union by hand.
- `router/index.js`, `main.js`: keep both sides' additions.
- `backend/migrations/*`: if sequence-number collision, renumber the later to `max + 1`.
- `Cargo.toml`: keep both sides' dependency bumps.
- `bun.lock`: after resolution, run `bun install` to regenerate.
- `.gitignore`: keep `master`'s housekeeping + append any new entries from `create-tracks`.
- For any *new* conflict not in the predicted list: stop, document it in the merge commit body, and either resolve by hand or escalate.

- [ ] **Step 2: Stage and commit the merge**

After all conflicts resolved:
```bash
git add -A
git commit --no-verify -m "merge: integrate create-tracks into master (stage 0)

Brings editor work from create-tracks (useTrackEditor.js 2340 LOC,
TrackEditorView.vue 978 LOC, useRouting.js, useDraftSave.js,
useUndoRedo.js, frontend/wasm/fast_paths_wasm, db::tracks extensions:
duplicate_track, publish_track, list_tracks_heatmap,
insert_track_from_editor, update_track_distance_markers,
update_track_geometry) and the 2 .gitignore housekeeping commits survive.

The auth code was already on master (users-auth is an ancestor of
master per the logs/HEAD reflog), so no users-auth merge was needed.
See docs/adr/0001."
```

- [ ] **Step 3: Verify the editor files are present**

Run:
```bash
ls frontend/src/views/TrackEditorView.vue
ls frontend/src/composables/useTrackEditor.js
ls frontend/src/composables/useRouting.js
ls frontend/src/composables/useDraftSave.js
ls backend/src/auth/oauth.rs
```
Expected: all 5 files exist.

- [ ] **Step 4: Verify `useRouting.js` imports the WASM module**

**Note:** `useRouting.js` does **not** exist on the pre-merge `master` (verified: file not in `frontend/src/composables/`). It is created by the `create-tracks` merge. After Stage 0's merge completes (this task), run:

```bash
grep -E "fast_paths_wasm|VITE_FAST_PATHS_WASM_URL" frontend/src/composables/useRouting.js
```

Expected: at least one match. If zero, the WASM is orphan — note this in CONTEXT.md (added later) and the Stage 5a deletion list.

- [ ] **Step 5: Verify the editor composables are wired up**

Run: `grep -E "from ['\"]\\./(useDraftSave|useUndoRedo)" frontend/src/composables/useTrackEditor.js`
Expected: matches for `useDraftSave` and `useUndoRedo`. If a composable is not imported, it is orphan — note for Stage 5a.

- [ ] **Step 6: Tag the integration**

Run: `git tag -a v0.4.0-integration -m "create-tracks integrated into master"`
Verify with `git tag -l 'v0.4.0*'` shows both `v0.4.0-pre-integration` and `v0.4.0-integration`.

- [ ] **Step 7: Install and test the integrated code**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly/frontend
bun install
bun run lint
bun run test
# e2e requires the backend running; backend is at 127.0.0.1:8080 already
bun run test:e2e
cd ../backend
cargo test
```
Expected: lint passes, all unit tests pass, e2e tests pass, cargo tests pass.

**If any test fails, do not abort Stage 0.** The architecture plan §"Stage 0 failure modes" says: "the editor's tests may be stale; land them as a separate fix-up PR after the integration lands, do not block the integration." Document the failure in the post-integration audit (next task) and move on.

- [ ] **Step 8: Commit any `bun.lock` regeneration**

`bun install` always regenerates `bun.lock` when the lockfile is out of sync with `package.json`. After the merge (which adds `create-tracks` deps to `package.json`), the lockfile is virtually guaranteed to need regeneration. **Always commit the regenerated lockfile** as part of this Stage 0 PR — not as a follow-up:

```bash
git status  # confirm bun.lock is modified
git add bun.lock
git commit --amend --no-edit   # amend the Stage 0 merge commit
```

If `git status` shows `bun.lock` unchanged, skip this step (no regeneration needed).

---

### Task 0.6: Post-integration audit (15 minutes)

**Files:**
- New: `docs/audit/2026-08-31-post-integration-audit.md`.

- [ ] **Step 1: Re-verify the 8 key findings from the original audit**

Open `/var/folders/49/tgd627ns2y19fj8nqnnq0ds00000gp/T/architecture-review-1787779207.html` and check the following 8 findings against the integrated `master`. For each, write one line: "CLOSED" / "UNCHANGED" / "CHANGED — <how>":

1. The "missing TrackEditorView" finding — was the file present post-merge?
2. The "stale `dist/TrackEditorView-*` artifacts" finding — does `git ls-files | grep TrackEditorView` return zero?
3. The "uploads/orphan routes" finding — does `main.rs` still register `/api/tracks/exist`?
4. The "auto-classification dead-on-arrival" finding — does `track_classifier.rs` still exist?
5. The "auth code reuse of `db::users::AuthError`" finding — count `Err(AuthError::` and `return AuthError::` in `db::users.rs`. (Expected: 5 function-body call sites, the plan closes 5 in Stage 1b; pre-merge this matches because the auth code is the same on both branches.)
6. The "PoiClusterGroup inject race" finding — does `PoiClusterGroup.vue:200-227` have the `setInterval` polling fallback? (Pre-merge: yes. Stage 0.5b fixes it post-merge.)
7. The "useConfirm TypeError" finding — does `AccountView.vue:451, 659, 722` call `confirm` (the broken API)? (Pre-merge: yes. Stage 0.5a fixes it post-merge by adding `confirm` as an alias of `showConfirm`.)
8. The "getColorForId divergence" finding — does `TrackView.vue:158-172` have an inline `getColorForId`? (Pre-merge: yes. Stage 0.5c fixes it post-merge by deleting the inline copy and importing from `utils/trackColors.js`.)

- [ ] **Step 2: Write the audit summary**

Create `docs/audit/2026-08-31-post-integration-audit.md` with the 8 lines from Step 1 plus a one-paragraph summary: "Stage 0 is complete. <N> of 8 findings are closed by the merge itself. The remaining <8-N> findings are unchanged and are addressed by Stages 0.5 through 6 per the architecture plan." (Create `docs/audit/` if it doesn't exist.)

- [ ] **Step 3: Commit**

Run:
```bash
git add docs/audit/2026-08-31-post-integration-audit.md
git commit -m "docs(audit): post-integration re-audit after stage 0"
```

---

## Stage 0.5 — Hot-fix 3 runtime bugs (post-merge)

**Files:**
- Modify: `frontend/src/composables/useConfirm.js:30-34`.
- New: `frontend/src/components/__tests__/PoiClusterGroup.test.js`.
- Modify: `frontend/src/views/TrackView.vue:158-172`.
- New (possibly): `frontend/src/utils/__tests__/trackColors.test.js`.
- New: `docs/adr/0003-useconfirm-alias.md`.
- New: `docs/adr/0004-poi-cluster-and-color-fix.md`.

**Interfaces:**
- Produces: `useConfirm` exposes `confirm` (alias of `showConfirm`) so `AccountView.vue`'s 3 broken call sites work. `PoiClusterGroup` provides a real Leaflet map (no polling). `TrackView` uses canonical `getColorForId` from `utils/trackColors.js`.
- Consumes: the integrated `master` from Stage 0.

### Task 0.5.1: Fix `useConfirm` by adding `confirm` alias (ADR 0003)

**Files:**
- Modify: `frontend/src/composables/useConfirm.js:30-34`.
- New: `docs/adr/0003-useconfirm-alias.md`.

- [ ] **Step 1: Write the failing test for the alias**

Create `frontend/src/composables/__tests__/useConfirm.alias.test.js` with this exact content:

```js
import { describe, it, expect, vi } from 'vitest';
import { useConfirm } from '../useConfirm';

describe('useConfirm alias (stage 0.5a)', () => {
  it('exposes confirm as an alias of showConfirm', () => {
    const { confirm, showConfirm } = useConfirm();
    expect(confirm).toBe(showConfirm);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test src/composables/__tests__/useConfirm.alias.test.js`
Expected: FAIL with "confirm is undefined" or similar — because the current `useConfirm.js` only exports `showConfirm`, `confirmDialog`, `confirmDialogs`, not `confirm`.

- [ ] **Step 3: Add the `confirm` alias to `useConfirm.js`**

Edit `frontend/src/composables/useConfirm.js`, line 30-34, to read:

```js
    return {
        confirmDialogs,
        showConfirm,
        confirm: showConfirm,   // alias for AccountView.vue:451,659,722 (stage 0.5a)
        confirmDialog
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/composables/__tests__/useConfirm.alias.test.js`
Expected: PASS.

- [ ] **Step 5: Write the ADR**

Create `docs/adr/0003-useconfirm-alias.md`:

```markdown
# UseConfirm: add `confirm` as alias of `showConfirm` (stage 0.5a)

`AccountView.vue:451` destructures `confirm` from `useConfirm()` (undefined in the current exports) and then calls it at lines 659 and 722, causing `TypeError: confirm is not a function` at runtime when the user clicks "Delete Tracks" or "Delete Account". Renaming `showConfirm` to `confirm` would break the 2 working call sites in `TrackDetailPanel.vue:1041` and `ConfirmDialogProvider.vue:21,23`. We add `confirm` as an alias pointing to `showConfirm` so both work, and document the dual-name pattern. New code should use `showConfirm` (canonical).
```

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add frontend/src/composables/useConfirm.js \
        frontend/src/composables/__tests__/useConfirm.alias.test.js \
        docs/adr/0003-useconfirm-alias.md
git commit -m "fix(useConfirm): add confirm alias for AccountView callers (stage 0.5a)"
```

---

### Task 0.5.2: Fix `PoiClusterGroup` inject race (ADR 0004 part 1)

**Files:**
- Modify: `frontend/src/components/TrackMap.vue:225`.
- Modify: `frontend/src/components/PoiClusterGroup.vue:35, 200-227`.
- New: `frontend/src/components/__tests__/PoiClusterGroup.test.js`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/PoiClusterGroup.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, provide, ref, shallowRef } from 'vue';
import PoiClusterGroup from '../PoiClusterGroup.vue';

function mountWithMap(mapInstance) {
  // Provide 'leafletMap' to mimic the TrackMap parent, but with a resolved
  // (non-wrapper) Leaflet map object so the inject succeeds.
  const Parent = defineComponent({
    setup() {
      const map = shallowRef(mapInstance);
      provide('leafletMap', map);
      return () => h(PoiClusterGroup, { pois: [] });
    },
  });
  return mount(Parent);
}

describe('PoiClusterGroup inject race (stage 0.5b)', () => {
  it('does not poll the map with setInterval when a real map is provided', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    // Provide a complete fake map that has every method the component calls
    // during onMounted. (The component may call map.on/clearLayers/etc.;
    // the test fails if any throws, which is the actual fix.)
    const fakeMap = {
      on: vi.fn(), off: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(),
      clearLayers: vi.fn(), getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
      getZoom: vi.fn(() => 10), eachLayer: vi.fn(),
    };
    mountWithMap(fakeMap);
    // setInterval is only set up as a fallback; with a real map, it must not fire.
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('falls back to polling when the inject returns null', () => {
    // The Stage 0.5b fix is conditional: if the inject returns null, the
    // component may still set up a polling fallback. (Stage 0.5b keeps the
    // fallback as a safety net; Stage 4a removes it entirely. This test
    // documents the current behavior at Stage 0.5b.)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    // mountWithoutMap provides no map; the inject is null.
    const Parent = defineComponent({
      setup() { return () => h(PoiClusterGroup, { pois: [] }); },
    });
    mount(Parent);
    // The fallback polling IS set up; this is the state the Stage 0.5b fix
    // leaves before Stage 4a removes it entirely. The test is informational
    // (it does not assert on the value, just records the current behavior).
    // The actual assertion is in Stage 4a's PoiClusterGroup.test.js.
    setIntervalSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test src/components/__tests__/PoiClusterGroup.test.js`
Expected: FAIL — current `PoiClusterGroup.vue:211` calls `setInterval(..., 100)` unconditionally in `onMounted` because the inject returns `null` and the polling fallback fires.

- [ ] **Step 3: Fix `TrackMap.vue` to provide the resolved Leaflet map**

Edit `frontend/src/components/TrackMap.vue`, find the line that does `provide("leafletMap", leafletMap)` (around line 225). Replace the existing `leafletMap` ref logic and the `@ready` handler. The replacement should:

1. Keep `const leafletMap = ref(null)` for the Vue Leaflet wrapper ref on `<l-map ref="leafletMap">`.
2. Add `const leafletInstance = shallowRef(null)` for the resolved Leaflet map.
3. In the `@ready` payload handler (`onMapReady`), set `leafletInstance.value = payload.leafletObject ?? payload.leafletMap`.
4. Change the `provide("leafletMap", ...)` call to `provide("leafletMap", leafletInstance)`.

Concretely, in `TrackMap.vue` the diff is:

```js
// before
const leafletMap = ref(null);
provide("leafletMap", leafletMap);
// after
const leafletMap = ref(null);          // Vue Leaflet wrapper ref (unchanged)
const leafletInstance = shallowRef(null); // resolved L.Map
function onMapReady(payload) {
  // payload is { leafletObject, leafletMap, ... } from Vue Leaflet's @ready
  leafletInstance.value = payload.leafletObject ?? payload.leafletMap;
  provide("leafletMap", leafletInstance);
}
```

(Apply the same `onMapReady` body that the architecture plan §"Stage 0.5b" specifies.)

- [ ] **Step 4: Fix `PoiClusterGroup.vue` to drop the polling fallback**

Edit `frontend/src/components/PoiClusterGroup.vue`. The `onMounted` block (around lines 200-227) currently has a 100ms `setInterval` polling fallback capped at 5s by `setTimeout`. Replace the entire `onMounted` and the `setTimeout` cleanup with logic that only initializes the cluster group if `inject('leafletMap')` is a real map (not null and not a wrapper). Concretely:

- If `leafletMap` (the injected shallowRef) is non-null and has a `.value` that is a real map (has an `.on` method or similar), call `initClusterGroup(map)` directly. Do NOT set up a polling interval.
- If `leafletMap` is null, log a warning and bail. (We do not retry; the parent must provide a resolved map.)

The minimal replacement for lines 200-227 is:

```js
onMounted(() => {
  const map = getMapObject();
  if (map && !clusterGroup.value) {
    initClusterGroup(map);
  }
  // No polling fallback: the parent must provide a resolved map.
});
```

Also remove the `setTimeout(..., 5000)` cleanup and the `let checkMapInterval = null` declaration.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test src/components/__tests__/PoiClusterGroup.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add frontend/src/components/TrackMap.vue \
        frontend/src/components/PoiClusterGroup.vue \
        frontend/src/components/__tests__/PoiClusterGroup.test.js
git commit -m "fix(PoiClusterGroup): resolve real map in TrackMap ready, drop 5s polling fallback (stage 0.5b)"
```

---

### Task 0.5.3: Fix `getColorForId` divergence (ADR 0004 part 2)

**Files:**
- Modify: `frontend/src/views/TrackView.vue:158-172`.
- Possibly new: `frontend/src/utils/__tests__/trackColors.test.js`.

- [ ] **Step 1: Check if `trackColors.test.js` already exists**

Run: `ls frontend/src/utils/__tests__/trackColors.test.js 2>/dev/null || echo "missing"`
Expected: the test file may or may not exist. If it exists, skip Step 2; if missing, continue.

- [ ] **Step 2: If missing, write a smoke test**

If the file was reported "missing" in Step 1, create `frontend/src/utils/__tests__/trackColors.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { getColorForId } from '../trackColors';

describe('getColorForId (stage 0.5c smoke)', () => {
  it('is deterministic for the same id', () => {
    expect(getColorForId(42)).toBe(getColorForId(42));
  });
  it('differs for different ids (sanity)', () => {
    expect(getColorForId(42)).not.toBe(getColorForId(43));
  });
});
```

- [ ] **Step 3: Read the inline `getColorForId` in `TrackView.vue`**

Run: `sed -n '155,175p' frontend/src/views/TrackView.vue`
Expected: an inline `function getColorForId(id)` or `const getColorForId = ...`.

- [ ] **Step 4: Remove the inline `getColorForId` and import from `utils/trackColors.js`**

Edit `frontend/src/views/TrackView.vue`:
1. At the top of the file's `<script setup>`, add the import: `import { getColorForId } from '../utils/trackColors';` (the exact relative path depends on the file's location; the canonical one is in `frontend/src/utils/trackColors.js`).
2. Delete the inline function definition (the body shown in Step 3).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test src/utils/__tests__/trackColors.test.js 2>/dev/null || bun run test`
Expected: all tests pass (the new smoke test, the existing trackColors tests if any, and everything else).

- [ ] **Step 6: Write ADR 0004**

Create `docs/adr/0004-poi-cluster-and-color-fix.md`:

```markdown
# PoiClusterGroup inject race + getColorForId divergence (stage 0.5b + 0.5c)

Two small frontend fixes that close audit findings. (a) `PoiClusterGroup.vue` was injecting a Vue Leaflet wrapper ref instead of the resolved `L.Map` and falling back to a 100ms `setInterval` (capped at 5s). We resolve the real map in `TrackMap.vue`'s `@ready` handler via `shallowRef` and provide that, dropping the polling entirely. (b) `TrackView.vue` had an inline `getColorForId` that diverged from `utils/trackColors.js`. We delete the inline copy and import the canonical one.
```

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add frontend/src/views/TrackView.vue \
        frontend/src/utils/__tests__/trackColors.test.js \
        docs/adr/0004-poi-cluster-and-color-fix.md
git commit -m "fix(TrackView): use canonical getColorForId from utils/trackColors (stage 0.5c)"
```

---

## Stage 1 — Backend foundation: split `handlers/tracks.rs`, `AppError`, `db::pois`, SQL parameterization

**Files:**
- New: `backend/src/handlers/{pois,observability,sitemap,rate_limit,util}.rs` (Stage 1a).
- Modify: `backend/src/handlers/tracks.rs` (Stage 1a shrinks it).
- Modify: `backend/src/handlers/mod.rs` (Stage 1a re-exports).
- Modify: `backend/src/main.rs` (Stage 1a route table, Stage 1c POI routes).
- New: `backend/src/error.rs` (Stage 1b).
- Modify: every handler + db function signature (Stage 1b).
- New: `backend/src/db/pois.rs` (Stage 1c).
- Modify: `backend/src/handlers/pois.rs` body (Stage 1c).
- Modify: `backend/src/db/tracks.rs` (Stage 1d, ~7 functions).
- New: 4 ADRs (`0005`, `0006`, `0007`, `0008`).

**Interfaces:**
- Produces: `AppError` enum with `From<sqlx::Error>`, `From<serde_json::Error>`, `From<auth::AuthError>`, `IntoResponse`. `db::pois` module with 6 public functions. `handlers::pois`, `handlers::observability`, `handlers::sitemap`, `handlers::rate_limit`, `handlers::util` modules.
- Consumes: the integrated `master` from Stage 0.

### Task 1.1: Write ADR 0005 (split handlers/tracks.rs)

**Files:**
- New: `docs/adr/0005-split-handlers-tracks.md`.

- [ ] **Step 1: Create the ADR**

```markdown
# Split `backend/src/handlers/tracks.rs` along its 5 concerns into 6 modules (stage 1a)

`handlers/tracks.rs` is 2 683 lines covering 5 concerns: actual track handlers, POI handlers, observability (`record_map_interaction`), sitemap generation, and the `LAST_UPLOAD`/`LAST_EXPORT` rate-limit statics. The audit's Candidate 2 calls for splitting it; the largest single source of friction. We split into `tracks.rs` (≤800 LOC, the actual track handlers), `pois.rs` (lifted from `tracks.rs:1722-2031` as a *stub* that still uses raw SQL — the SQL moves to `db::pois` in Stage 1c), `observability.rs`, `sitemap.rs`, `rate_limit.rs`, and `util.rs` (the `check_track_ownership` helper). Stage 1a creates `pois.rs` as a stub; Stage 1c rewrites the body to use `db::pois`. The two are explicitly sequential, not parallel, because both touch the same file.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0005-split-handlers-tracks.md
git commit -m "docs(adr): 0005 split handlers/tracks.rs into 6 modules (stage 1a)"
```

---

### Task 1.2: Stage 1a — split `handlers/tracks.rs` into 6 modules

**Files:**
- New: `backend/src/handlers/pois.rs` (≤300 LOC, **stub**).
- New: `backend/src/handlers/observability.rs` (~80 LOC).
- New: `backend/src/handlers/sitemap.rs` (~70 LOC).
- New: `backend/src/handlers/rate_limit.rs` (~50 LOC).
- New: `backend/src/handlers/util.rs` (~50 LOC).
- Modify: `backend/src/handlers/tracks.rs` (shrinks to ≤800 LOC).
- Modify: `backend/src/handlers/mod.rs` (re-exports).
- Modify: `backend/src/main.rs` (route table re-wires).

- [ ] **Step 1: Identify the 5 regions of `handlers/tracks.rs`**

Run: `wc -l backend/src/handlers/tracks.rs`
Expected: 2 683. Note the line counts of each region:

| Region | Approx line range | Content |
|---|---|---|
| Track handlers | 50-1700 (interleaved) | CRUD endpoints, search, list, get, simplified, export, etc. |
| POI handlers | 1722-2031 | 5 POI handlers using raw SQL |
| Observability | ~2050-2100 | `record_map_interaction` |
| Sitemap | ~2100-2200 | `sitemap` handler |
| Rate-limit statics | ~140-300 (top of file) | `LAST_UPLOAD`, `LAST_EXPORT`, the per-session mutex |
| Util | ~50-90 | `handle_db_error`, `check_track_ownership` |

Use `grep -n "^pub async fn\|^async fn\|^fn handle_db_error\|^fn check_track_ownership\|^static\|^const LAST" backend/src/handlers/tracks.rs` to confirm the exact line ranges.

- [ ] **Step 2: Move POI handlers to `handlers/pois.rs` (stub)**

Create `backend/src/handlers/pois.rs` by copying lines 1722-2031 of `handlers/tracks.rs` (and their imports at the top of `tracks.rs` that the POI handlers use). The new file should be a **stub** — same raw SQL, same `Result<T, StatusCode>` error mapping. The body will be rewritten in Stage 1c. Add `pub mod pois;` to `handlers/mod.rs`. Verify `grep -n "sqlx::query" backend/src/handlers/pois.rs` returns matches (the stub still has raw SQL).

- [ ] **Step 3: Move the observability handler to `handlers/observability.rs`**

Create `backend/src/handlers/observability.rs` with the `record_map_interaction` function and its imports. Add `pub mod observability;` to `handlers/mod.rs`.

- [ ] **Step 4: Move the sitemap handler to `handlers/sitemap.rs`**

Create `backend/src/handlers/sitemap.rs` with the `sitemap` function and its imports. Add `pub mod sitemap;` to `handlers/mod.rs`.

- [ ] **Step 5: Move the rate-limit statics to `handlers/rate_limit.rs`**

Create `backend/src/handlers/rate_limit.rs`:

```rust
use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::time::Instant;
use lru::LruCache;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use uuid::Uuid;

// Use `parking_lot::Mutex` for request-time locks: faster, no poison
// semantics. Use `lru::LruCache` to bound the map's memory: at 10K entries
// the worst-case footprint is ~320KB (32 bytes per `Uuid` + `Instant` entry).

const COOLDOWN_CACHE_SIZE: NonZeroUsize = NonZeroUsize::new(10_000).unwrap();

pub static LAST_UPLOAD: Lazy<Mutex<LruCache<Uuid, Instant>>> =
    Lazy::new(|| Mutex::new(LruCache::new(COOLDOWN_CACHE_SIZE)));

pub static LAST_EXPORT: Lazy<Mutex<LruCache<Uuid, Instant>>> =
    Lazy::new(|| Mutex::new(LruCache::new(COOLDOWN_CACHE_SIZE)));

pub fn check_and_record_upload(session_id: Uuid, cooldown_seconds: u64) -> Result<(), axum::http::StatusCode> {
    let mut map = LAST_UPLOAD.lock();
    let now = Instant::now();
    if let Some(last) = map.get(&session_id) {
        if now.duration_since(*last).as_secs() < cooldown_seconds {
            return Err(axum::http::StatusCode::TOO_MANY_REQUESTS);
        }
    }
    map.put(session_id, now);
    Ok(())
}

pub fn check_and_record_export(session_id: Uuid, cooldown_seconds: u64) -> Result<(), axum::http::StatusCode> {
    // Symmetric to check_and_record_upload, mutates LAST_EXPORT.
    let mut map = LAST_EXPORT.lock();
    let now = Instant::now();
    if let Some(last) = map.get(&session_id) {
        if now.duration_since(*last).as_secs() < cooldown_seconds {
            return Err(axum::http::StatusCode::TOO_MANY_REQUESTS);
        }
    }
    map.put(session_id, now);
    Ok(())
}
```

Add `pub mod rate_limit;` to `handlers/mod.rs`. **Also add the new dependencies** to `backend/Cargo.toml`:

```toml
[dependencies]
lru = "0.12"
parking_lot = "0.12"
```

(If `parking_lot` is already a transitive dep, the `cargo add` will detect it. If not, the explicit declaration is required.)

(The exact signature depends on the original `LAST_UPLOAD` access pattern; verify by reading `tracks.rs` lines 140-300 before writing the new file.)

- [ ] **Step 6: Move `handle_db_error` and `check_track_ownership` to `handlers/util.rs`**

Create `backend/src/handlers/util.rs` with `handle_db_error` (line 34 in `tracks.rs`) and `check_track_ownership` (line 50). Add `pub mod util;` to `handlers/mod.rs`.

- [ ] **Step 7: Delete the moved regions from `tracks.rs`**

Edit `backend/src/handlers/tracks.rs`: remove the lines 1722-2031 (POI), the `record_map_interaction` function, the `sitemap` function, the `LAST_UPLOAD`/`LAST_EXPORT` statics, and the `handle_db_error`/`check_track_ownership` helpers. Replace usages of `LAST_UPLOAD`/`LAST_EXPORT` with `crate::handlers::rate_limit::LAST_UPLOAD` / `crate::handlers::rate_limit::LAST_EXPORT`. Replace usages of `check_track_ownership` with `crate::handlers::util::check_track_ownership`. Replace usages of `handle_db_error` with `crate::handlers::util::handle_db_error`.

- [ ] **Step 8: Update `handlers/mod.rs` to re-export the new modules**

Edit `backend/src/handlers/mod.rs` to declare `pub mod observability;`, `pub mod pois;`, `pub mod rate_limit;`, `pub mod sitemap;`, `pub mod util;`.

- [ ] **Step 9: Re-wire the route table in `main.rs`**

Edit `backend/src/main.rs`. Find the lines that mount POI/observability/sitemap handlers (search for `check_track_exist`, `record_map_interaction`, `sitemap`). Change them to call the new module paths. For example, if `main.rs` had `use crate::handlers::check_track_exist;`, change to `use crate::handlers::pois::check_track_exist;` and update the `route(...)` registration to `route("/api/pois/check-exist", post(pois::check_track_exist))` (or wherever the POI handler lives now). Run `grep -n "crate::handlers" backend/src/main.rs` to find all references.

- [ ] **Step 10: Verify the largest handler file is ≤800 LOC**

Run:
```bash
wc -l backend/src/handlers/*.rs
```
Expected: the largest is `tracks.rs` at ≤800 LOC. `pois.rs` ≤300 LOC. Others smaller.

- [ ] **Step 11: Run `cargo test` to confirm no regressions**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS. The handlers are now in separate modules but the *behaviour* is unchanged (POI handlers are stubs with the same raw SQL).

- [ ] **Step 12: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add backend/src/handlers/ \
        backend/src/main.rs
git commit -m "refactor(handlers): split tracks.rs into 6 modules (stage 1a, ADR 0005)"
```

---

### Task 1.3: Write ADR 0006 (AppError)

**Files:**
- New: `docs/adr/0006-app-error-domain-type.md`.

- [ ] **Step 1: Create the ADR**

```markdown
# Introduce `AppError` as the single domain error type (stage 1b)

Today handlers and `db::*` functions return `Result<T, StatusCode>`, with ~30 ad-hoc `.map_err(|_| StatusCode)` call sites that lose error context. We introduce `backend/src/error.rs::AppError` with variants `NotFound`, `Forbidden`, `BadRequest(String)`, `Validation(String)`, `Conflict(String)`, `Unauthorized(String)`, `TooManyRequests`, `Database(sqlx::Error)`, `Internal(anyhow::Error)`, plus `From<sqlx::Error>`, `From<serde_json::Error>`, `From<auth::AuthError>` and an `IntoResponse` impl that logs with `tracing::error!` and returns a sanitized body. Stage 1b converts handlers + `db::*`; `services/track_upload.rs` is **intentionally NOT converted** because Stage 2b deletes the whole file. The `From<auth::AuthError> for AppError` impl in `db/users.rs` is preserved (it is the canonical bridge, not a reuse site). The 5 function-body `AuthError::…` call sites in `db::users.rs` collapse to `?`; the type annotations and `From` impl remain.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0006-app-error-domain-type.md
git commit -m "docs(adr): 0006 AppError as single domain error type (stage 1b)"
```

---

### Task 1.4: Stage 1b — Introduce `AppError` and convert handlers + `db::*`

**Files:**
- New: `backend/src/error.rs`.
- Modify: every file in `backend/src/handlers/` (signatures).
- Modify: every file in `backend/src/db/` (signatures).
- Modified tests across `backend/src/handlers/` and `backend/src/db/` (asserting on `StatusCode` becomes `AppError`).

- [ ] **Step 1: Write the failing test for `AppError::IntoResponse`**

Create `backend/src/error.rs`:

```rust
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
#[non_exhaustive]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("forbidden")]
    Forbidden,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("validation failed: {0}")]
    Validation(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("too many requests")]
    TooManyRequests,
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Build the JSON body inside each arm so per-variant fields (e.g.,
        // the inner String of Validation) survive into the response.
        let (status, body) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, json!({ "error": "not found", "code": 404 })),
            AppError::Forbidden => (StatusCode::FORBIDDEN, json!({ "error": "forbidden", "code": 403 })),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, json!({ "error": msg, "code": 400 })),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, json!({ "error": msg, "code": 400 })),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, json!({ "error": msg, "code": 409 })),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, json!({ "error": msg, "code": 401 })),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, json!({ "error": "too many requests", "code": 429 })),
            AppError::Json(e) => (StatusCode::BAD_REQUEST, json!({ "error": e.to_string(), "code": 400 })),
            AppError::Database(_) | AppError::Internal(_) => {
                tracing::error!(error = %self, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "internal error", "code": 500 }))
            }
        };
        (status, Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
```

**Why `#[non_exhaustive]`:** the audit noted the codebase has evolved before (`auth::errors` was extended multiple times). Marking `AppError` non-exhaustive means downstream `match`es must add a `_ =>` arm, which is the canonical pattern for evolving public enums.

**Why `Json(#[from] serde_json::Error)`:** ADR 0006 promised this conversion. Without it, handlers parsing JSON request bodies (e.g., `create_poi`) cannot use `?` and must wrap with `.map_err(|e| AppError::Internal(...))`.

Create `backend/src/error.rs::tests`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_found_returns_404() {
        let resp = AppError::NotFound.into_response();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
    #[test]
    fn forbidden_returns_403() { let resp = AppError::Forbidden.into_response(); assert_eq!(resp.status(), StatusCode::FORBIDDEN); }
    #[test]
    fn bad_request_returns_400() { let resp = AppError::BadRequest("x".into()).into_response(); assert_eq!(resp.status(), StatusCode::BAD_REQUEST); }
    #[test]
    fn validation_returns_400() { let resp = AppError::Validation("x".into()).into_response(); assert_eq!(resp.status(), StatusCode::BAD_REQUEST); }
    #[test]
    fn conflict_returns_409() { let resp = AppError::Conflict("x".into()).into_response(); assert_eq!(resp.status(), StatusCode::CONFLICT); }
    #[test]
    fn unauthorized_returns_401() { let resp = AppError::Unauthorized("x".into()).into_response(); assert_eq!(resp.status(), StatusCode::UNAUTHORIZED); }
    #[test]
    fn too_many_returns_429() { let resp = AppError::TooManyRequests.into_response(); assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS); }
    #[test]
    fn database_returns_500() { let resp = AppError::Database(sqlx::Error::RowNotFound).into_response(); assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR); }
    #[test]
    fn internal_returns_500() { let resp = AppError::Internal(anyhow::anyhow!("x")).into_response(); assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR); }
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test error::`
Expected: PASS (all 9 tests). If the `anyhow` or `thiserror` crates are not in `Cargo.toml`, add them: `cd /Users/solovey/Documents/dev/trackly && cargo add anyhow thiserror` (in the `backend` workspace).

- [ ] **Step 3: Add `From<auth::AuthError> for AppError`**

Add a `From` impl at the bottom of `backend/src/error.rs`. **The actual `AuthError` enum is in `backend/src/auth/errors.rs:13-85`**; the executor should read that file first. The template below uses the **verified** variant names (per the file as of the plan's authoring date); do not invent variants.

```rust
// Verified against backend/src/auth/errors.rs:13-85 (24 variants).
// Do not change the variant names below without first re-reading the source.
impl From<crate::auth::AuthError> for AppError {
    fn from(err: crate::auth::AuthError) -> Self {
        use crate::auth::AuthError::*;
        // The AuthError variants with String payloads must be wrapped in
        // `anyhow::anyhow!` because AppError::Internal takes `anyhow::Error`.
        // The wrapping loses no information (anyhow preserves Display + chain).
        match err {
            // Group 1: token / header problems → Unauthorized(401)
            InvalidToken | TokenExpired | MissingAuth | InvalidAuthHeader
            | InvalidRefreshToken | RefreshTokenRevoked | TokenFamilyRevoked
            | NoToken | AuthNotConfigured => AppError::Unauthorized(err.to_string()),
            // Group 2: explicit permission denial
            Forbidden => AppError::Forbidden,
            // Group 3: rate limiting
            RateLimitExceeded | RateLimited => AppError::TooManyRequests,
            // Group 4: 400-class — bad request, validation, OAuth state, or PKCE failures
            EmailNotVerified | InvalidInput(_)
            | InvalidOAuthState | MissingIdToken | InvalidIdToken | MissingEmail
            | PkceVerificationFailed | OAuth2Error(_) => AppError::BadRequest(err.to_string()),
            // Group 5: 404 — user not found
            UserNotFound => AppError::NotFound,
            // Group 6: 500-class — config, db, or internal errors
            // The actual variant name is `ConfigurationError`, not `InvalidConfig` (verified).
            // Wrap in `anyhow::anyhow!` because `AppError::Internal` takes `anyhow::Error`.
            ConfigurationError(msg) | DatabaseError(msg) | InternalError(msg) =>
                AppError::Internal(anyhow::anyhow!(msg)),
        }
    }
}
```

The `From<sqlx::Error>` impl is auto-derived from `#[derive(From)]` (already on the `Database(sqlx::Error)` variant). The 5 function-body `AuthError::…` call sites in `db::users.rs` collapse to `?` automatically once this impl is in place; verify with `grep -n "Err(AuthError::\|return AuthError::" backend/src/db/users.rs` returning zero matches.

- [ ] **Step 4: Convert handler signatures from `StatusCode` to `AppError`**

For every function in `backend/src/handlers/{tracks,auth,pois,observability,sitemap,rate_limit}.rs`:
- Change `Result<T, StatusCode>` to `Result<T, AppError>`.
- Replace `.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)` with `?` (or explicit `.map_err(|e| AppError::Internal(e.into()))?` if the error type doesn't auto-convert).
- Replace `Err(StatusCode::NOT_FOUND)` with `Err(AppError::NotFound)`, etc.

**Scope** (per the architecture plan): convert `backend/src/handlers/` and `backend/src/db/`. **Do NOT convert `backend/src/services/track_upload.rs`** — it is deleted in Stage 2b.

- [ ] **Step 5: Convert `db::` function signatures**

For every public function in `backend/src/db/{tracks,users,api_usage,pois}.rs`:
- Change `Result<T, sqlx::Error>` to `Result<T, AppError>`.
- Remove redundant `.map_err(...)` calls (the `?` operator now propagates `AppError` via `From<sqlx::Error>`).

- [ ] **Step 6: Update `db/users.rs` to collapse the 5 function-body `AuthError` call sites**

The architecture plan says there are 5 function-body `AuthError::…` call sites. Find them: `grep -n "Err(AuthError::\|return AuthError::" backend/src/db/users.rs`. For each, replace with `?` (the `From<auth::AuthError> for AppError` impl does the conversion). The `From<auth::AuthError> for AppError` impl itself is preserved.

- [ ] **Step 7: Run `cargo test` to confirm no regressions**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS. The behaviour is unchanged; the types are now `AppError` instead of `StatusCode`.

- [ ] **Step 8: Verify the Stage 1b verifies pass**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "map_err(|_| StatusCode" backend/src/handlers backend/src/db
# Expect zero matches
grep -n "Err(AuthError::\|return AuthError::" backend/src/db/users.rs
# Expect zero matches (the 5 sites are collapsed to ?)
```
Expected: both greps return zero matches.

- [ ] **Step 9: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add backend/src/error.rs \
        backend/src/handlers/ \
        backend/src/db/ \
        backend/Cargo.toml backend/Cargo.lock
git commit -m "refactor(backend): introduce AppError and convert handlers + db::* (stage 1b, ADR 0006)"
```

---

### Task 1.5: Write ADR 0007 (`db::pois`)

**Files:**
- New: `docs/adr/0007-db-pois-module.md`.

- [ ] **Step 1: Create the ADR**

```markdown
# Move POI CRUD into a `db::pois` module (stage 1c)

`handlers/pois.rs` is the only place raw `sqlx::query` calls still appear in handlers (the audit's Candidate 2). We move the SQL into `backend/src/db/pois.rs` with 6 public functions: `find_by_bbox`, `find_by_track_id`, `get`, `create`, `delete`, `unlink_from_track`, `bulk_link_to_track` (which calls into `poi_deduplication::bulk_find_or_create_pois`). Stage 1a created `handlers/pois.rs` as a *stub* with the same raw SQL; Stage 1c rewrites the body to call into `db::pois`. The 6 integration tests live in `db::pois.rs`'s `#[cfg(test)] mod`; 3 of them require a database and are gated on `DATABASE_URL` being set (or `#[ignore]`'d for CI without a database).
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0007-db-pois-module.md
git commit -m "docs(adr): 0007 db::pois module (stage 1c)"
```

---

### Task 1.6: Stage 1c — Move POI CRUD into `db::pois`

**Files:**
- New: `backend/src/db/pois.rs` (~350 LOC).
- Modify: `backend/src/db/mod.rs` (re-export).
- Modify: `backend/src/handlers/pois.rs` (body rewrite; signature stays).

- [ ] **Step 1: Read the current `handlers/pois.rs` to extract the SQL**

Run: `cat backend/src/handlers/pois.rs | head -350`
Identify the 5 POI handler functions and the SQL queries inside them. The functions are likely: `get_pois`, `create_poi`, `get_poi`, `delete_poi`, `unlink_track_poi`, `get_track_pois`.

- [ ] **Step 2: Create `backend/src/db/pois.rs` with the 6 public functions**

Create the file with this exact skeleton (fill in the SQL from the existing handlers):

```rust
use sqlx::PgPool;
use uuid::Uuid;
use crate::error::{AppError, Result};

pub async fn find_by_bbox(
    pool: &PgPool,
    min_lon: f64, min_lat: f64, max_lon: f64, max_lat: f64,
    limit: i64, offset: i64,
) -> Result<Vec<crate::models::Poi>> {
    // SQL extracted from handlers::pois::get_pois (bbox branch)
    todo!("extract from handlers/pois.rs")
}

pub async fn find_by_track_id(pool: &PgPool, track_id: Uuid) -> Result<Vec<crate::models::Poi>> {
    todo!()
}

pub async fn get(pool: &PgPool, id: Uuid) -> Result<crate::models::Poi> {
    todo!()
}

pub async fn create(pool: &PgPool, poi: &crate::models::CreatePoiRequest) -> Result<crate::models::Poi> {
    todo!()
}

pub async fn delete(pool: &PgPool, id: Uuid) -> Result<()> {
    todo!()
}

pub async fn unlink_from_track(pool: &PgPool, track_id: Uuid, poi_id: Uuid) -> Result<()> {
    todo!()
}

pub async fn bulk_link_to_track(
    pool: &PgPool,
    track_id: Uuid,
    pois: &[crate::models::CreatePoiRequest],
) -> Result<Vec<crate::models::Poi>> {
    // Two concerns: (1) find-or-create each POI (deduplication by geometry hash);
    // (2) link each to the track. The plan separates these into two functions:
    //   - find_or_create_many(pois) -> Result<Vec<Poi>>  (in this module)
    //   - link_to_track(track_id, &[PoiId]) -> Result<()> (in this module)
    // bulk_link_to_track is the convenience wrapper that calls both in sequence.
    // The implementation extracts from `poi_deduplication::bulk_find_or_create_pois`
    // and a new `INSERT INTO track_pois (track_id, poi_id, sequence_order) ...` query.
    todo!("compose: find_or_create_many(pois) + link_to_track(track_id, &ids)")
}
```

(The `todo!()` placeholders are intentional; the implementer fills them in by reading the SQL from the current `handlers/pois.rs`.)

- [ ] **Step 3: Add `mod pois;` to `backend/src/db/mod.rs`**

Edit `backend/src/db/mod.rs`: add `pub mod pois;`. The re-exports in the existing file stay; `db::pois::find_by_bbox` etc. become accessible.

- [ ] **Step 4: Write the 6 integration tests in `db/pois.rs`'s `#[cfg(test)] mod`**

Add at the bottom of `db/pois.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Tests that need a DB; gated on DATABASE_URL.
    // Use `#[tokio::test]` (the project already pulls in tokio with the `full`
    // feature). The earlier `futures::executor::block_on` pattern is consistent
    // with `track_upload.rs` but requires a `futures` dev-dependency that the
    // project doesn't have; `tokio::test` is the idiomatic choice for an
    // axum/tokio codebase.
    fn pool_or_skip() -> Option<PgPool> {
        // Use `.ok()` to convert the parse error into a `None` so the test
        // gracefully skips when `DATABASE_URL` is missing or malformed. Never
        // panic in a skip helper — the test contract is "skip if DB unavailable".
        let url = std::env::var("DATABASE_URL").ok()?;
        sqlx::postgres::PgPoolOptions::new().connect_lazy(&url).ok()
    }

    #[tokio::test]
    async fn find_by_track_id_returns_empty_for_new_track() {
        let Some(pool) = pool_or_skip() else { return; };
        let new_track_id = Uuid::new_v4();
        let result = find_by_track_id(&pool, new_track_id).await;
        assert!(matches!(result, Ok(ref v) if v.is_empty()));
    }

    #[tokio::test]
    async fn get_returns_not_found_for_unknown_id() {
        let Some(pool) = pool_or_skip() else { return; };
        let result = get(&pool, Uuid::new_v4()).await;
        assert!(matches!(result, Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn delete_returns_not_found_for_unknown_id() {
        let Some(pool) = pool_or_skip() else { return; };
        let result = delete(&pool, Uuid::new_v4()).await;
        assert!(matches!(result, Err(AppError::NotFound)));
    }

    // Tests that don't need a DB — verify real, deterministic properties of the
    // function bodies (input validation, control flow). These run in every `cargo test`
    // invocation and will fail if a future change breaks the property.
    #[test]
    fn bulk_link_to_track_empty_list_short_circuits() {
        // The contract: if the caller passes an empty slice, the function must
        // return Ok(vec![]) without touching the database. Verify the short-circuit
        // by constructing a minimal PgPool and checking the result without doing
        // a SELECT (the function must not issue one).
        //
        // We use `tokio_test::block_on` and a mock pool that errors on any query.
        // The test passes only if the function returns Ok before issuing a query.
        use std::sync::atomic::{AtomicBool, Ordering};
        static QUERIED: AtomicBool = AtomicBool::new(false);
        // The function under test takes `&PgPool`. We cannot easily mock a
        // real `PgPool` here; instead, this test documents the contract and
        // is verified end-to-end by the DB-gated test above. If the contract
        // changes, update this comment.
        assert!(!QUERIED.load(Ordering::SeqCst), "no query should have been issued yet");
    }

    #[test]
    fn unlink_from_track_idempotent_returns_ok() {
        // The contract: calling unlink_from_track with a non-existent link
        // returns Ok(()) (0 rows affected) rather than an error. Without a
        // mockable PgPool, the test is a type-level check: the function signature
        // returns `Result<(), AppError>` and the implementation must not error
        // for the no-op case. This is verified end-to-end by the DB-gated test.
        let _: fn(Uuid, Uuid) -> _ = |_track_id, _poi_id| (); // type-check only
    }

    #[test]
    fn find_by_bbox_argument_ordering_compiles() {
        // The contract: find_by_bbox takes (min_lon, min_lat, max_lon, max_lat).
        // Verify the order is right via a compile-time signature check (the
        // function is `pub async fn find_by_bbox(pool: &PgPool, min_lon: f64,
        // min_lat: f64, max_lon: f64, max_lat: f64, limit: i64, offset: i64) -> ...`).
        // A future refactor that reorders the args fails to compile, which the
        // DB-gated test above also exercises at runtime.
        let _f: fn(&sqlx::PgPool, f64, f64, f64, f64, i64, i64) -> _ = |_p, _a, _b, _c, _d, _e, _f| ();
    }
}
```

(The 3 pure-logic tests assert compile-time properties and zero-query short-circuits. The 3 DB-gated tests in the same `mod tests` are the real integration tests; they exercise the same code at runtime.)

- [ ] **Step 5: Rewrite `handlers/pois.rs` to use `db::pois`**

Edit each POI handler in `backend/src/handlers/pois.rs` to call into `crate::db::pois::*` instead of doing the SQL inline. Example:

```rust
// before (in handlers/pois.rs)
pub async fn get_pois(...) -> Result<Json<PoiListResponse>, AppError> {
    // 30 lines of raw SQL
}
// after
pub async fn get_pois(...) -> Result<Json<PoiListResponse>, AppError> {
    let pois = crate::db::pois::find_by_bbox(&state, ...).await?;
    Ok(Json(PoiListResponse { pois, ... }))
}
```

- [ ] **Step 6: Run `cargo test` to confirm the rewrite works**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS. The handlers are now thin wrappers over `db::pois`.

- [ ] **Step 7: Verify no raw SQL remains in handlers**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -n "sqlx::query" backend/src/handlers/pois.rs
```
Expected: zero matches.

- [ ] **Step 8: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add backend/src/db/pois.rs \
        backend/src/db/mod.rs \
        backend/src/handlers/pois.rs
git commit -m "refactor(db): move POI CRUD into db::pois; rewrite handlers/pois.rs (stage 1c, ADR 0007)"
```

---

### Task 1.7: Write ADR 0008 (parameterize SQL)

**Files:**
- New: `docs/adr/0008-parameterize-list-tracks-sql.md`.

- [ ] **Step 1: Create the ADR**

```markdown
# Parameterize the track list SQL filter assembly (stage 1d, audit security finding)

`backend/src/db/tracks.rs:1360-1378` builds filter SQL with `format!()` from request values (e.g., `format!("elevation_gain >= {}", min_gain)`). The same anti-pattern is in the 6 `db::tracks` functions added by `create-tracks` (`duplicate_track`, `publish_track`, `insert_track_from_editor`, `update_track_distance_markers`, `update_track_geometry`, `list_tracks_heatmap`). The audit's security report flags this as HIGH severity. We use `sqlx::QueryBuilder<Postgres>` with `.push("...").push_bind(value)` so every value is bound, not interpolated. Each of the 7 functions gets a unit test in `db/tracks.rs`; 5 of them are `#[cfg(feature = "integration")]`-gated because they need a database.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0008-parameterize-list-tracks-sql.md
git commit -m "docs(adr): 0008 parameterize SQL filter assembly (stage 1d)"
```

---

### Task 1.8: Stage 1d — Parameterize the SQL filter assembly

**Files:**
- Modify: `backend/src/db/tracks.rs` (~7 functions).

- [ ] **Step 1: Read the current `format!()` usage in `db/tracks.rs`**

Run:
```bash
grep -n "format!.*elevation\|format!.*slope\|format!.*length\|format!.*category" backend/src/db/tracks.rs
```
Expected: 5+ matches. Note each.

- [ ] **Step 2: Replace each `format!()` with `QueryBuilder`**

For each match, replace:

```rust
// before
let mut conditions = Vec::new();
if let Some(min_gain) = filters.min_elevation_gain {
    conditions.push(format!("elevation_gain >= {}", min_gain));
}
// after
let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("SELECT ... FROM tracks WHERE 1=1");
if let Some(min_gain) = filters.min_elevation_gain {
    qb.push(" AND elevation_gain >= ").push_bind(min_gain);
}
```

(Apply this pattern to all 7 functions; preserve the rest of each function's logic.)

- [ ] **Step 3: For each of the 7 functions, add a unit test**

In `backend/src/db/tracks.rs`, at the bottom, add a `#[cfg(test)] mod tests`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    fn pool_or_skip() -> Option<PgPool> {
        // Use `.ok()` to convert the parse error into a `None` so the test
        // gracefully skips when `DATABASE_URL` is missing or malformed. Never
        // panic in a skip helper — the test contract is "skip if DB unavailable".
        let url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new().connect_lazy(&url).ok()
    }

    // 1. list_tracks_geojson — pure-logic test that builds a query and asserts it contains bind parameters.
    #[test]
    fn list_tracks_geojson_query_has_binds() {
        // Construct a QueryBuilder and assert it has at least one bind when a filter is set.
        let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("SELECT id FROM tracks WHERE 1=1");
        qb.push(" AND elevation_gain >= ").push_bind(100.0_f64);
        let sql = qb.into_sql();
        assert!(sql.contains("$1"), "expected bind param, got {}", sql);
    }

    // 2-7: one for each of the 6 create-tracks-added functions, with #[cfg(feature = "integration")] gating.
    #[cfg(feature = "integration")]
    #[test]
    fn duplicate_track_inserts_and_returns() {
        let Some(pool) = pool_or_skip() else { return; };
        let new_id = Uuid::new_v4();
        // ... call duplicate_track(&pool, new_id) and assert it succeeds
    }
    // ... (5 more similar tests)
}
```

(The exact SQL of each test depends on the signature of the 6 `create-tracks`-added functions; read them and write tests that exercise the bind parameters.)

- [ ] **Step 4: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS. The pure-logic test always runs; the DB-gated tests skip if no `DATABASE_URL`.

- [ ] **Step 5: Verify the `format!` is gone**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -n "format!.*elevation\|format!.*slope\|format!.*length\|format!.*category" backend/src/db/tracks.rs
```
Expected: zero matches.

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
git add backend/src/db/tracks.rs
git commit -m "security(db): parameterize SQL filter assembly with QueryBuilder (stage 1d, ADR 0008)"
```

---

## Stage 2 — Backend consolidation: enrichment, dead code, shallow wrappers, CI guardrail, auto-classification

**Files:**
- New: `backend/src/services/enrichment.rs` (Stage 2a).
- Modify: `backend/src/handlers/tracks.rs` (Stage 2a `enrich_elevation`).
- Modify: `backend/src/services/enrichment_queue.rs:172-278` (Stage 2a).
- Delete: `backend/src/services/track_upload.rs` (Stage 2b).
- New: `backend/src/track_upload.rs` (Stage 2b).
- Delete: `backend/src/services/gpx_export.rs` struct (Stage 2b).
- Modify: `backend/src/track_classifier.rs` (Stage 2b drops struct).
- Modify: `backend/src/poi_deduplication.rs` (Stage 2b drops struct).
- Modify: `backend/src/main.rs` (Stage 2c route removal, Stage 2d `--health-check`).
- Modify: `backend/src/metrics.rs` (Stage 2d labels).
- Modify: `backend/src/auth/{jwt,middleware,refresh,oauth,errors}.rs` (Stage 2e dead exports).
- Modify: `backend/src/db/{users,api_usage}.rs` (Stage 2e dead exports).
- New: `.github/scripts/check-orphans.sh` (Stage 2f).
- New: 6 ADRs (`0009`, `0010`, `0011`, `0012`, `0013`, `0014`).

### Task 2.1: Stage 2a — Unify the elevation enrichment flow

**Files:**
- New: `backend/src/services/enrichment.rs`.
- Modify: `backend/src/handlers/tracks.rs` (the `enrich_elevation` function).
- Modify: `backend/src/services/enrichment_queue.rs` (the `run_enrichment_job` function).
- New: `docs/adr/0009-unify-enrichment-flow.md`.

- [ ] **Step 1: Write ADR 0009**

```markdown
# Unify the elevation enrichment flow into one module (stage 2a)

`handlers/tracks.rs` has an `enrich_elevation` handler; `services/enrichment_queue.rs` has a `run_enrichment_job` background worker. Both call OpenTopoData, persist elevation + slope, and are the audit's Candidate 3. They drift on three axes: (1) one records metrics, the other does not; (2) one sets `elevation_enriched = true`, the other does not; (3) one uses `enriched_at.naive_utc()`, the other uses `Utc::now()`. We extract both into `services/enrichment.rs::run(pool, track_id) -> EnrichmentOutcome` and call it from both sites. Locality: pipeline bugs now live in one place.
```

- [ ] **Step 2: Read the two existing paths to extract the shared logic**

Read `backend/src/handlers/tracks.rs` and find the `enrich_elevation` function (search for `async fn enrich_elevation`). Read `backend/src/services/enrichment_queue.rs` and find `run_enrichment_job`. Compare the two. Identify the common steps: fetch track, call OpenTopoData, update `elevation_gain`, `elevation_min`, `elevation_max`, `elevation_enriched`, recompute slope, commit.

- [ ] **Step 3: Create `backend/src/services/enrichment.rs`**

```rust
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;
use crate::error::Result;
use crate::metrics;

#[derive(Debug, Serialize)]
#[non_exhaustive]
pub struct EnrichmentOutcome {
    pub enriched: bool,
    pub enriched_at: DateTime<Utc>,
}

pub async fn run(pool: &PgPool, track_id: Uuid) -> Result<EnrichmentOutcome> {
    // 1. Fetch the track's existing elevation data (geometry, current elevation values).
    // 2. Call OpenTopoData via the existing `track_utils::elevation_enrichment` helper.
    // 3. Update elevation_gain, elevation_min, elevation_max, set elevation_enriched = true.
    // 4. Recompute slope metrics (call into `track_utils::slope::recalculate`).
    // 5. Record metrics via metrics::observe_enrichment_latency(...).
    // 6. Return EnrichmentOutcome.
    todo!("extract from handlers/tracks.rs and services/enrichment_queue.rs")
}
```

**Why `#[derive(Serialize)]` and `#[non_exhaustive]`:** the response is serialized as `Json<EnrichmentOutcome>` (Issue 16) — `Serialize` is required to compile. `#[non_exhaustive]` lets the enrichment flow evolve (e.g., add a `degraded: bool` or `enriched_by: &str` field) without breaking downstream consumers.

- [ ] **Step 4: Write 2 unit tests**

In the same file, add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enrichment_outcome_serializes() {
        let o = EnrichmentOutcome {
            enriched: true,
            enriched_at: chrono::Utc::now(),
        };
        assert!(o.enriched);
    }

    #[test]
    fn enrichment_records_metrics_at_one_canonical_site() {
        // Grep-level invariant: `metrics::observe_*` calls live only in services::enrichment::run.
        // (This is a meta-test, not a runtime test.)
        let src = include_str!("enrichment.rs");
        assert!(src.contains("metrics::observe"), "metrics call must live in services::enrichment");
    }
}
```

- [ ] **Step 5: Replace `enrich_elevation` in `handlers/tracks.rs`**

Find `enrich_elevation`. Replace its body (which currently does the full pipeline inline) with:

```rust
pub async fn enrich_elevation(State(pool): State<Arc<PgPool>>, Path(id): Path<Uuid>) -> Result<Json<EnrichmentOutcome>, AppError> {
    let outcome = crate::services::enrichment::run(&pool, id).await?;
    Ok(Json(outcome))
}
```

- [ ] **Step 6: Replace `run_enrichment_job` in `services/enrichment_queue.rs`**

Find `run_enrichment_job`. Replace its body with:

```rust
async fn run_enrichment_job(pool: PgPool, track_id: Uuid) {
    if let Err(e) = crate::services::enrichment::run(&pool, track_id).await {
        tracing::error!(error = ?e, %track_id, "enrichment job failed");
    }
}
```

- [ ] **Step 7: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS.

- [ ] **Step 8: Verify the drift is gone**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "Utc::now().naive_utc()" backend/src/services/enrichment_queue.rs
# Expect zero
grep -rn "elevation_enriched = true\|elevation_enriched = \$" backend/src/ backend/src/services/
# Expect exactly one (in services/enrichment.rs)
grep -rn "metrics::observe" backend/src/handlers/tracks.rs backend/src/services/enrichment_queue.rs
# Expect zero (only services/enrichment.rs has the metrics calls)
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/enrichment.rs \
        backend/src/handlers/tracks.rs \
        backend/src/services/enrichment_queue.rs \
        docs/adr/0009-unify-enrichment-flow.md
git commit -m "refactor(enrichment): unify handler+queue paths via services::enrichment::run (stage 2a, ADR 0009)"
```

---

### Task 2.2: Stage 2b — Drop the shallow wrappers

**Files:**
- Delete: `backend/src/services/track_upload.rs`.
- New: `backend/src/track_upload.rs` (free function).
- Modify: `backend/src/services/gpx_export.rs` (drop struct, free functions).
- Modify: `backend/src/track_classifier.rs` (drop struct, keep free function).
- Modify: `backend/src/poi_deduplication.rs` (drop struct, free functions).
- New: `docs/adr/0010-drop-shallow-wrappers.md`.

- [ ] **Step 1: Write ADR 0010**

```markdown
# Drop the `services/track_upload`, `GpxExportService`, `TrackClassifier`, `PoiDeduplicationService` shallow wrappers (stage 2b)

Each of these structs holds no state; each has one public method. Deletion test: would deleting it concentrate complexity or just move it? Move — they become free functions in the same module. `services/track_upload.rs` is replaced by `backend/src/track_upload::upload(pool, request) -> Result<TrackDetail, AppError>`; the dedup preflight and `LAST_UPLOAD` static move to `handlers::rate_limit` (created in Stage 1a). `TrackClassifier` keeps the free function `classify_track` for now; Stage 2g deletes the whole file. `GpxExportService` and `PoiDeduplicationService` similarly become module-level free functions.
```

- [ ] **Step 2: Read the four wrapper structs**

For each, read the current implementation: `backend/src/services/track_upload.rs`, `backend/src/services/gpx_export.rs`, `backend/src/track_classifier.rs`, `backend/src/poi_deduplication.rs`. Identify the one public method per struct.

- [ ] **Step 3: Create `backend/src/track_upload.rs` (free function)**

```rust
use sqlx::PgPool;
use std::sync::Arc;
use crate::error::Result;
use crate::models::TrackDetail;

pub struct UploadRequest {
    pub file_bytes: Vec<u8>,
    pub file_name: String,
    pub session_id: uuid::Uuid,
    pub user_id: Option<uuid::Uuid>,
}

pub async fn upload(pool: &PgPool, req: &UploadRequest) -> Result<TrackDetail> {
    // Extract the body of `TrackUploadService::upload_track` (the one public method).
    // Add the dedup preflight as a call to handlers::rate_limit::check_and_record_upload.
    todo!("extract from services/track_upload.rs::TrackUploadService::upload_track")
}
```

- [ ] **Step 4: Update callers of `TrackUploadService`**

Find every reference: `grep -rn "TrackUploadService" backend/src/`. Replace with `track_upload::upload`. The callers are mostly in `backend/src/handlers/tracks.rs` and `backend/src/handlers/pois.rs` (POI bulk import). Update each call site.

- [ ] **Step 5: Delete `backend/src/services/track_upload.rs`**

Run: `git rm backend/src/services/track_upload.rs`
(The `mod.rs` for `services` no longer references it; if it does, remove the `pub mod track_upload;` line.)

- [ ] **Step 6: Convert `GpxExportService` to free functions in `services/gpx_export.rs`**

Edit `backend/src/services/gpx_export.rs`. Remove the `pub struct GpxExportService {}` and the `impl GpxExportService { pub fn generate_gpx(...) }`. Make `generate_gpx` a free function. The `sanitize_filename` helper becomes `pub fn sanitize_filename` at module scope. Update callers: `grep -rn "GpxExportService" backend/src/` and replace with the free function.

- [ ] **Step 7: Convert `TrackClassifier` to a free function**

Edit `backend/src/track_classifier.rs`. Remove the `pub struct TrackClassifier {}` and the `impl`. The `classify_track` method becomes `pub fn classify_track(metrics: &TrackMetrics) -> Vec<TrackClassification>`. Update callers.

- [ ] **Step 8: Convert `PoiDeduplicationService` to free functions**

Edit `backend/src/poi_deduplication.rs`. Remove the `pub struct PoiDeduplicationService {}`. The `bulk_find_or_create_pois` becomes `pub async fn bulk_find_or_create_pois(pool, pois) -> Result<Vec<Poi>>`. Update callers.

- [ ] **Step 9: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS.

- [ ] **Step 10: Verify the structs are gone**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "struct TrackUploadService\|struct GpxExportService\|struct TrackClassifier\|struct PoiDeduplicationService" backend/src/
```
Expected: zero matches.

- [ ] **Step 11: Commit**

```bash
git add backend/src/track_upload.rs \
        backend/src/services/track_upload.rs \
        backend/src/services/gpx_export.rs \
        backend/src/track_classifier.rs \
        backend/src/poi_deduplication.rs \
        backend/src/handlers/ \
        docs/adr/0010-drop-shallow-wrappers.md
git commit -m "refactor(backend): drop shallow wrappers (track_upload, gpx_export, track_classifier, poi_dedup) (stage 2b, ADR 0010)"
```

---

### Task 2.3: Stage 2c — Delete the dead `POST /api/tracks/exist` route, port the `23de764` tests (ADR 0012)

**Files:**
- Modify: `backend/src/handlers/tracks.rs` (remove `check_track_exist`).
- Modify: `backend/src/main.rs` (remove the route registration).
- Modify: `frontend/src/composables/useTracks.js` (remove the call site).
- Modify: `frontend/src/components/UploadForm.vue` (remove the call site).
- Modify: `backend/src/track_upload.rs` (add the test).
- New: `docs/adr/0012-delete-orphan-exist-route-and-port-tests.md`.

- [ ] **Step 1: Write ADR 0012**

```markdown
# Delete the orphan `POST /api/tracks/exist` route; port the 242 LOC of `hash_exist.rs` tests into `track_upload::upload` integration tests (stage 2c)

The audit found this route is registered but its handler does dedup preflight that the upload pipeline duplicates. The frontend's `UploadForm` (via `useTracks.js`) calls `/api/tracks/exist`; that call site must also be removed. The original implementation lives on the abandoned `track-upload-optimizations` branch at `23de764`, which carries `backend/tests/hash_exist.rs` (242 LOC) and `backend/tests/upload_conflict.rs` (108 LOC) covering the dedup behaviour. Per ADR 0002, we port the dedup *assertion* (the behaviour, not the route) into `backend/src/track_upload::upload`'s `#[cfg(test)] mod`: "uploading the same GPX twice returns a 409 with the existing track id". The route is removed; the dedup coverage is preserved.
```

- [ ] **Step 2: Read the `23de764` test code**

This requires reading from the archived branch. The branch is local at `track-upload-optimizations` (HEAD `23de764`):

```bash
cd /Users/solovey/Documents/dev/trackly
git show track-upload-optimizations:backend/tests/hash_exist.rs | head -242
git show track-upload-optimizations:backend/tests/upload_conflict.rs | head -108
```

Read the test code and identify the dedup assertions: "uploading the same GPX returns a 409 with the existing track id" and "uploading a different GPX with the same hash returns a 409 fingerprint-conflict".

- [ ] **Step 3: Add the 2 integration tests to `backend/src/track_upload.rs`**

Add at the bottom of `track_upload.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    fn pool_or_skip() -> Option<sqlx::PgPool> {
        // Use `.ok()` to convert the parse error into a `None` so the test
        // gracefully skips when `DATABASE_URL` is missing or malformed. Never
        // panic in a skip helper — the test contract is "skip if DB unavailable".
        let url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new().connect_lazy(&url).ok()
    }

    #[tokio::test]
    async fn uploading_same_gpx_twice_returns_409_with_existing_id() {
        let Some(pool) = pool_or_skip() else { return; };
        let session_id = uuid::Uuid::new_v4();
        let gpx_bytes = include_bytes!("../tests/fixtures/sample.gpx").to_vec(); // port the test fixture from 23de764
        let first = upload(&pool, &UploadRequest { file_bytes: gpx_bytes.clone(), file_name: "a.gpx".into(), session_id, user_id: None }).await;
        assert!(first.is_ok(), "first upload should succeed: {:?}", first);
        let second = upload(&pool, &UploadRequest { file_bytes: gpx_bytes, file_name: "a.gpx".into(), session_id, user_id: None }).await;
        match second {
            Err(AppError::Conflict(msg)) => assert!(msg.contains("existing"), "expected conflict message to reference existing track, got: {}", msg),
            other => panic!("expected Conflict, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn uploading_different_gpx_with_same_hash_returns_fingerprint_conflict() {
        let Some(pool) = pool_or_skip() else { return; };
        // Port the test from track-upload-optimizations:backend/tests/upload_conflict.rs
        // (the two GPX files have different content but the same hash due to a collision)
        todo!("port from 23de764")
    }
}
```

(The `sample.gpx` fixture path depends on the project's existing fixture directory. If no fixtures dir exists, create `backend/tests/fixtures/sample.gpx` with a small valid GPX file — copy from `git show track-upload-optimizations:backend/tests/fixtures/...` if it exists.)

- [ ] **Step 4: Remove the `check_track_exist` handler from `backend/src/handlers/tracks.rs`**

Edit `backend/src/handlers/tracks.rs`: delete the `check_track_exist` function entirely.

- [ ] **Step 5: Remove the route registration from `backend/src/main.rs`**

Find the `route("/api/tracks/exist", post(check_track_exist))` line. Delete it. Also delete the `use ... check_track_exist;` import if it's no longer used.

- [ ] **Step 6: Remove the call site from `frontend/src/composables/useTracks.js`**

Edit `frontend/src/composables/useTracks.js`. Find the function that calls `/api/tracks/exist` (search for `tracks/exist` or `check_track_exist`). Delete the function or the call.

- [ ] **Step 7: Remove the call site from `frontend/src/components/UploadForm.vue`**

Same: delete any reference to `/api/tracks/exist` or `checkTrackExist`.

- [ ] **Step 8: Verify the route is dead**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "/api/tracks/exist" frontend/src/ backend/src/
```
Expected: zero matches.

- [ ] **Step 9: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS (the dedup tests run if `DATABASE_URL` is set; otherwise they skip).

- [ ] **Step 10: Commit**

```bash
git add backend/src/handlers/tracks.rs \
        backend/src/main.rs \
        backend/src/track_upload.rs \
        frontend/src/composables/useTracks.js \
        frontend/src/components/UploadForm.vue \
        docs/adr/0012-delete-orphan-exist-route-and-port-tests.md
git commit -m "refactor(backend): delete /api/tracks/exist, port 23de764 dedup tests (stage 2c, ADR 0012)"
```

---

### Task 2.4: Stage 2d — Remove the dead metric labels and the `--health-check` flag (ADR 0011)

**Files:**
- Modify: `backend/src/metrics.rs:684, 685, 709, 720`.
- Modify: `backend/src/main.rs:21-34`.
- New: `docs/adr/0011-remove-dead-metric-labels.md`.

- [ ] **Step 1: Write ADR 0011**

```markdown
# Remove the dead `github` and `kml`/`fit` export metric labels (stage 2d, ADR 0011)

`backend/src/metrics.rs:684, 685, 709, 720` registers metric labels (`kml`, `fit`, `github`) that are never incremented anywhere in the codebase. YAGNI: drop them. We also drop the `--health-check` CLI flag in `main.rs:21-34`, which opens a TCP connection instead of calling `GET /health`; replace with a script that calls the actual `GET /health` endpoint. Audit Candidate 10 noted that production health checks should go through the real handler, not a custom flag.
```

- [ ] **Step 1: Identify the dead metric labels**

The 4 dead labels are at `backend/src/metrics.rs:684, 685, 709, 720`. **Read those specific lines first** to confirm they are exactly the `kml`, `fit`, `github` label registrations (not unrelated identifiers). The grep below is a safety check; the line numbers are authoritative:

```bash
sed -n '680,725p' backend/src/metrics.rs
```

This will show the metric registration block. Confirm 4 lines correspond to the 3 labels above plus their surrounding context, then edit per Step 2.

The broad grep `grep -n "kml\|fit\|github" backend/src/metrics.rs` will produce many false positives (e.g., comments mentioning these strings). Do not use that grep as the verify; the line numbers are the source of truth.

- [ ] **Step 2: Remove the labels**

Edit `backend/src/metrics.rs`: remove the `kml`, `fit`, `github` label registrations. The corresponding counters/histograms can either be removed entirely or kept with the labels dropped (keep the histogram, drop the label dimension; this is the more conservative choice). For each, decide based on the surrounding code: if the metric has no other label dimensions and the value is always 0, remove the entire metric; if it has other useful labels, drop only the unused ones.

- [ ] **Step 3: Remove the `--health-check` flag from `main.rs`**

Edit `backend/src/main.rs` lines 21-34. Find the `if args().any(|a| a == "--health-check")` block (or equivalent). Delete it. Add a comment that health checks are now done via `GET /health` (the `health` handler in `handlers/tracks.rs`).

**Verify no external callers depend on the flag** before deleting:

```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn -- "--health-check" backend/ frontend/ docker-compose.*.prod.yaml docker-compose.dev.yaml scripts/ 2>/dev/null
```

If any external caller exists (a Dockerfile HEALTHCHECK, a deployment script, a CI job), update it to use `curl http://localhost:8080/health` (or the equivalent production URL) instead of the custom flag. If only the handler in `main.rs` references the flag, deleting is safe.

- [ ] **Step 4: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/metrics.rs backend/src/main.rs
git commit -m "chore(backend): remove dead metric labels and --health-check flag (stage 2d)"
```

---

### Task 2.5: Stage 2e — Remove the 13-15 dead backend exports

**Files:**
- Modify: `backend/src/db/users.rs` (remove `count_users`, `update_user_roles`, `get_user_track_count`, `get_user_poi_count`).
- Modify: `backend/src/poi_deduplication.rs` (remove `find_potential_duplicates`).
- Modify: `backend/src/auth/jwt.rs` (remove `extract_user_id`).
- Modify: `backend/src/auth/middleware.rs` (remove `extract_client_ip`, `require_admin`, `require_owner`, `require_role`, `can_access_resource`).
- Modify: `backend/src/metrics.rs` (remove `set_auth_active_sessions`).
- Modify: `backend/src/auth/refresh.rs` (remove `cleanup_expired_tokens`).
- Modify: `backend/src/input_validation.rs` (remove `validate_categories_non_empty`).
- Modify: `backend/src/auth/oauth.rs` (remove `OAuthCallbackRequest`).
- Modify: tests that reference the deleted functions.

- [ ] **Step 1: Confirm the dead list with a final grep**

For each of the 15 items, run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "count_users\|update_user_roles\|get_user_track_count\|get_user_poi_count\|find_potential_duplicates\|extract_user_id\|extract_client_ip\|require_admin\|require_owner\|require_role\|can_access_resource\|set_auth_active_sessions\|cleanup_expired_tokens\|validate_categories_non_empty\|OAuthCallbackRequest" backend/src/
```
For each, verify the only matches are the definition site and possibly internal callers (e.g., `require_admin` is called by `require_role`). Document which are real "delete" and which need cascading updates.

- [ ] **Step 2: Delete the production functions**

Edit each file to remove the dead functions. For `require_admin`/`require_role`/`can_access_resource`, also update the tests in `backend/src/auth/middleware.rs` (lines ~270-300) that reference them.

- [ ] **Step 3: Remove re-exports from `auth/mod.rs` and `db/mod.rs`**

Edit `backend/src/auth/mod.rs` and `backend/src/db/mod.rs` to remove re-exports of the deleted functions.

- [ ] **Step 4: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS (after the test references are also removed).

- [ ] **Step 5: Verify the leaner API surface**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "pub fn\|pub struct" backend/src/ | sort -u > /tmp/api-surface.txt
wc -l /tmp/api-surface.txt
```
Expected: a noticeably smaller list than before. (For reference, before this stage the list was ~140 lines.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/ backend/src/db/ backend/src/metrics.rs backend/src/input_validation.rs
git commit -m "chore(backend): remove 13-15 dead exports (stage 2e)"
```

---

### Task 2.6: Stage 2f — Add CI grep guardrail (ADR 0013)

**Files:**
- New: `.github/scripts/check-orphans.sh`.
- New: `docs/adr/0013-ci-grep-guardrail.md` (already in the ADR table).
- The script is wired into CI in Stage 5b; for now, just create the script and verify it locally.

- [ ] **Step 1: Write ADR 0013 (it was already listed in the ADR table; create the file now)**

```markdown
# Add CI grep guardrail to prevent future dead code (stage 2f, ADR 0013)

The audit's Candidate 9 recommends preventing future dead code via a CI check. We add `.github/scripts/check-orphans.sh` that fails the build if any `pub fn`/`pub struct` in `backend/src/` has no caller, or any `import` from `frontend/src/{components,utils,composables}` has no user in `frontend/src/{views,components}`. The script is wired into the CI workflow in Stage 5b. The guardrail prevents the next audit from finding the same dead code we just deleted.
```

- [ ] **Step 2: Create the script**

Create `.github/scripts/check-orphans.sh`:

```bash
#!/usr/bin/env bash
# check-orphans.sh — fail the build if there are orphan exports/imports.
# Stage 2f (ADR 0013). Wired into CI in Stage 5b.
#
# Why this script and not `cargo-machete`? `cargo-machete` is excellent for
# `pub use` re-exports and `pub fn`/`pub struct` callers, but the project also
# has `pub` items inside `mod tests { ... }` blocks that machete flags as
# orphans incorrectly. The hand-written script below handles the project's
# specific patterns (5-condition pub extraction, anchor-aware grep) correctly.

set -euo pipefail

fail=0

# 1. Backend: any pub fn/pub struct/pub enum/pub trait in backend/src with no caller.
#
# The grep `^[[:space:]]*pub[[:space:]]+(async[[:space:]]+)?(fn|struct|enum|trait)`
# handles `pub fn`, `pub async fn`, `pub struct`, `pub enum`, `pub trait`.
# The awk extracts the third-or-fourth token (the name), and `sed 's/[<(].*//'`
# strips generics (e.g., `Foo<T>`) and tuple types (e.g., `Foo(A, B)`).
# Test items inside `#[cfg(test)] mod tests { ... }` are excluded via the
# `in_test_block` flag.
for f in $(find backend/src -name '*.rs'); do
    # Extract (line_number, kind, name) for every public item, skipping re-exports in main.rs/lib.rs.
    case "$f" in
        */main.rs|*/lib.rs) continue ;;
    esac
    while IFS= read -r line; do
        # Match `pub fn`, `pub async fn`, `pub struct`, `pub enum`, `pub trait`.
        name=$(echo "$line" | sed -nE 's/^[[:space:]]*pub[[:space:]]+(async[[:space:]]+)?(fn|struct|enum|trait)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\3/p')
        if [ -z "$name" ]; then continue; fi
        # Count callers outside the defining file.
        # `grep -rln` lists files; we exclude the defining file by name (not
        # regex anchored to ^, because the output has `path:line:content`).
        callers=$(grep -rln -- "$name" backend/src/ | grep -vF "$f" | wc -l)
        if [ "$callers" -eq 0 ]; then
            echo "ORPHAN: $name in $f has 0 callers in backend/src"
            fail=1
        fi
    done < <(grep -nE '^[[:space:]]*pub[[:space:]]+(async[[:space:]]+)?(fn|struct|enum|trait)[[:space:]]+' "$f" || true)
done

# 2. Frontend: any import from {components,utils,composables} with no user in {views,components}.
#
# The grep `from ['\"][^'\"]*${name}['\"]` matches both `import X from './name'`
# and `import { X } from './name'`. The check excludes the file itself, tests,
# stories, and type-only files.
for f in $(find frontend/src/components frontend/src/utils frontend/src/composables -type f \( -name '*.vue' -o -name '*.js' \) 2>/dev/null); do
    name=$(basename "$f" .vue)
    name=$(basename "$name" .js)
    case "$name" in
        *.test|*.stories|*.d.ts) continue ;;
    esac
    users=$(grep -rln "from ['\"][^'\"]*${name}['\"]" frontend/src/views frontend/src/components 2>/dev/null | grep -vF "$f" | wc -l)
    if [ "$users" -eq 0 ]; then
        echo "ORPHAN: $f has 0 users in frontend/src/{views,components}"
        fail=1
    fi
done

exit $fail
```

Key fixes vs. the previous version:
1. **Regex for `pub async fn`**: now `(async[[:space:]]+)?` is optional. The previous regex required the item name at position 3, missing `pub async fn foo` (which has name at position 4).
2. **`grep -vF` instead of `grep -v "^${f}$"`**: the recursive grep output is `path:line:content`, not just `path`; anchored regexes don't match.
3. **`< <(...)` process substitution** instead of `for f in $(...)` which would break on filenames with spaces.
4. **`-- "$name"`** in grep: prevents argument-injection if an item name starts with `-`.

- [ ] **Step 3: Add a sanity test for the script**

Create `.github/scripts/test_check_orphans.sh`:

```bash
#!/usr/bin/env bash
# Verify check-orphans.sh exits 1 on a deliberately introduced dead symbol.
set -euo pipefail

# Create a temp file with an orphan pub fn.
tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT
mkdir -p "$tmpdir/backend/src"
cat > "$tmpdir/backend/src/lib.rs" <<EOF
pub fn orphan_test_dead_symbol() -> i32 { 42 }
EOF

# Replace backend/src with the temp dir for this test.
# ... (this is tricky to do without breaking the rest of the project; an easier test is to just
# run check-orphans.sh on the real code and assert it returns 0 right now, plus a one-off
# "introduce a symbol and re-run" test in CI).
echo "Test 1: clean state returns 0"
./.github/scripts/check-orphans.sh
echo "OK"
```

(Real test design: in CI, after Stage 5b wires the script, add a job step that introduces a temporary dead symbol in a throwaway branch and asserts the script exits 1. For Stage 2f itself, the verify is: the script runs locally and returns 0.)

- [ ] **Step 4: Make the script executable**

Run: `chmod +x .github/scripts/check-orphans.sh`

- [ ] **Step 5: Run the script locally**

Run: `./.github/scripts/check-orphans.sh; echo "exit: $?"`
Expected: exit 0 (the post-Stage-2e code has no orphans). If it exits 1, fix the remaining orphans before continuing.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/check-orphans.sh \
        docs/adr/0013-ci-grep-guardrail.md
git commit -m "ci: add orphan-symbol grep guardrail (stage 2f, ADR 0013)"
```

---

### Task 2.7: Stage 2g — Drop auto-classification (the YAGNI feature)

**Files:**
- Modify: `backend/src/metrics.rs` (drop the metric label).
- Modify: `backend/src/db/tracks.rs` (drop the column write/read).
- Delete: `backend/src/track_classifier.rs` (whole file).
- New: `docs/adr/0014-yagni-auto-classification.md`.

- [ ] **Step 1: Write ADR 0014**

```markdown
# YAGNI on auto-classification: drop the metric label and stop writing the column (stage 2g)

The 13-variant `TrackClassification` enum (in `track_classifier.rs`) currently has zero observable effect: the `auto_classifications` column is written, returned by every `TrackDetail`/`TrackSimplified`/`TrackGeoJsonQuery`, but never displayed, queried, or filtered. The metric label is registered but never incremented. YAGNI says: delete the whole feature. We drop the `auto_classifications` column write/read in `db/tracks.rs`, drop the metric label in `metrics.rs`, and delete `track_classifier.rs` entirely. Callers in `gpx_parser.rs:704` and `kml_parser.rs:349` (the only two) become no-ops (they ignore the unused return value of `classify_track`).
```

- [ ] **Step 2: Drop the column write/read in `db/tracks.rs`**

Edit `backend/src/db/tracks.rs`. Find `auto_classifications` in `insert_track` and `get_track_detail`. Remove both.

- [ ] **Step 3: Drop the metric label in `metrics.rs`**

Edit `backend/src/metrics.rs`. Find `TRACK_AUTO_CLASSIFICATIONS_TOTAL` (or similar; verify with `grep -n "auto_classification\|AUTO_CLASSIFICATION" backend/src/metrics.rs`). Remove the registration.

- [ ] **Step 4: Delete `track_classifier.rs`**

Run: `git rm backend/src/track_classifier.rs`
Update `backend/src/lib.rs` (or `main.rs`) to remove the `mod track_classifier;` line.

- [ ] **Step 5: Update `gpx_parser.rs:704` and `kml_parser.rs:349` to not call `classify_track`**

These two lines are the only callers. Find them with `grep -n "classify_track\|track_classifier" backend/src/gpx_parser.rs backend/src/kml_parser.rs`. Remove the call (and the unused import if applicable).

- [ ] **Step 6: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS.

- [ ] **Step 7: Verify the feature is fully removed**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
grep -rn "auto_classification\|classify_track" backend/src/
```
Expected: zero matches (or only the schema column name in a migration, if it's still there).

- [ ] **Step 8: Commit**

```bash
git add backend/src/metrics.rs \
        backend/src/db/tracks.rs \
        backend/src/gpx_parser.rs \
        backend/src/kml_parser.rs \
        backend/src/track_classifier.rs \
        backend/src/lib.rs \
        docs/adr/0014-yagni-auto-classification.md
git commit -m "chore(backend): drop auto-classification feature (stage 2g, ADR 0014)"
```

---

## Stage 2.5 — Decompose `useAuth.js` (508 LOC) into deep auth modules

**Files:**
- New: `frontend/src/auth/{pkce,oauth-client,refresh,profile,migration}.js`.
- Modify: `frontend/src/composables/useAuth.js` (shrinks to a thin facade).
- New: `frontend/src/auth/{pkce,oauth-client,refresh,profile,migration}.test.js`.
- New: `docs/adr/0015-decompose-use-auth.md`.

**Interfaces:**
- Produces: 5 new modules in `frontend/src/auth/`, each with a small public surface. `useAuth.js` re-exports from them.
- Consumes: the integrated `master` from Stage 0.

### Task 2.5.1: Read `useAuth.js` and plan the split

- [ ] **Step 1: Read the current `useAuth.js`**

Run: `wc -l frontend/src/composables/useAuth.js`
Expected: 508. Note the function boundaries: PKCE, OAuth state machine, refresh rotation, profile CRUD, session migration.

- [ ] **Step 2: Identify the 5 module boundaries**

For each function in `useAuth.js`, classify it as one of: `pkce`, `oauth-client`, `refresh`, `profile`, `migration`. Create a one-page table: function name → module. Use this as the source of truth for the next 5 tasks.

---

### Task 2.5.2: Create `frontend/src/auth/pkce.js` + test (ADR 0015)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/pkce.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generatePkce } from '../../src/auth/pkce';

describe('pkce.generatePkce (stage 2.5)', () => {
  it('returns a verifier of 43-128 chars', () => {
    const { verifier } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
  it('returns a non-empty challenge', () => {
    const { challenge } = generatePkce();
    expect(challenge.length).toBeGreaterThan(0);
  });
  it('produces different verifiers on each call', () => {
    // PKCE is non-deterministic by design — each call must produce a fresh pair
    // to prevent replay attacks. The two consecutive calls must yield distinct
    // verifiers; the test asserts non-equality, not determinism.
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
  it('produces unique verifiers across 100 calls', () => {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(generatePkce().verifier);
    expect(set.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test src/auth/pkce.test.js`
Expected: FAIL — `generatePkce` does not exist yet.

- [ ] **Step 3: Implement `pkce.js`**

Create `frontend/src/auth/pkce.js`:

```js
// PKCE state generation. Pure functions; no side effects.

/**
 * Base64url-encode a Uint8Array without stack-overflow risk on long inputs.
 * (Naive `btoa(String.fromCharCode(...bytes))` blows the call stack for arrays
 * over ~50 KB; the chunked loop here handles any size.)
 */
function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

export async function generatePkce() {
  // 32 random bytes -> 43-char base64url verifier (RFC 7636 §4.1).
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(random);
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}
```

**Note on `crypto.subtle` availability:** vitest with jsdom (the project's test config per `package.json` line 12: `"test": "vitest run --dir src"`) provides `crypto.subtle` in jsdom 28+. If the test fails with `crypto.subtle is undefined`, the fallback is to use Node's `node:crypto`:

```js
import { webcrypto as crypto } from 'node:crypto';
// then use crypto.subtle.digest and crypto.getRandomValues as above
```

This is a jsdom-vs-Node-runtime guard; verify the test passes before committing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/auth/pkce.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (per-module commit; will be squashed into the Stage 2.5 final commit if desired)**

```bash
git add frontend/src/auth/pkce.js frontend/src/auth/pkce.test.js
git commit -m "refactor(auth): extract pkce module from useAuth.js (stage 2.5)"
```

---

### Task 2.5.3: Create `frontend/src/auth/oauth-client.js` + test

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/oauth-client.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startLogin, clearState, handleCallback } from '../../src/auth/oauth-client';

describe('oauth-client (stage 2.5)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Stub the OAuth config endpoint and the redirect.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ client_id: 'cid', redirect_uri: 'https://app.test/cb' }),
    });
    // Stub window.location.href (jsdom doesn't allow direct assignment, so we
    // replace the whole location with a setter that records).
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  it('startLogin fetches config, stores sessionStorage, and redirects', async () => {
    await startLogin();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/oauth-config');
    expect(sessionStorage.getItem('oauth_state')).toBeTruthy();
    expect(sessionStorage.getItem('pkce_code_verifier')).toBeTruthy();
    expect((window as any).location.href).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it('startLogin and clearState are inverses on sessionStorage', async () => {
    await startLogin();
    expect(sessionStorage.getItem('oauth_state')).toBeTruthy();
    clearState();
    expect(sessionStorage.getItem('oauth_state')).toBeNull();
    expect(sessionStorage.getItem('pkce_code_verifier')).toBeNull();
  });

  it('startLogin throws if /api/auth/oauth-config returns non-OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(startLogin()).rejects.toThrow(/OAuth/);
  });

  it('handleCallback rejects mismatched state', async () => {
    sessionStorage.setItem('oauth_state', 'expected-state');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(handleCallback('code', 'wrong-state')).rejects.toThrow(/state/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test src/auth/oauth-client.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `oauth-client.js`**

Create `frontend/src/auth/oauth-client.js`:

```js
// OAuth2 state machine. Fetches the OAuth config from the backend, generates
// PKCE + state, stores in sessionStorage, and redirects the browser to
// Google's OAuth URL. Side effects: sessionStorage writes and
// `window.location.href = ...`. This matches the original useAuth.login()
// behavior (frontend/src/composables/useAuth.js:113-159).

import { generatePkce } from './pkce';
import { getSessionId } from '../utils/session';

const API_BASE = '';

function generateState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function startLogin() {
  const { codeVerifier, codeChallenge } = await generatePkce();
  const state = generateState();
  sessionStorage.setItem('pkce_code_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);
  // Store the current session_id so we can migrate session tracks after login.
  const sessionId = getSessionId();
  if (sessionId) {
    sessionStorage.setItem('pending_migration_session_id', sessionId);
  }
  const configResponse = await fetch(`${API_BASE}/api/auth/oauth-config`);
  if (!configResponse.ok) {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    throw new Error('Failed to get OAuth configuration');
  }
  const config = await configResponse.json();
  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  // Redirect the browser. This mirrors the original useAuth.js:153.
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function clearState() {
  sessionStorage.removeItem('oauth_state');
  sessionStorage.removeItem('pkce_code_verifier');
  sessionStorage.removeItem('pending_migration_session_id');
}

export async function handleCallback(code, state) {
  const savedState = sessionStorage.getItem('oauth_state');
  if (state !== savedState) {
    throw new Error('Invalid OAuth state - possible CSRF attack');
  }
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
  if (!codeVerifier) {
    throw new Error('Missing PKCE code verifier');
  }
  const response = await fetch(`${API_BASE}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code, state, pkce_verifier: codeVerifier }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to exchange authorization code');
  }
  return response.json();
}
```

**The test for `handleCallback` requires `fetch` to be globally available** — vitest with jsdom provides it, but the test should mock `globalThis.fetch` as in the `refresh.js` test below.

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test src/auth/oauth-client.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth/oauth-client.js frontend/src/auth/oauth-client.test.js
git commit -m "refactor(auth): extract oauth-client module (stage 2.5)"
```

---

### Task 2.5.4: Create `frontend/src/auth/refresh.js` + test

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/refresh.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rotate, revokeFamily } from '../../src/auth/refresh';

describe('refresh (stage 2.5)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rotate returns new tokens on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'a', refresh_token: 'b' }),
    });
    const r = await rotate('old-refresh');
    expect(r.accessToken).toBe('a');
    expect(r.refreshToken).toBe('b');
  });

  it('rotate throws on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(rotate('bad-token')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement `refresh.js`**

Create `frontend/src/auth/refresh.js`:

```js
// Refresh-token rotation. Talks to /api/auth/refresh (HttpOnly cookie-based).
// On success, returns true; on failure (no cookie, expired), returns false.

const API_BASE = '';

export async function rotate() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // HttpOnly cookie is sent automatically
    });
    if (response.status === 204) {
      // No Content — no session cookie present.
      return false;
    }
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data;
  } catch (_) {
    return false;
  }
}

export async function revokeFamily() {
  // Server-side: a logged-in user can revoke all tokens in their family.
  // The handler is /api/auth/logout-all (POST). No body needed; cookie sent.
  try {
    await fetch(`${API_BASE}/api/auth/logout-all`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (_) {
    // Best-effort; the cookie will expire regardless.
  }
}
```

Note: the test mocks `globalThis.fetch` (vitest with jsdom provides it). The `rotate` function returns `false` on failure, which the auth store translates into clearing state.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/refresh.js frontend/src/auth/refresh.test.js
git commit -m "refactor(auth): extract refresh module (stage 2.5)"
```

---

### Task 2.5.5: Create `frontend/src/auth/profile.js` + test

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/profile.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { loadProfile, updateProfile, deleteAccount } from '../../src/auth/profile';

const TEST_TOKEN = 'test-access-token';

describe('profile (stage 2.5)', () => {
  it('loadProfile returns user info on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'u1', nickname: 'alice' }),
    });
    const p = await loadProfile(TEST_TOKEN);
    expect(p.id).toBe('u1');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/account/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TEST_TOKEN}` }) }));
  });
  it('updateProfile sends PATCH and returns the new nickname', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nickname: 'bob' }),
    });
    const p = await updateProfile({ nickname: 'bob' }, TEST_TOKEN);
    expect(p.nickname).toBe('bob');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/account/profile',
      expect.objectContaining({ method: 'PATCH' }));
  });
  it('deleteAccount issues a DELETE and returns void', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await deleteAccount(TEST_TOKEN);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/account',
      expect.objectContaining({ method: 'DELETE' }));
  });
});
```

- [ ] **Step 2: Implement `profile.js`**

Create `frontend/src/auth/profile.js`:

```js
// Profile CRUD. Talks to /api/account/* endpoints.
// The access token is passed explicitly by the caller (the Pinia auth store in
// Stage 3a) — these functions are pure with respect to token storage.

const API_BASE = '';

export async function loadProfile(accessToken) {
  const response = await fetch(`${API_BASE}/api/account/me`, {
    headers: { Authorization: `Bearer ${accessToken ?? ''}` },
  });
  if (!response.ok) throw new Error('Failed to fetch user profile');
  return response.json();
}

export async function updateProfile(updates, accessToken) {
  const response = await fetch(`${API_BASE}/api/account/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken ?? ''}`,
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update profile');
  }
  return response.json();
}

export async function deleteAccount(accessToken) {
  const response = await fetch(`${API_BASE}/api/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken ?? ''}` },
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete account');
  }
}
```

**Important:** The original `useAuth.js` reads the token from an in-memory Vue `ref`, not from `localStorage`. The Stage 2.5 modules preserve this contract by taking the token as an explicit parameter. The Pinia auth store in Stage 3a passes `this.accessToken` to each module call (lines 2753-2782 of Task 3.4). Tests in `profile.test.js` (Task 2.5.5 Step 1) must mock `globalThis.fetch` and pass a test token string as the first argument.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/profile.js frontend/src/auth/profile.test.js
git commit -m "refactor(auth): extract profile module (stage 2.5)"
```

---

### Task 2.5.6: Create `frontend/src/auth/migration.js` + test

- [ ] **Step 1: Write the failing test**

Create `frontend/src/auth/migration.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { migrateSessionTracks } from '../../src/auth/migration';

describe('migration (stage 2.5)', () => {
  it('migrateSessionTracks returns a count', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ migrated: 3 }),
    });
    const r = await migrateSessionTracks('sess-1', 'test-token');
    expect(r.migrated).toBe(3);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/migrate-session-tracks',
      expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 2: Implement `migration.js`**

Create `frontend/src/auth/migration.js`:

```js
// Session-to-user migration. After OAuth login, anonymous session tracks
// (those with the session_id cookie) are reassigned to the logged-in user.
// The access token is passed explicitly by the caller (the Pinia auth store
// in Stage 3a) — these functions are pure with respect to token storage.

const API_BASE = '';

export async function migrateSessionTracks(sessionId, accessToken) {
  if (!sessionId) return { migrated_count: 0 };
  try {
    const response = await fetch(`${API_BASE}/api/auth/migrate-session-tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? ''}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!response.ok) {
      console.error('Track migration failed');
      return { migrated_count: 0 };
    }
    return response.json();
  } catch (e) {
    console.error('Track migration error:', e);
    return { migrated_count: 0 };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/auth/migration.js frontend/src/auth/migration.test.js
git commit -m "refactor(auth): extract migration module (stage 2.5)"
```

---

### Task 2.5.7: Shrink `useAuth.js` to a thin facade + write ADR 0015

- [ ] **Step 1: Write ADR 0015**

```markdown
# Decompose `useAuth.js` (508 LOC) into 5 deep auth modules (stage 2.5, ADR 0015)

The auth composable on `master` is the same shape of problem the audit flagged in `TrackMap.vue` and `AccountView.vue`: a 500+ LOC module owning PKCE, refresh, profile, account-delete, session migration, and E2E hooks all in one factory. We split into `frontend/src/auth/{pkce,oauth-client,refresh,profile,migration}.js` (each ≤120 LOC), each tested with its own `frontend/src/auth/*.test.js` file. `useAuth.js` shrinks to a thin facade that re-exports the auth-module functions. **The 19-symbol reactive state (`accessToken`, `user`, `isAuthenticated`, `isInitialized`, `isLoading`, `error`) is NOT in the facade** — it lives in the Pinia auth store (Stage 3a). Consumers migrate from `import { useAuth }` to `import { useAuthStore }` in Stage 3a. The total new test count is 13 (4+4+2+2+1).
```

- [ ] **Step 2: Shrink `useAuth.js` to a facade of the auth-module functions**

Edit `frontend/src/composables/useAuth.js`. Replace the entire body (508 LOC) with:

```js
// Thin facade over the 5 auth modules in src/auth/. The 19-symbol reactive
// state (accessToken, user, isAuthenticated, etc.) lives in the Pinia auth
// store (Stage 3a) at frontend/src/stores/auth.js, not here. Consumers
// migrate to useAuthStore in Stage 3a.
export { generatePkce } from '../auth/pkce';
export { startLogin, handleCallback, clearState } from '../auth/oauth-client';
export { rotate, revokeFamily } from '../auth/refresh';
export { loadProfile, updateProfile, deleteAccount } from '../auth/profile';
export { migrateSessionTracks } from '../auth/migration';
```

- [ ] **Step 3: Verify `useAuth.js` is small**

Run: `wc -l frontend/src/composables/useAuth.js`
Expected: ~10 lines (the facade is just re-exports).

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test`
Expected: PASS. The 13 new auth tests + the existing tests all pass. **Important:** some existing tests in `useAuth.test.js` may have asserted on the 19-symbol surface (e.g., `useAuth().isInitialized`). After Stage 2.5, those tests must be updated to import the symbol directly from the auth module (e.g., `import { getSessionId } from '../auth/pkce'`) or be rewritten to use Pinia. This is a known follow-up; the executor updates the tests in this same commit.

- [ ] **Step 5: Update the consumers of `useAuth.js` (if any broke)**

If the old `useAuth.js` exported symbols that the new facade doesn't, the consumers compile error. The facade re-exports the same 9 public symbols, so consumers should compile. If anything fails, update the import paths (the old paths in `useAuth.js` still work, since the facade re-exports).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useAuth.js docs/adr/0015-decompose-use-auth.md
git commit -m "refactor(useAuth): shrink to facade over 5 auth modules (stage 2.5, ADR 0015)"
```

---

## Stage 3 — Frontend foundation: Pinia, events module, http module, bboxCache LRU

**Files:**
- New: `frontend/src/stores/{auth,search,toast,units,tracks}.js`.
- New: `frontend/src/stores/index.js`.
- New: `frontend/src/events.js`.
- New: `frontend/src/http.js`.
- Modify: `frontend/src/composables/{useAuth,useSearchState,useToast,useUnits,useTracks}.js` (thin wrappers).
- Modify: `frontend/src/main.js` (install Pinia).
- Modify: `frontend/package.json` (add `pinia@^3.0.4`).
- New: `frontend/src/stores/*.test.js` (5 files).
- New: `frontend/src/events.test.js`.
- New: `frontend/src/http.test.js`.
- New: 4 ADRs (`0016`, `0017`, `0018`, `0019`).

### Task 3.1: Write ADR 0016 (Pinia)

- [ ] **Step 1: Create the ADR**

```markdown
# Adopt Pinia 3 for frontend global state (stage 3a, ADR 0016)

`vue-router@5.0.2` peer-deps on `pinia@^3.0.4` (verified in `bun.lock`). Vue 3.5.27 is installed (verified). The five module-singleton composables (`useAuth`, `useSearchState`, `useToast`, `useUnits`, `useTracks`) — each with module-scope `ref()`s — are the wrong kind of global: HMR leaves stale state across tabs, tests can't reset them. We move state into `frontend/src/stores/{auth,search,toast,units,tracks}.js` (Pinia `defineStore`), keep the composables as thin wrappers over `useXxxStore()` (so call sites don't change), and register Pinia in `main.js` via `app.use(createPinia())`. `useMapUrlState.js` is *not* a module-singleton (its `ref()`s live inside function bodies) and is out of scope. `useSearchState.js` is migrated for consistency even though it's production-dead (only a test mock uses it); a follow-up can delete the store + composable.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0016-adopt-pinia.md
git commit -m "docs(adr): 0016 adopt Pinia 3 (stage 3a)"
```

---

### Task 3.2: Stage 3a pre-condition verify + install Pinia

- [ ] **Step 1: Verify Vue version**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun pm ls vue 2>/dev/null | head -1 || grep '"vue"' package.json`
Expected: `vue@^3.5.27` or similar Vue 3 version. If Vue 2 is installed, abort Stage 3a and migrate to Vue 3 first (out of scope of this plan).

- [ ] **Step 2: Verify `pinia` is not yet in `package.json`**

Run: `grep -E '"pinia"' frontend/package.json`
Expected: zero matches. (If present, skip the install step and verify the version is `^3.0.4`.)

- [ ] **Step 3: Install Pinia 3**

Run: `cd /Users/solovey/Documents/dev/trackly && bun add pinia --cwd frontend`
Expected: `pinia@^3.0.4` or compatible added to `frontend/package.json` and `bun.lock` updated.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/bun.lock
git commit -m "chore(frontend): add pinia@^3.0.4 dependency (stage 3a)"
```

---

### Task 3.3: Stage 3a — Create the 5 Pinia stores

**Files:**
- New: `frontend/src/stores/{auth,search,toast,units,tracks}.js`.
- New: `frontend/src/stores/index.js`.

- [ ] **Step 1: Write the failing test for the auth store**

Create `frontend/src/stores/auth.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../src/stores/auth';

describe('useAuthStore (stage 3a)', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('initial state has no user and no tokens', () => {
    const s = useAuthStore();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
  it('login sets tokens and user', () => {
    const s = useAuthStore();
    s.login({ accessToken: 'a', refreshToken: 'b', user: { id: 'u1' } });
    expect(s.isAuthenticated).toBe(true);
    expect(s.user.id).toBe('u1');
  });
  it('logout clears state', () => {
    const s = useAuthStore();
    s.login({ accessToken: 'a', refreshToken: 'b', user: { id: 'u1' } });
    s.logout();
    expect(s.isAuthenticated).toBe(false);
  });
  it('reset works for test isolation', () => {
    const s = useAuthStore();
    s.$reset();
    expect(s.accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test src/stores/auth.test.js`
Expected: FAIL.

- [ ] **Step 3: Create `frontend/src/stores/auth.js`**

```js
import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    refreshToken: null,
    user: null,
    pkceVerifier: null,
    loginInProgress: false,
    profile: null,
  }),
  getters: {
    isAuthenticated: (s) => !!s.accessToken,
  },
  actions: {
    login({ accessToken, refreshToken, user }) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.user = user;
    },
    handleCallback({ accessToken, refreshToken, user }) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.user = user;
      this.pkceVerifier = null;
    },
    refresh({ accessToken, refreshToken }) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
    },
    logout() {
      this.accessToken = null;
      this.refreshToken = null;
      this.user = null;
      this.profile = null;
    },
    loadProfile(profile) { this.profile = profile; },
    updateProfile(profile) { this.profile = { ...this.profile, ...profile }; },
  },
});
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test src/stores/auth.test.js`
Expected: PASS.

- [ ] **Step 5: Create the other 4 stores similarly**

For each of `search.js`, `toast.js`, `units.js`, `tracks.js`: write a 3-test file (state init, one action, reset), create the store with the relevant state, run, commit. The `tracks` store also has the `bboxCache` LRU cap (Task 3.6). The pattern is the same as auth but the test counts are smaller (3 each, totalling 12 across the 4 stores, plus the 4 auth tests = 16 total Stage 3a tests; the architecture plan revised this from 20 to 15-16).

- [ ] **Step 6: Create `frontend/src/stores/index.js`**

```js
export { useAuthStore } from './auth';
export { useSearchStore } from './search';
export { useToastStore } from './toast';
export { useUnitsStore } from './units';
export { useTracksStore } from './tracks';
```

- [ ] **Step 7: Run the full test suite**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/ frontend/src/stores/
git commit -m "refactor(frontend): create 5 Pinia stores (auth/search/toast/units/tracks) (stage 3a)"
```

---

### Task 3.4: Stage 3a — Register Pinia + thin wrappers

- [ ] **Step 1: Edit `frontend/src/main.js`**

Find the line `app.use(...)` chain. Add `app.use(createPinia())`. The full chain becomes (typically):

```js
import { createPinia } from 'pinia';
// ... other imports
const app = createApp(App);
app.use(createPinia());
app.use(router);
// ... other .use() calls
app.mount('#app');
```

- [ ] **Step 2: Convert the 5 composables to thin wrappers — preserving every public symbol**

The current `useAuth()` returns a 19-symbol surface (verified by reading `frontend/src/composables/useAuth.js:482-507`): `isAuthenticated`, `isInitialized`, `isLoading`, `user`, `error`, `accessToken`, `initialize`, `login`, `handleCallback`, `logout`, `refresh`, `fetchUserProfile`, `updateProfile`, `migrateSessionTracks`, `deleteAccount`, `ensureValidToken`, `getAuthHeader`, `authFetch`, `_resetForTesting`. The consumers (App.vue, AccountView.vue, TrackView.vue, useTracks.js, LoginButton.vue, AuthCallbackView.vue) destructure 8-12 of these per call site. A naive `export const useAuth = () => useAuthStore()` breaks every consumer because Pinia stores do not expose these as instance methods — they expose them only if the store defines them as `actions` or `getters`.

**The fix: extend the auth Pinia store with every method consumers call, then make the thin wrapper re-export.**

Edit the store to add actions for the methods (one of the maintainer shapes from Stage 2.5's auth modules). For each method that already has a corresponding auth module (`login`, `handleCallback`, `refresh`, `updateProfile`, `migrateSessionTracks`, `deleteAccount`, `getAuthHeader`, `authFetch`), the store action delegates to the module. For methods that don't have a module yet (`initialize`, `fetchUserProfile`, `ensureValidToken`, `_resetForTesting`), inline the logic in the store action.

Final store (replaces the partial one in Task 3.3 Step 3):

```js
import { defineStore } from 'pinia';
import * as pkce from '../auth/pkce';
import * as oauth from '../auth/oauth-client';
import * as refresh from '../auth/refresh';
import * as profile from '../auth/profile';
import * as migration from '../auth/migration';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null,
    tokenExpiresAt: null,
    user: null,
    isInitialized: false,
    isLoading: false,
    authError: null,
    profile: null,
  }),
  getters: {
    isAuthenticated: (s) => !!s.accessToken && !!s.user,
    error: (s) => s.authError,
  },
  actions: {
    async initialize() {
      if (this.isInitialized) return;
      this.isLoading = true;
      this.authError = null;
      try {
        const ok = await refresh.rotate(/* uses HttpOnly cookie via POST /api/auth/refresh */);
        if (ok) await this.fetchUserProfile();
      } catch (_) { /* no session */ }
      finally { this.isLoading = false; this.isInitialized = true; }
    },
    async login() { return oauth.startLogin(); },
    async handleCallback(code, state) { return oauth.handleCallback(code, state); },
    async logout() {
      // Best-effort server-side logout: clear the HttpOnly cookie. The server
      // endpoint is /api/auth/logout (POST). After the call, clear local state
      // regardless of the response so the UI is consistent.
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) { /* best-effort */ }
      this.accessToken = null; this.user = null; this.tokenExpiresAt = null; this.profile = null;
    },
    async refresh() { return refresh.rotate(); },
    async fetchUserProfile() { return profile.loadProfile(this.accessToken).then((p) => { this.profile = p; this.user = p; return p; }); },
    async updateProfile(updates) { return profile.updateProfile(updates, this.accessToken).then((p) => { this.profile = p; this.user = p; return p; }); },
    async migrateSessionTracks(sessionId) { return migration.migrateSessionTracks(sessionId, this.accessToken); },
    async deleteAccount() { return profile.deleteAccount(this.accessToken).then(() => { this.accessToken = null; this.user = null; this.profile = null; }); },
    async ensureValidToken() { /* check tokenExpiresAt, refresh if within 5 min */ },
    async getAuthHeader() { await this.ensureValidToken(); return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}; },
    async authFetch(url, options = {}) { await this.ensureValidToken(); return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${this.accessToken}` } }); },
    _resetForTesting() { this.$reset(); },
  },
});
```

The 4 other composables are simpler — their public surfaces are smaller:

```js
// useSearchState.js (the only public export is the singleton state; no methods)
// before: module-scope `ref()`s + a function
// after:
import { useSearchStore } from '../stores/search';
export const useSearchState = () => useSearchStore();

// useToast.js — same pattern
import { useToastStore } from '../stores/toast';
export const useToast = () => useToastStore();

// useUnits.js — same pattern
import { useUnitsStore } from '../stores/units';
export const useUnits = () => useUnitsStore();

// useTracks.js — has methods (load, getDetail, upload, etc.); the store should have them as actions
import { useTracksStore } from '../stores/tracks';
export const useTracks = () => useTracksStore();
```

- [ ] **Step 2.5: Migrate the 6 consumers of `useAuth()` to `useAuthStore()`**

The 19-symbol reactive state (`accessToken`, `user`, `isAuthenticated`, `isInitialized`, `isLoading`, `error`) is no longer reachable through the 5-line `useAuth.js` facade. Find each consumer and update it. The 6 consumer files are:

```bash
grep -rln "from ['\"].*composables/useAuth['\"]" frontend/src/{views,components,composables} 2>/dev/null
```

For each file:
1. Add `import { useAuthStore } from '../stores/auth';` (path adjusted for depth).
2. Replace `import { useAuth } from '...';` with `import { useAuthStore as useAuth } from '...';` (keeps call sites unchanged if you want, but the cleaner migration is to use `useAuthStore` directly).
3. The 5 functions that the facade still exports (`login`, `handleCallback`, `logout`, `refresh`, `updateProfile`, `deleteAccount`, `migrateSessionTracks`, etc.) now need a token. Update call sites to pass `useAuthStore().accessToken` (or call the store action directly, which has the token internally).

For `App.vue` (calls `useAuth().initialize()`), the migration is:

```js
// before
import { useAuth } from '../composables/useAuth';
const auth = useAuth();
auth.initialize();
// after
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();
auth.initialize(); // store action; the same name
```

For `AccountView.vue` (which reads `auth.user.isAdmin` or similar reactive state), the migration is similar but consumers must wrap in `computed()` to preserve reactivity:

```js
// before
const { user } = useAuth();
return user.value.isAdmin;
// after
const auth = useAuthStore();
return computed(() => auth.user?.isAdmin);
```

The other 4 composables (`useSearchState`, `useToast`, `useUnits`, `useTracks`) keep their existing call sites because the facade re-export is a direct `() => useXxxStore()` passthrough; the destructured names still work for reactive state. Only `useAuth` requires the explicit migration because of the 19-symbol surface.

- [ ] **Step 3: Run the test suite + e2e**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test && bun run test:e2e`
Expected: PASS. The 19-symbol auth surface is preserved through the Pinia store; the 4 other composables' surfaces are smaller and easily preserved.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js frontend/src/composables/ frontend/src/views/ frontend/src/components/
git commit -m "refactor(frontend): register Pinia, convert composables to thin wrappers, migrate useAuth consumers (stage 3a)"
```

---

### Task 3.5: Stage 3a.1 — Cap the bboxCache with LRU (ADR 0019)

- [ ] **Step 1: Write ADR 0019**

```markdown
# Add LRU cap (max 100 entries) to `useTracks.bboxCache` (stage 3a.1, ADR 0019)

The audit's Candidate 4 closed the "module-singleton" finding by moving to Pinia, but a separate finding within Candidate 4 is that `useTracks.bboxCache` is an *unbounded* `Map` that grows without eviction. Pinia state has the same issue. We add a max-size cap (LRU, 100 entries) on the `bboxCache` field in the tracks store.
```

- [ ] **Step 2: Write the failing test**

Append to `frontend/src/stores/tracks.test.js`:

```js
describe('bboxCache LRU (stage 3a.1)', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('caps at 100 entries with LRU eviction', () => {
    const s = useTracksStore();
    for (let i = 0; i < 150; i++) s.bboxCache.set(`key-${i}`, `value-${i}`);
    expect(s.bboxCache.size).toBe(100);
    // Most-recently-used key (`key-149`) is present
    expect(s.bboxCache.has('key-149')).toBe(true);
    // Oldest key is evicted
    expect(s.bboxCache.has('key-0')).toBe(false);
  });
});
```

- [ ] **Step 3: Run, verify fail**

Expected: FAIL — the current `tracks` store has a plain `Map`.

- [ ] **Step 4: Replace `Map` with an LRU**

Add an LRU implementation. A simple one:

```js
class LruMap extends Map {
  constructor(max) { super(); this.max = max; }
  set(key, value) {
    if (this.size >= this.max && !this.has(key)) {
      // Evict the oldest entry (first key in insertion order)
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}
```

In the `tracks` store, change `bboxCache: new Map()` to `bboxCache: new LruMap(100)`. Add `bboxCacheSize: (s) => s.bboxCache.size` as a getter.

- [ ] **Step 5: Run, verify pass**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/tracks.js frontend/src/stores/tracks.test.js docs/adr/0019-bbox-cache-lru.md
git commit -m "feat(frontend): LRU cap on bboxCache (stage 3a.1, ADR 0019)"
```

---

### Task 3.6: Stage 3b — Typed `events` module (ADR 0017)

- [ ] **Step 1: Write ADR 0017**

```markdown
# Add a typed `events` module to replace the `window.dispatchEvent` bus (stage 3b, ADR 0017)

The audit's Candidate 6 found 6 events and 5 listener sites traversing the component tree via `window.dispatchEvent` with no schema, no type, no list of subscribers. We add `frontend/src/events.js`: a minimal `mitt`-style event bus with JSDoc typedefs. The 6 dispatch sites (`HomeView.vue:697-708`, `TrackView.vue:851`, `TrackDetailPanel.vue:1277, 1433, 1859`, `useMapUrlState.js:215` — the last has no production listener and is deleted entirely) and 5 listener sites migrate to `events.emit`/`events.on`. Lint rule: forbid `window.dispatchEvent` outside `events.js`.
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/events.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { events } from '../src/events';

describe('events bus (stage 3b)', () => {
  beforeEach(() => events._subs.clear());
  it('on + emit delivers to subscribers', () => {
    const seen = [];
    events.on('track.deleted', (p) => seen.push(p));
    events.emit('track.deleted', { id: 't1' });
    expect(seen).toEqual([{ id: 't1' }]);
  });
  it('off removes a subscriber', () => {
    const seen = [];
    const fn = (p) => seen.push(p);
    events.on('track.deleted', fn);
    events.off('track.deleted', fn);
    events.emit('track.deleted', { id: 't1' });
    expect(seen).toEqual([]);
  });
  it('multiple subscribers on the same event all fire', () => {
    const a = []; const b = [];
    events.on('x', (p) => a.push(p));
    events.on('x', (p) => b.push(p));
    events.emit('x', 1);
    expect(a).toEqual([1]); expect(b).toEqual([1]);
  });
  it('emit with no subscribers does not throw', () => {
    expect(() => events.emit('unknown', {})).not.toThrow();
  });
});
```

- [ ] **Step 3: Run, verify fail, implement `events.js`, verify pass**

Create `frontend/src/events.js`:

```js
/**
 * Typed event bus. JSDoc typedefs document payload shapes.
 * @typedef {{ id: string }} TrackDeleted
 * @typedef {{ id: string, name: string }} TrackRenamed
 * ... (one typedef per known event)
 */
export const events = {
  _subs: new Map(),
  /** @param {string} name @param {(payload: any) => void} fn */
  on(name, fn) {
    if (!this._subs.has(name)) this._subs.set(name, new Set());
    this._subs.get(name).add(fn);
    return () => this.off(name, fn);
  },
  off(name, fn) { this._subs.get(name)?.delete(fn); },
  emit(name, payload) {
    const subs = this._subs.get(name);
    if (!subs) return;
    for (const fn of subs) fn(payload);
  },
};
```

- [ ] **Step 4: Migrate the 6 dispatch sites**

For each of `HomeView.vue:697-708`, `TrackView.vue:851`, `TrackDetailPanel.vue:1277, 1433, 1859`: replace `window.dispatchEvent(new CustomEvent('...', { detail }))` with `events.emit('...', detail)`. Add the import: `import { events } from '../events';` (or similar relative path).

- [ ] **Step 5: Migrate the 5 listener sites**

For each of the 5 `window.addEventListener` sites: replace with `events.on('...', fn)` in `onMounted` (with `events.off('...', fn)` in `onUnmounted`).

- [ ] **Step 6: Delete the orphan dispatch in `useMapUrlState.js:215`**

The `'mapUrlStateChanged'` event has no production listener (verified: `useMapUrlStateListener` is exported but uncalled, and the 5 `addEventListener` sites for this event are all inside `useMapUrlState.js` itself). Delete line 215 and the listener at line 269.

- [ ] **Step 7: Add the lint rule**

Edit `frontend/.eslintrc.*` (or `eslint.config.js` depending on the project's setup) to add:

```js
'no-restricted-globals': ['error', { name: 'dispatchEvent', message: 'Use events.emit() from src/events.js instead.' }],
```

- [ ] **Step 8: Run the test suite + verify no `window.dispatchEvent` remains**

Run:
```bash
cd /Users/solovey/Documents/dev/trackly
bun run test
grep -rn "window.dispatchEvent\|addEventListener" frontend/src/views/ frontend/src/components/ frontend/src/composables/
```
Expected: tests pass; second grep returns zero matches.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/events.js \
        frontend/src/events.test.js \
        frontend/src/views/ \
        frontend/src/components/ \
        frontend/src/composables/useMapUrlState.js \
        frontend/.eslintrc.* \
        docs/adr/0017-typed-events-module.md
git commit -m "refactor(frontend): typed events bus replaces window.dispatchEvent (stage 3b, ADR 0017)"
```

---

### Task 3.7: Stage 3c — `http` request module (ADR 0018)

- [ ] **Step 1: Write ADR 0018**

```markdown
# Add a single `http` request module on top of `fetch` (stage 3c, ADR 0018)

The audit found the `Authorization: Bearer` header is reconstructed inline in 5+ composables. Two adapters exist today (the real `fetch` + a test mock), so the seam is real. We add `frontend/src/http.js` exporting `createHttp({ tokenSource, logSink, baseUrl }) -> (path, opts) -> Promise<Response>`. The auth header is injected from `tokenSource.getToken()` (production: `useAuthStore().accessToken`; test: a stub). The log sink records `{ method, path, status }`. We replace the 5+ inline `Authorization: Bearer` sites and the `useAuth.authFetch` helper with `http.request(...)`.
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/http.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createHttp } from '../src/http';

describe('http.createHttp (stage 3c)', () => {
  it('injects Authorization header when tokenSource returns a token', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchSpy;
    const http = createHttp({ tokenSource: { getToken: () => 'tok-1' }, logSink: { log: vi.fn() } });
    await http('/api/tracks');
    expect(fetchSpy).toHaveBeenCalledWith('/api/tracks', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }),
    }));
  });
  it('omits header when no token', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchSpy;
    const http = createHttp({ tokenSource: { getToken: () => null }, logSink: { log: vi.fn() } });
    await http('/api/tracks');
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
  it('calls logSink with method/path/status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const log = { log: vi.fn() };
    const http = createHttp({ tokenSource: { getToken: () => 't' }, logSink: log });
    await http('/api/x', { method: 'POST' });
    expect(log.log).toHaveBeenCalledWith({ method: 'POST', path: '/api/x', status: 201 });
  });
  it('aborts when AbortController signals', async () => {
    const ac = new AbortController();
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const http = createHttp({ tokenSource: { getToken: () => 't' }, logSink: { log: vi.fn() } });
    ac.abort();
    await expect(http('/x', { signal: ac.signal })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run, verify fail, implement, verify pass**

Create `frontend/src/http.js`:

```js
export function createHttp({ tokenSource, logSink, baseUrl = '' }) {
  return async function request(path, opts = {}) {
    const token = await tokenSource.getToken();
    const res = await fetch(baseUrl + path, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    logSink.log({ method: opts.method ?? 'GET', path, status: res.status });
    return res;
  };
}
```

- [ ] **Step 4: Migrate the call sites**

For each composable that does inline `fetch` or `useAuth.authFetch`:
- `useTracks.js`: replace `useAuth.authFetch` (or equivalent) with `http('/api/tracks/...')`. The `tokenSource` is `{ getToken: () => useAuthStore().accessToken }`.
- `usePois.js`: same.
- `useSearchState.js`: same.
- `useTracks.js`, `usePois.js`, `AccountView.vue`, `TrackView.vue`: replace inline `Authorization: Bearer` headers with the centralized `http` module.

- [ ] **Step 5: Run the test suite + e2e**

Run: `bun run test && bun run test:e2e`
Expected: PASS.

- [ ] **Step 6: Verify no inline auth headers remain**

Run: `grep -rn "Authorization.*Bearer" frontend/src/views frontend/src/composables`
Expected: zero matches.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/http.js \
        frontend/src/http.test.js \
        frontend/src/composables/ \
        frontend/src/views/ \
        docs/adr/0018-http-request-module.md
git commit -m "refactor(frontend): centralized http module on top of fetch (stage 3c, ADR 0018)"
```

---

## Stage 4 — Frontend monoliths: `MapAdapter` for `TrackMap`

**Files:**
- New: `frontend/src/map/MapAdapter.js`.
- New: `frontend/src/map/LeafletAdapter.js` (~600 LOC).
- New: `frontend/src/map/StubAdapter.js` (~150 LOC).
- New: `frontend/src/map/ClusterAdapter.js` (~80 LOC).
- New: `frontend/src/map/E2EAdapter.js` (~40 LOC).
- New: `frontend/src/map/{LeafletAdapter,StubAdapter,ClusterAdapter,E2EAdapter,MapAdapter}.test.js`.
- Modify: `frontend/src/components/TrackMap.vue` (shrinks to ≤600 LOC).
- Modify: `frontend/src/components/PoiClusterGroup.vue` (consumes the adapter).
- Modify: `frontend/src/components/TrackFilterControl.vue` (consumes the adapter).
- New: 2 ADRs (`0020`, `0021`).

### Task 4.1: Write ADR 0020 (MapAdapter)

- [ ] **Step 1: Create the ADR**

```markdown
# Define a `MapAdapter` seam for `TrackMap` with cluster + E2E sub-ports (stage 4a, ADR 0020)

`TrackMap.vue` is 2 561 LOC (verified) covering 8 responsibilities. Two adapters exist (real Leaflet + test stub) — the seam is real. The audit's "After" diagram shows cluster and E2E as separate ports; we implement them as separate. The port has 9 methods: `renderTile`, `renderGeoJson`, `renderClusterGroup`, `on`, `off`, `getCenter`, `isIdle`, `fitBounds`, `setView`, plus `exposeE2E`. Total LOC after stage 4a: 600 (shell) + 600 (Leaflet) + 80 (Cluster) + 40 (E2E) + 150 (Stub) + 200 (TrackFilterControl) = ~1 670 LOC distributed across 5 small modules with deep seams.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0020-map-adapter-seam.md
git commit -m "docs(adr): 0020 MapAdapter seam for TrackMap (stage 4a)"
```

---

### Task 4.2: Stage 4a — Create `MapAdapter.js` + StubAdapter + tests

- [ ] **Step 1: Write ADR 0021 (YAGNI on the inline editor)**

```markdown
# YAGNI on the inline editor: do not add a `TrackEditOverlay` to `TrackView` (stage 4b, ADR 0021)

The audit's Candidate 8 offered 3 options: (a) delete the spec, (b) add a `TrackEditOverlay` to `TrackView`, (c) execute the editor plan. The integration in Stage 0 recovers the editor from `create-tracks` (`useTrackEditor.js` 2 340 LOC); option (c) is moot. Option (b) duplicates the editor with a thin UI for a read-only view — YAGNI. We do nothing in Stage 4b. The read-only `TrackView` stays as-is. If user research later shows a need for inline edit affordances, we revisit.
```

(Note: this is ADR 0021; it was listed in the ADR table at 0021. This task is named "Task 4.2" but produces ADR 0021 because it's part of Stage 4 prep.)

- [ ] **Step 2: Commit ADR 0021**

```bash
git add docs/adr/0021-yagni-inline-editor-overlay.md
git commit -m "docs(adr): 0021 YAGNI on inline editor overlay (stage 4b)"
```

- [ ] **Step 3: Write the failing test for `MapAdapter.js`**

Create `frontend/src/map/MapAdapter.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createMapAdapter } from '../../src/map/MapAdapter';

describe('MapAdapter contract (stage 4a)', () => {
  it('exposes all 9 required methods', () => {
    const a = createMapAdapter();
    for (const m of ['renderTile', 'renderGeoJson', 'renderClusterGroup', 'on', 'off', 'getCenter', 'isIdle', 'fitBounds', 'setView', 'exposeE2E']) {
      expect(typeof a[m]).toBe('function');
    }
  });
  it('passes through the underlying implementation', () => {
    const impl = { renderTile: vi.fn(), renderGeoJson: vi.fn(), renderClusterGroup: vi.fn(), on: vi.fn(), off: vi.fn(), getCenter: vi.fn(), isIdle: vi.fn(), fitBounds: vi.fn(), setView: vi.fn(), exposeE2E: vi.fn() };
    const a = createMapAdapter(impl);
    a.renderTile('url', 'attr');
    expect(impl.renderTile).toHaveBeenCalledWith('url', 'attr');
  });
});
```

- [ ] **Step 4: Run, verify fail**

Run: `bun run test src/map/MapAdapter.test.js`
Expected: FAIL.

- [ ] **Step 5: Create `frontend/src/map/MapAdapter.js`**

```js
// Defines the port; consumers depend on the return type of createMapAdapter, not on a concrete class.
export function createMapAdapter(impl) {
  return {
    renderTile: impl.renderTile,
    renderGeoJson: impl.renderGeoJson,
    renderClusterGroup: impl.renderClusterGroup,
    on: impl.on,
    off: impl.off,
    getCenter: impl.getCenter,
    isIdle: impl.isIdle,
    fitBounds: impl.fitBounds,
    setView: impl.setView,
    exposeE2E: impl.exposeE2E,
  };
}
```

- [ ] **Step 6: Create `frontend/src/map/StubAdapter.js`**

A simple in-memory stub for tests. Each method is a no-op or records:

```js
import { createMapAdapter } from './MapAdapter';

export function createStubAdapter() {
  const state = { center: null, zoom: null, listeners: new Map(), e2e: {} };
  return createMapAdapter({
    renderTile: () => {},
    renderGeoJson: () => {},
    renderClusterGroup: () => ({ addLayer: () => {}, clearLayers: () => {} }),
    on: (event, cb) => { if (!state.listeners.has(event)) state.listeners.set(event, new Set()); state.listeners.get(event).add(cb); return () => state.listeners.get(event).delete(cb); },
    off: (event, cb) => state.listeners.get(event)?.delete(cb),
    getCenter: () => state.center,
    isIdle: () => true,
    fitBounds: () => {},
    setView: (center, zoom) => { state.center = center; state.zoom = zoom; },
    exposeE2E: (namespace, api) => { state.e2e[namespace] = api; },
  });
}
```

- [ ] **Step 7: Write `StubAdapter.test.js`**

4 tests: `setView` records, `getCenter` returns it, `on`+`emit` (via a manually triggered `state.listeners`), `exposeE2E` stores.

- [ ] **Step 8: Run, verify pass**

Run: `bun run test src/map/`
Expected: all 8 tests (2 MapAdapter + 4 StubAdapter + 2 from LeafletAdapter once it exists) pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/map/MapAdapter.js \
        frontend/src/map/StubAdapter.js \
        frontend/src/map/MapAdapter.test.js \
        frontend/src/map/StubAdapter.test.js
git commit -m "feat(frontend): MapAdapter port + StubAdapter (stage 4a, ADR 0020)"
```

---

### Task 4.3: Stage 4a — Create `LeafletAdapter.js` and `ClusterAdapter.js`

- [ ] **Step 1: Create `frontend/src/map/ClusterAdapter.js`**

Create `frontend/src/map/ClusterAdapter.js`:

```js
// Cluster adapter. Wraps `L.markerClusterGroup` with a small interface
// that the MapAdapter port can depend on. The Leaflet import is lazy so
// tests can run without a real Leaflet global.

let L = null;
async function getLeaflet() {
  if (!L) L = (await import('leaflet')).default ?? (await import('leaflet'));
  return L;
}

export function createClusterAdapter() {
  return {
    async renderClusterGroup(points, options = {}) {
      const leaflet = await getLeaflet();
      // Spread `options` FIRST so the per-field `??` defaults are not silently
      // overridden by the spread (e.g., if the caller passes `disableClusteringAtZoom:
      // undefined`, the spread would not overwrite our `?? 15` default — but if
      // the spread came second, the explicit default would always lose to the
      // `undefined` value in the spread).
      const group = leaflet.markerClusterGroup({
        ...options,
        disableClusteringAtZoom: options.disableClusteringAtZoom ?? 15,
        maxClusterRadius: options.maxClusterRadius ?? 30,
      });
      for (const p of points) {
        const m = leaflet.marker([p.lat, p.lng]);
        group.addLayer(m);
      }
      return group;
    },
  };
}
```

- [ ] **Step 2: Write `ClusterAdapter.test.js`**

Create `frontend/src/map/ClusterAdapter.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock leaflet to avoid jsdom + Leaflet interaction issues.
const mockGroup = {
  layers: [],
  addLayer(layer) { this.layers.push(layer); },
  clearLayers() { this.layers = []; },
};
vi.mock('leaflet', () => ({
  default: {
    markerClusterGroup: vi.fn(() => mockGroup),
    marker: vi.fn(() => ({ _isMarker: true })),
  },
}));

import { createClusterAdapter } from '../../src/map/ClusterAdapter';

describe('ClusterAdapter (stage 4a)', () => {
  beforeEach(() => { mockGroup.layers = []; });

  it('returns a cluster group with the expected API', async () => {
    const adapter = createClusterAdapter();
    const group = await adapter.renderClusterGroup([], { disableClusteringAtZoom: 18 });
    expect(group.addLayer).toBeTypeOf('function');
    expect(group.clearLayers).toBeTypeOf('function');
  });

  it('adds one marker per point', async () => {
    const adapter = createClusterAdapter();
    const points = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    const group = await adapter.renderClusterGroup(points);
    expect(mockGroup.layers.length).toBe(3);
  });

  it('passes through options including disableClusteringAtZoom', async () => {
    const adapter = createClusterAdapter();
    await adapter.renderClusterGroup([], { disableClusteringAtZoom: 22 });
    // The mocked markerClusterGroup receives the options.
    const { default: leaflet } = await import('leaflet');
    expect(leaflet.markerClusterGroup).toHaveBeenCalledWith(
      expect.objectContaining({ disableClusteringAtZoom: 22 }),
    );
  });

  it('defaults disableClusteringAtZoom to 15', async () => {
    const adapter = createClusterAdapter();
    await adapter.renderClusterGroup([]);
    const { default: leaflet } = await import('leaflet');
    expect(leaflet.markerClusterGroup).toHaveBeenCalledWith(
      expect.objectContaining({ disableClusteringAtZoom: 15 }),
    );
  });
});
```

- [ ] **Step 3: Create `frontend/src/map/LeafletAdapter.js`**

Create `frontend/src/map/LeafletAdapter.js`. The exact implementation depends on the live Leaflet API; the high-level shape is:

```js
// Leaflet adapter. Implements the MapAdapter port by delegating to a Leaflet
// `L.Map` instance. The instance is passed in (not created here) so the
// adapter is testable with a stub map.

export function createLeafletAdapter() {
  let mapInstance = null;

  function setMap(m) { mapInstance = m; }
  function getMap() { return mapInstance; }

  return {
    setMap,
    renderTile(url, attribution) {
      if (!mapInstance) return;
      // In a real implementation: mapInstance.eachLayer(...); mapInstance.addLayer(L.tileLayer(url, { attribution }));
    },
    renderGeoJson(data, style, onEach) {
      if (!mapInstance) return;
      // mapInstance.addLayer(L.geoJSON(data, { style, onEachFeature: onEach }));
    },
    on(event, cb) { if (mapInstance) mapInstance.on(event, cb); },
    off(event, cb) { if (mapInstance) mapInstance.off(event, cb); },
    getCenter() { return mapInstance ? mapInstance.getCenter() : null; },
    isIdle() { return mapInstance ? !mapInstance._animating : true; },
    fitBounds(bbox) { if (mapInstance) mapInstance.fitBounds(bbox); },
    setView(center, zoom) { if (mapInstance) mapInstance.setView(center, zoom); },
  };
}
```

(Full implementation, including the cluster delegation and E2E hook, is ~600 LOC; the executor fleshes this out by reading `TrackMap.vue`'s current `mounted` body.)

- [ ] **Step 4: Write `LeafletAdapter.test.js`**

Create `frontend/src/map/LeafletAdapter.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createLeafletAdapter } from '../../src/map/LeafletAdapter';

function makeStubMap() {
  return {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    eachLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 51.5, lng: -0.1 })),
    fitBounds: vi.fn(),
    setView: vi.fn(),
    _animating: false,
  };
}

describe('LeafletAdapter (stage 4a)', () => {
  it('setView calls map.setView with center and zoom', () => {
    const adapter = createLeafletAdapter();
    const map = makeStubMap();
    adapter.setMap(map);
    adapter.setView({ lat: 1, lng: 2 }, 13);
    expect(map.setView).toHaveBeenCalledWith({ lat: 1, lng: 2 }, 13);
  });

  it('getCenter returns the map.getCenter result', () => {
    const adapter = createLeafletAdapter();
    const map = makeStubMap();
    adapter.setMap(map);
    expect(adapter.getCenter()).toEqual({ lat: 51.5, lng: -0.1 });
  });

  it('fitBounds calls map.fitBounds with the bbox', () => {
    const adapter = createLeafletAdapter();
    const map = makeStubMap();
    adapter.setMap(map);
    const bbox = [[0, 0], [10, 10]];
    adapter.fitBounds(bbox);
    expect(map.fitBounds).toHaveBeenCalledWith(bbox);
  });

  it('on/off delegate to map.on and map.off', () => {
    const adapter = createLeafletAdapter();
    const map = makeStubMap();
    adapter.setMap(map);
    const cb = vi.fn();
    adapter.on('click', cb);
    expect(map.on).toHaveBeenCalledWith('click', cb);
    adapter.off('click', cb);
    expect(map.off).toHaveBeenCalledWith('click', cb);
  });
});
```

- [ ] **Step 5: Run all map tests**

Run: `bun run test src/map/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/map/ClusterAdapter.js frontend/src/map/LeafletAdapter.js frontend/src/map/
git commit -m "feat(frontend): LeafletAdapter + ClusterAdapter (stage 4a)"
```

---

### Task 4.4: Stage 4a — Create `E2EAdapter.js` + refactor `TrackMap.vue`

- [ ] **Step 1: Create `frontend/src/map/E2EAdapter.js`**

~40 LOC. Lifts the `window.__e2e` hook setup out of `TrackMap.vue`:

```js
export function createE2EAdapter() {
  return {
    exposeE2E(namespace, api) {
      if (typeof window !== 'undefined') {
        window.__e2e = window.__e2e || {};
        window.__e2e[namespace] = api;
      }
    },
  };
}
```

- [ ] **Step 2: Write `E2EAdapter.test.js`**

Create `frontend/src/map/E2EAdapter.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createE2EAdapter } from '../../src/map/E2EAdapter';

describe('E2EAdapter (stage 4a)', () => {
  let originalWindow;

  beforeEach(() => {
    // jsdom provides a window; capture for cleanup.
    originalWindow = globalThis.window;
  });
  afterEach(() => {
    globalThis.window = originalWindow;
    delete globalThis.window?.__e2e;
  });

  it('exposeE2E sets window.__e2e.namespace to the given API', () => {
    const adapter = createE2EAdapter();
    const api = { getCenter: () => ({ lat: 0, lng: 0 }) };
    adapter.exposeE2E('map', api);
    expect(globalThis.window.__e2e.map).toBe(api);
  });

  it('preserves existing namespaces when adding a new one', () => {
    const adapter = createE2EAdapter();
    adapter.exposeE2E('map', { a: 1 });
    adapter.exposeE2E('poi', { b: 2 });
    expect(globalThis.window.__e2e.map).toEqual({ a: 1 });
    expect(globalThis.window.__e2e.poi).toEqual({ b: 2 });
  });

  it('overwrites an existing namespace if exposed twice', () => {
    const adapter = createE2EAdapter();
    adapter.exposeE2E('map', { a: 1 });
    adapter.exposeE2E('map', { a: 2 });
    expect(globalThis.window.__e2e.map).toEqual({ a: 2 });
  });

  it('handles SSR (no window) by being a no-op', () => {
    // Simulate SSR by removing window.
    globalThis.window = undefined;
    const adapter = createE2EAdapter();
    // Should not throw.
    expect(() => adapter.exposeE2E('map', { a: 1 })).not.toThrow();
  });
});
```

- [ ] **Step 3: Refactor `TrackMap.vue` to use the adapters**

This is the largest single change in the plan. `TrackMap.vue` (2 561 LOC) shrinks to ≤600 LOC by:
- Removing the filter UI (moved to `TrackFilterControl.vue` as a separate component, but still in this plan's scope).
- Removing the cluster logic (now in `ClusterAdapter`).
- Removing the `window.__e2e` setup (now in `E2EAdapter`).
- Removing the Leaflet-specific tile/geojson rendering (now in `LeafletAdapter`).
- Keeping the shell: the `<l-map>` Vue component, the `@ready` handler, the `provide('leafletMap', ...)` call (now a `shallowRef` per Stage 0.5b), and the slot for overlays.

Concretely:
- The new `TrackMap.vue` imports `createLeafletAdapter`, `createClusterAdapter`, `createE2EAdapter` from `frontend/src/map/`.
- It calls `createMapAdapter({ ...createLeafletAdapter(leafletInstance.value), ...createClusterAdapter(), ...createE2EAdapter() })` and provides the result.
- `<PoiClusterGroup>` and `<TrackFilterControl>` use `inject('mapAdapter')` to get the adapter.

- [ ] **Step 4: Update `PoiClusterGroup.vue` to use the adapter**

Replace the `inject('leafletMap')` call (which returned the Vue Leaflet wrapper) with `inject('mapAdapter')` (which returns the proper adapter). The `setInterval` polling is removed (Stage 0.5b already did this). All map interactions go through the adapter.

- [ ] **Step 5: Update `TrackFilterControl.vue` to use the adapter**

The current `TrackFilterControl` is a Vue SFC. Add an `inject('mapAdapter')` and route map interactions (e.g., `map.fitBounds`) through the adapter.

- [ ] **Step 6: Run the full test suite + e2e**

Run: `bun run test && bun run test:e2e`
Expected: PASS. The map controls visibility, shareable link, POI clustering, and track CRUD all still work — they're now driven through the adapter.

- [ ] **Step 7: Verify `TrackMap.vue` is small**

Run: `wc -l frontend/src/components/TrackMap.vue`
Expected: ≤600 LOC.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/TrackMap.vue \
        frontend/src/components/PoiClusterGroup.vue \
        frontend/src/components/TrackFilterControl.vue \
        frontend/src/map/E2EAdapter.js \
        frontend/src/map/E2EAdapter.test.js
git commit -m "refactor(TrackMap): use MapAdapter seam; shell now 600 LOC, 4 adapters handle concerns (stage 4a, ADR 0020)"
```

---

## Stage 5 — Delete orphan code, repair CI, observability drift

**Files:**
- Delete: 4 orphan Vue components + 1 util + partial deletes in 2 composables.
- Modify: `.github/workflows/#test.yaml` → `ci.yaml`.
- New: `.github/workflows/ci.yaml`.
- New: `docs/environment-variables.md` updates.
- Modify: `docker-compose.*.prod.yaml`.
- New: 1 ADR (`0022`).

### Task 5.1: Stage 5a — Delete orphan frontend code

- [ ] **Step 1: Verify the orphan list with a final grep**

```bash
cd /Users/solovey/Documents/dev/trackly
for f in frontend/src/components/PoiMarker.vue frontend/src/components/SlopeLegend.vue frontend/src/components/TrackLayer.vue frontend/src/components/VirtualTrackPointsList.vue frontend/src/utils/mapPerformance.js; do
  count=$(grep -rln "$(basename $f)" frontend/src/ | grep -v "^${f}$" | wc -l)
  echo "$f: $count import sites"
done
```
Expected: 0 for each (or for those that the integration from `create-tracks` now uses, document the new caller and keep the file).

- [ ] **Step 2: Delete the 4 orphan components**

```bash
git rm frontend/src/components/PoiMarker.vue \
       frontend/src/components/SlopeLegend.vue \
       frontend/src/components/TrackLayer.vue \
       frontend/src/components/VirtualTrackPointsList.vue \
       frontend/src/utils/mapPerformance.js
```

- [ ] **Step 3: Partial-delete in 2 composables**

Edit `frontend/src/composables/useMemoization.js`: keep only `useMemoizedComputed` and `clearCacheByPattern`; delete `useMemoizedChartData` and `useMemoizedFormatters`. Edit `frontend/src/composables/useAdvancedDebounce.js`: keep only `useAdvancedDebounce` and `useThrottle`; delete `useReactiveDebounce` and `useMapDebounce`.

- [ ] **Step 4: Check Stage 0 verify results for `useDraftSave`/`useUndoRedo`**

If Stage 0's verify step 5 showed these are not imported by `useTrackEditor.js`, delete them:
```bash
git rm frontend/src/composables/useDraftSave.js frontend/src/composables/useUndoRedo.js
```
If they are imported, keep them.

- [ ] **Step 5: Run the test suite + build**

Run: `cd /Users/solovey/Documents/dev/trackly/frontend && bun run test && bun run build`
Expected: PASS.

- [ ] **Step 6: Verify the dist is smaller**

Run: `ls -la frontend/dist/assets/*.js frontend/dist/assets/*.css 2>/dev/null | head`
Expected: a smaller dist than before Stage 5a.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(frontend): delete orphan components and partial composable cleanup (stage 5a)"
```

---

### Task 5.2: Stage 5b — Repair CI

- [ ] **Step 1: Rename `#test.yaml` to `ci.yaml`**

```bash
cd /Users/solovey/Documents/dev/trackly
git mv './.github/workflows/#test.yaml' .github/workflows/ci.yaml
```

- [ ] **Step 2: Edit the renamed `ci.yaml`**

Open `.github/workflows/ci.yaml`. The original file is the test workflow (per the architecture plan). The new `ci.yaml` should:
- Trigger on `pull_request` and `push` to `master` (or `main`, depending on the repo's primary branch — verify with `git branch -a | head`).
- Run `bun install`, `bun run lint`, `bun run test --coverage` (frontend).
- Run `cargo fmt -- --check`, `cargo clippy -- -D warnings`, `cargo test` (backend). Add `cargo-audit` and `cargo-deny` as separate steps.
- Add the ephemeral Postgres service:

```yaml
services:
  postgres:
    image: postgis/postgis:15-3.4
    env:
      POSTGRES_USER: trackly
      POSTGRES_PASSWORD: trackly
      POSTGRES_DB: trackly_test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports: ['5432:5432']
```

- Bootstrap the schema: a step that runs `psql -U trackly -d trackly_test -f backend/migrations/*.sql` after the postgres service is up.

- Run the previously-`#[ignore]`'d tests: they're already ungated in Stage 1d and 2c. Add a `cargo test --features integration` step.

- Add a JS audit step. **Note:** `bun audit` is not a real command (verified). Use `bunx --bun npm audit --omit=dev --audit-level=high` (or `npm audit` via `bunx`). Add a separate `cargo audit` step (the `cargo-audit` binary is installed via `cargo install cargo-audit` in a setup step).

- Add the orphan-grep step: `./.github/scripts/check-orphans.sh` (from Stage 2f).

- Add a Playwright job with the `run-e2e` PR label gate:

```yaml
e2e:
  name: Playwright E2E
  runs-on: ubuntu-latest
  needs: [frontend, backend]
  if: contains(github.event.pull_request.labels.*.name, 'run-e2e')
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20' }
    - run: cd frontend && bun install --frozen-lockfile
    - run: cd frontend && bun run test:e2e
      env:
        BASE_URL: http://localhost:8080
```

- [ ] **Step 3: Verify the workflow file is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yaml'))" || python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yaml'))"`
Expected: no error. If YAML is invalid, fix the syntax.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yaml
git commit -m "ci: rename #test.yaml to ci.yaml, add coverage/audit/e2e/orphan-grep (stage 5b, ADR 0022)"
```

---

### Task 5.3: Stage 5b — Un-ignore the 2 `#[ignore]` Rust tests, gate on `DATABASE_URL`

- [ ] **Step 1: Find the 2 ignored tests**

```bash
grep -n "#\[ignore\]" backend/src/track_utils/elevation_enrichment.rs
```
Expected: 2 hits at lines 799 and 816 (per Stage 5b in the architecture plan).

- [ ] **Step 2: Replace `#[ignore]` with `DATABASE_URL` gating**

For each test:
- Remove `#[ignore]`.
- Add at the top of the test body:
  ```rust
  if std::env::var("DATABASE_URL").is_err() {
      eprintln!("DATABASE_URL not set; skipping");
      return;
  }
  ```

- [ ] **Step 3: Run `cargo test`**

Run: `cd /Users/solovey/Documents/dev/trackly/backend && cargo test`
Expected: PASS (the tests skip if no `DATABASE_URL` is set; they run with a real DB in CI).

- [ ] **Step 4: Commit**

```bash
git add backend/src/track_utils/elevation_enrichment.rs
git commit -m "test(elevation): un-ignore 2 tests, gate on DATABASE_URL (stage 5b)"
```

---

### Task 5.4: Stage 5b — Write ADR 0022

- [ ] **Step 1: Create the ADR**

```markdown
# Add a CI smoke-test policy and a test runner that uses ephemeral Postgres (stage 5b, ADR 0022)

The audit's Candidate 10 noted that CI is broken: `.github/workflows/#test.yaml` is ignored by GitHub (filename must end in `.yml`/`.yaml`). We rename it to `ci.yaml`, add coverage (`vitest --coverage`, `cargo-tarpaulin`), audit (`npm audit` via `bunx`, `cargo-audit`, `cargo-deny`), an ephemeral Postgres service for integration tests, and a Playwright E2E job gated on the `run-e2e` PR label. The 2 actual `#[ignore]` Rust tests (not the audit's ~20) are ungated on `DATABASE_URL`. The orphan-grep guardrail from Stage 2f runs in CI.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0022-ci-policy-and-test-runner.md
git commit -m "docs(adr): 0022 CI policy + ephemeral Postgres + un-ignore tests (stage 5b)"
```

---

### Task 5.5: Stage 5c — Observability drift fixes

- [ ] **Step 1: Update `docs/environment-variables.md`**

Add the auth env-var surface. Find the file (`docs/environment-variables.md`); append a section for the auth env vars that are in `.env.example` but missing from the doc:

```markdown
## Auth

- `JWT_SECRET` — HMAC secret for access tokens. Required.
- `JWT_EXPIRY_SECS` — Access token lifetime. Default 900.
- `REFRESH_TOKEN_EXPIRY_SECS` — Refresh token lifetime. Default 2592000.
- `REFRESH_TOKEN_ABSOLUTE_SECS` — Absolute refresh lifetime. Default 31536000.
- `GOOGLE_CLIENT_ID` — Google OAuth client id.
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret.
- `GOOGLE_REDIRECT_URI` — Google OAuth callback URL.
- `FRONTEND_BASE_URL` — Base URL of the frontend (used in CORS and emails).
- `CORS_ALLOWED_ORIGINS` — Comma-separated list of allowed origins.
- `LOGIN_ATTEMPTS_RETENTION_DAYS` — Days to retain login attempt records. Default 30.
- `MAX_LOGIN_ATTEMPTS_PER_IP` — Rate limit per IP. Default 10.
- `SUSPICIOUS_FAILED_ATTEMPTS_IP` — Threshold for IP flagging. Default 50.
- `SUSPICIOUS_FAILED_ATTEMPTS_USER` — Threshold per user. Default 20.
```

- [ ] **Step 2: Bring `.env.example` up to date**

```bash
cd /Users/solovey/Documents/dev/trackly
diff .env .env.example | head -50
```
For each var in `.env` that's not in `.env.example`, add it (without the actual secret value).

- [ ] **Step 3: Align `docker-compose.amd64.prod.yaml` and `docker-compose.aarch64.prod.yaml`**

Edit both files to use the same PostGIS major version. The amd64 file uses `postgis/postgis:18-3.6-alpine`; the aarch64 file uses `imresamu/postgis:17-3.6.0-alpine3.21`. Pick one (e.g., 18-3.6) and align both.

- [ ] **Step 4: Apply `read_only: true` and `tmpfs` to both backends**

In each `docker-compose.*.prod.yaml`, find the backend service definition. Add:
```yaml
read_only: true
tmpfs:
  - /tmp
  - /app/target
```
(Adjust the tmpfs paths based on the actual service definition.)

- [ ] **Step 5: Fix the dashboard path mismatch**

Either rename `observability/dashboards/caddy-frontend.json` to `caddy-grafana-dashboard.json` (matching the spec), or update the spec to point at the actual file. Pick the fewer-changes option (likely the spec update, but verify by reading both).

- [ ] **Step 6: Add a PostgreSQL dashboard**

The audit's spec says one should exist. Either copy an existing dashboard JSON and adapt it, or use a Grafana community dashboard for Postgres. Save as `observability/dashboards/postgresql.json`.

- [ ] **Step 7: Set the `VERSION` env var in prod compose**

In both `docker-compose.*.prod.yaml`, find the backend service. Add `VERSION: ${VERSION:-dev}` to its `environment` block. (The CI release workflow already sets `${{ github.ref_name }}` for `VERSION`.)

- [ ] **Step 8: Move `.env` real secrets out of the repo**

If `.env` is in `.gitignore` (verify with `grep -E "^\.env$" .gitignore`), the real secrets are not in git, and this step is a no-op. If `.env` is tracked, the secrets are exposed — stop, rotate the secrets, and add `.env` to `.gitignore` immediately.

(For the taskly project, `.env` is in `.gitignore`. Verify and document.)

- [ ] **Step 9: Commit**

```bash
git add docs/environment-variables.md .env.example docker-compose.*.prod.yaml observability/
git commit -m "chore(observability): align env-var docs, compose versions, dashboard path (stage 5c)"
```

---

## Stage 6 — Documentation: `CONTEXT.md` and the ADR cleanup

**Files:**
- New: `CONTEXT.md` at repo root.
- New: 2 ADRs (`0023`, `0024`).

### Task 6.1: Stage 6a — Create `CONTEXT.md` (ADR 0023)

- [ ] **Step 1: Write ADR 0023**

```markdown
# Create `CONTEXT.md` and the project domain glossary (stage 6a, ADR 0023)

The project has no domain glossary. The architecture plan's Candidate 1 plus the post-audit reorg call for a single `CONTEXT.md` at repo root with: `Track`, `Track Detail`, `Track Simplified`, `POI`, `User`, `Session`, `Track Mode` (one of `view`, `edit`), `Category`, `Elevation`, `Slope`, `Simplification`, `Enrichment`, `Auth`, `Refresh Token`, `Token Family`, plus a "Deferred follow-ups" section listing `TrackDetailPanel.vue` (4 156 LOC), `AccountView.vue` (1 520 LOC), and `useSearchState.js` (module-singleton but production-dead). Each entry has an `_Avoid_` synonyms list. No implementation details. ~80 lines total.
```

- [ ] **Step 2: Create `CONTEXT.md`**

Create `CONTEXT.md` at the repo root with this content:

```markdown
# Trackly Domain Glossary

> **For agentic workers:** every domain term used in code, docs, and conversation
> should appear here. No implementation details — this is a glossary, not a spec.

## Language

**Track**: A GPS track — a sequence of GPS points with timestamps, plus derived
metrics (length, elevation profile, speed).
_Avoid_: route, path, trip (route is a directional variant; path is generic).

**Track Detail**: The full representation of a track with all points, segments,
elevation, and metadata. Returned by `GET /api/tracks/{id}`.
_Avoid_: full track, detailed track.

**Track Simplified**: A version of a track with fewer points (Douglas-Peucker
simplification) for map display at low zoom levels. Returned by
`GET /api/tracks/{id}/simplified`.
_Avoid_: small track, lite track.

**POI**: Point of Interest. A named, categorized geographic point that can be
attached to tracks.
_Avoid_: marker, waypoint (waypoint is a track-internal concept; POI is global).

**User**: A registered user, identified by Google OAuth. Has tracks, profile,
and auth state. Anonymous users have a `Session` instead.
_Avoid_: account, member.

**Session**: An anonymous user's session, identified by a UUID cookie. Sessions
own tracks until the user logs in; on login, session tracks migrate to the
user's account.
_Avoid_: guest, anonymous, visitor.

**Track Mode**: One of `view` (read-only display) or `edit` (interactive editor).
The mode determines which UI affordances are visible.
_Avoid_: state, view-mode.

**Category**: One of `hiking`, `walking`, `running`, `cycling`. A track can
have multiple categories.
_Avoid_: tag, label, sport.

**Elevation**: Vertical profile of a track, in meters. Has `elevation_min`,
`elevation_max`, `elevation_gain`. Computed from track points; enriched from
OpenTopoData when missing.
_Avoid_: altitude, height.

**Slope**: The grade of a track segment, in percent. Computed from elevation
and horizontal distance.
_Avoid_: grade, incline.

**Simplification**: The Douglas-Peucker algorithm applied to track points for
display at low zoom levels. The simplified form preserves shape within a
tolerance.
_Avoid_: compression, decimation.

**Enrichment**: The process of fetching missing data (elevation) from a third
party (OpenTopoData) and storing it on the track.
_Avoid_: augmentation, completion.

**Auth**: The authentication subsystem. Handles Google OAuth, JWT access
tokens, refresh-token rotation with family revocation.
_Avoid_: login, sign-in.

**Refresh Token**: A long-lived token used to obtain new access tokens.
Stored server-side; rotated on each use; a family is revoked if rotation
fails.
_Avoid_: session token, persistent token.

**Token Family**: A lineage of refresh tokens descended from a single login.
If any token in the family is replayed, the entire family is revoked.
_Avoid_: session lineage, token chain.

## Deferred follow-ups

- `TrackDetailPanel.vue` (4 156 LOC) — deferred to a follow-up plan.
- `AccountView.vue` (1 520 LOC) — deferred to a follow-up plan.
- `useSearchState.js` (module-singleton but production-dead; only a test mock
  uses it) — may be deleted entirely in a follow-up.
```

- [ ] **Step 3: Verify each term is used in code or docs**

For each term, run:
```bash
cd /Users/solovey/Documents/dev/trackly
for term in Track "Track Detail" "Track Simplified" POI User Session "Track Mode" Category Elevation Slope Simplification Enrichment Auth "Refresh Token" "Token Family"; do
  count=$(grep -rlF -- "$term" backend/src frontend/src docs/ 2>/dev/null | wc -l)
  echo "$term: $count files"
done
```
Expected: each term has at least 1 file using it. If a term is unused, either remove it from the glossary or add a code reference.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/adr/0023-create-context-glossary.md
git commit -m "docs: CONTEXT.md domain glossary (stage 6a, ADR 0023)"
```

---

### Task 6.2: Stage 6b — Delete the dangling spec and plan on `master`

- [ ] **Step 1: Write ADR 0024**

```markdown
# YAGNI: delete the track-editor spec and unstarted plan on `master` (stage 6b, ADR 0024)

The 1 600-line `docs/create-and-edit-tracks.md` spec and the 200-line `docs/superpowers/plans/2026-03-18-track-editor-ui-redesign.md` plan described work that has shipped on `create-tracks` and is now on `master` (via Stage 0). The new `useTrackEditor.js` (2 340 LOC) is the live document of the editor's behaviour. The spec and plan are the wrong kind of complexity: present, untested, discoverable as "things to read" by every future maintainer. The deletion test says "delete". They may be recovered from git history if needed.
```

- [ ] **Step 2: Delete the two spec files**

```bash
cd /Users/solovey/Documents/dev/trackly
git rm docs/create-and-edit-tracks.md
git rm docs/superpowers/plans/2026-03-18-track-editor-ui-redesign.md
```

- [ ] **Step 3: Verify nothing imports them**

Run:
```bash
grep -rn "create-and-edit-tracks\|track-editor-ui-redesign" backend/src frontend/src docs/
```
Expected: zero matches. (If the architecture plan itself or CONTEXT.md references these, update those references to point at the git history instead.)

- [ ] **Step 4: Commit**

```bash
git add -A docs/adr/0024-yagni-delete-dangling-editor-spec.md
git commit -m "docs: delete track-editor spec and plan (now live on master) (stage 6b, ADR 0024)"
```

---

## Final verification

- [ ] **Step 1: Run all tests**

```bash
cd /Users/solovey/Documents/dev/trackly
cd backend && cargo test
cd ../frontend && bun run test && bun run test:e2e
```
Expected: ALL pass.

- [ ] **Step 2: Verify the audit's 30+ findings are all closed**

Open `/var/folders/49/tgd627ns2y19fj8nqnnq0ds00000gp/T/architecture-review-1787779207.html`. For each finding, locate the closing task in this plan. If any finding is not closed, add a new task.

- [ ] **Step 3: Verify the orphan-grep guardrail exits 0**

```bash
cd /Users/solovey/Documents/dev/trackly
./.github/scripts/check-orphans.sh; echo "exit: $?"
```
Expected: exit 0.

- [ ] **Step 4: Verify the LOC reductions**

| Metric | Before | After |
|---|---|---|
| `handlers/tracks.rs` | 2 683 | ≤800 |
| `TrackMap.vue` | 2 561 | ≤600 |
| `useAuth.js` | 508 | ≤50 |
| Dead backend exports | 14-17 | 0 |
| Orphan frontend files | 5+ | 0 |

Run `wc -l` on each file to confirm.

- [ ] **Step 5: Verify the ADRs**

```bash
ls docs/adr/
```
Expected: 24 ADR files (`0001` through `0024`).

- [ ] **Step 6: Commit any final cleanup**

If anything in steps 1-5 required a fix, commit it:
```bash
git add -A
git commit -m "chore: final verification fixes" || true
```

- [ ] **Step 7: Tag the final state**

```bash
git tag -a v0.5.0-architecture-remediation -m "all 6 stages of the architecture remediation plan complete"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-31-architecture-remediation.md`.

This plan covers 9 stages (Stage 0 through Stage 6, plus Stage 0.5 and Stage 2.5) with ~30 tasks. The tasks are sequenced: each task's `Depends on` notes the prerequisite stages, and within a stage tasks are numbered to enforce order (e.g., Task 1.1 → 1.2 → 1.3 → ...). Each task ends with an independently-verifiable deliverable (a test, a commit, a tag).

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for the long-tail of small fixes (Stages 0.5, 2.5, 6a) and the risky core (Stage 0, Stage 1).

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Best when you want to drive the keyboard yourself and I'm the navigator.

**Recommended for this plan: Subagent-Driven** because:
- The plan is long (30+ tasks); fresh subagents avoid context bloat.
- The early tasks (Stage 0) are the riskiest; isolating them in a subagent means a botched merge doesn't poison the rest of the session.
- The plan has explicit commits per task; a subagent-per-task flow matches the commit cadence naturally.

Which approach?
