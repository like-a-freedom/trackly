<template>
  <div id="app-container">
    <template v-if="featureFlags.isLoaded">
      <div v-if="featureFlags.error" role="alert" class="fixed inset-x-3 inset-bs-3 z-[5000] flex items-center gap-3 rounded border border-line bg-surface p-3 text-sm text-ink shadow-md">
        <span>{{ featureFlags.error }}</span>
        <button type="button" class="min-h-11 shrink-0 rounded bg-action px-3 font-semibold text-white disabled:opacity-50" :disabled="featureFlags.isLoading" @click="handleRetrySettings">{{ featureFlags.isLoading ? 'Retrying…' : 'Retry settings' }}</button>
      </div>
      <router-view v-slot="{ Component, route }">
        <transition
          name="page"
          mode="out-in"
          appear
        >
          <keep-alive
            :include="['HomeView', 'TrackView']"
            :max="3"
          >
            <component
              :is="Component"
              :key="getComponentKey(route)"
            />
          </keep-alive>
        </transition>
      </router-view>

      <!-- Global dialog provider -->
      <ConfirmDialogProvider />
    </template>
    <template v-else>
      <div class="loading-screen">
        <div class="app-loading-spinner"></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import ConfirmDialogProvider from "./components/ConfirmDialogProvider.vue";
import { useAuth } from "./composables/useAuth";
import { useFeatureFlagsStore } from "./stores/featureFlags";

const featureFlags = useFeatureFlagsStore();
const { initialize } = useAuth();
const handleRetrySettings = async () => {
  await featureFlags.fetchFlags();
  if (featureFlags.isAuthEnabled) await initialize();
};

onMounted(async () => {
  await featureFlags.fetchFlags();
  if (featureFlags.isAuthEnabled) {
    initialize();
  }
});

// Generate component key that ignores URL query params to prevent unnecessary rerenders
// This prevents map flicker when URL parameters like zoom, lat, lng change
function getComponentKey(route) {
  if (route.meta.keepAliveKey) {
    return route.meta.keepAliveKey;
  }

  // For HomeView, ignore query params to prevent rerender on map state changes
  if (route.name === "Home") {
    return "home-view";
  }

  // For TrackView, use path with ID but ignore query params
  if (route.name === "Track") {
    return `track-view-${route.params.id}`;
  }

  // Fallback to route path
  return route.path;
}
</script>

<style>
/* ============================================================
   Shared map-control tokens
   Map controls float over arbitrary tile imagery, so surfaces and
   focus rings must stay legible against light AND dark backgrounds.
   ============================================================ */
:root {
  /* Accent — one hue, three states. Replaces the four competing blues. */
  --accent: var(--color-action);
  --accent-hover: var(--color-action-hover);
  --accent-active: var(--color-active);

  /* Floating control surface */
  --control-bg: oklch(100% 0 none / 0.95);
  --control-bg-solid: var(--color-surface);
  --control-border: oklch(0% 0 none / 0.08);
  --control-border-strong: oklch(0% 0 none / 0.12);
  --control-icon: var(--color-muted);
  --control-icon-hover: oklch(32.1% 0 none);
  --control-shadow: 0 2px 8px oklch(0% 0 none / 0.08);
  --control-shadow-hover: 0 4px 12px oklch(0% 0 none / 0.12);
  --control-radius: 8px;

  /* Focus ring. The control plane is white cards floating on map tiles, so a
     dark ring is the one colour that reads on both. box-shadow is not usable
     here: every control declares its own box-shadow in scoped styles and
     those declarations win over a global rule. */
  --focus-ring: var(--color-focus-ring);
  --focus-ring-offset: 2px;

  /* Type scale. Five steps on a 1.25 modular ratio (1.2 base, floored at
     13px because this is a map UI read at arm's length, not long-form).
     Before this the reachable surface carried thirteen sizes from 10px to
     18px, where adjacent steps differed by 1px and read as noise. */
  --text-xs: 0.8125rem; /* 13px — map badges, hints, metadata floor */
  --text-sm: 0.9375rem; /* 15px — labels, values, body */
  --text-md: 1.125rem; /* 18px — result titles, panel headings */
  --text-lg: 1.4063rem; /* 22px — track name in the tooltip */
  --text-xl: 1.75rem; /* 28px — reserved for the editor title only */

  /* Weight ladder. Nothing below 18px goes under 400, where the stroke
     disappears at map-control sizes. */
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-bold: 600;

  /* Line height by role. Unitless so it scales with the size it sits on;
     microcopy runs tight, body runs open. */
  --leading-tight: 1.25; /* titles and single-line labels */
  --leading-snug: 1.4; /* two-line values */
  --leading-normal: 1.55; /* descriptions and empty-state copy */

  /* Semantic status. Toast borders already carried these three; they are
     named here so a component never re-invents a success or error hue. */
  --success: var(--color-success);
  --warning: var(--color-warning);
  --danger: var(--color-danger);
}

/* One focus treatment for the whole control plane. Custom controls ship
   :hover and :active styles but no ring of their own, so this is the only
   keyboard affordance they get. */
:where(button, a, input, select, textarea, [role="button"], [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* Interactive controls should act on the first tap, not wait out the
   double-tap-zoom delay. `manipulation` keeps pinch-to-zoom intact while
   removing the ~300ms tap lag on every control on the surface. */
:where(button, [role="button"], .collapse-btn, .collapse-button, .filter-button-compact) {
  touch-action: manipulation;
}

@media (forced-colors: active) {
  :where(button, a, input, select, textarea, [role="button"], [tabindex]):focus-visible {
    outline: 2px solid Highlight;
  }
}

/* Reduced motion is honored by authoring: every transition in the app is
   opt-in under `prefers-reduced-motion: no-preference`, so none of ours
   needs killing here. This net only neutralizes motion authored by
   third-party libraries we do not restyle (Leaflet pan/zoom/popups, VueForm
   multiselect and slider), which would otherwise keep moving. */
@media (prefers-reduced-motion: reduce) {
  .leaflet-container *,
  .leaflet-popup *,
  .multiselect,
  .multiselect *,
  .slider,
  .slider * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
    "Helvetica Neue", Arial, sans-serif;
  /* One declaration, applied once. Every component inherits these rather than
     re-declaring smoothing locally. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

#app {
  height: 100vh;
  height: 100dvh; /* dynamic viewport: nothing clipped behind mobile chrome */
  width: 100vw;
}

#app-container {
  height: 100%;
  width: 100%;
}

/* Page transition styles for smooth route changes */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s var(--ease-out, ease-out);
}

.page-enter-from {
  opacity: 0;
}

.page-leave-to {
  opacity: 0;
}

.page-enter-to,
.page-leave-from {
  opacity: 1;
}

/* Ensure transitions don't interfere with map rendering */
.page-enter-active .leaflet-container,
.page-leave-active .leaflet-container {
  transition: none !important;
  /* Prevent flickering during transitions */
  will-change: auto;
}

/* Optimize map container performance */
.leaflet-container {
  /* Force hardware acceleration for better performance */
  transform: translateZ(0);
  /* Prevent subpixel rendering issues */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
}

.app-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-line);
  border-top-color: var(--color-action);
  border-radius: 50%;
}

/* Spinners are the one animation that often survives reduced motion, but
   the preference asks for calm: reduced-motion users get a static ring. */
@media (prefers-reduced-motion: no-preference) {
  .app-loading-spinner {
    animation: spin 0.6s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
