<template>
  <div id="app-container">
    <template v-if="featureFlags.isLoaded">
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
        <div class="loading-spinner"></div>
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
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
    "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
}

#app {
  height: 100vh;
  width: 100vw;
}

#app-container {
  height: 100%;
  width: 100%;
}

/* Page transition styles for smooth route changes */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease-out;
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
  width: 100vw;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
