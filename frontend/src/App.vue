<template>
  <router-view v-slot="{ Component, route }">
    <transition name="page" mode="out-in" appear>
      <keep-alive :include="['HomeView', 'TrackView']" :max="3">
        <component :is="Component" :key="route.meta.keepAliveKey || route.fullPath" />
      </keep-alive>
    </transition>
  </router-view>
</template>

<script setup>
// App.vue now just renders router views
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
}

#app {
  height: 100vh;
  width: 100vw;
}

/* Page transition styles for smooth route changes */
.page-enter-active, .page-leave-active {
  transition: opacity 0.15s ease-out;
}

.page-enter-from {
  opacity: 0;
}

.page-leave-to {
  opacity: 0;
}

.page-enter-to, .page-leave-from {
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
</style>
