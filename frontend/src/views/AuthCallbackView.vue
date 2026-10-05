// @ts-nocheck - Test mocks don't need full type fidelity
<template>
  <div class="auth-callback-container">
    <div class="auth-callback-card">
      <!-- Loading state -->
      <div
        v-if="isLoading"
        class="callback-loading"
      >
        <div class="spinner" />
        <p>Completing sign in...</p>
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        class="callback-error"
      >
        <div class="error-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <line
              x1="15"
              y1="9"
              x2="9"
              y2="15"
            />
            <line
              x1="9"
              y1="9"
              x2="15"
              y2="15"
            />
          </svg>
        </div>
        <h2>Sign in failed</h2>
        <p class="error-message">
          {{ error }}
        </p>
        <button
          class="btn-primary ui-primary"
          @click="goHome"
        >
          Return to Home
        </button>
      </div>

      <!-- Success state (brief, before redirect) -->
      <div
        v-else
        class="callback-success"
      >
        <div class="success-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <polyline points="9,12 12,15 16,10" />
          </svg>
        </div>
        <p>{{ statusMessage }}</p>
        <p class="redirect-message">
          {{ secondaryMessage }}
        </p>
      </div>
    </div>
  </div>
</template>

<!-- eslint-disable vue/block-lang -->
<script setup lang="ts">
// @ts-nocheck - Complex Vue component types
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useConfirm } from "../composables/useConfirm";

defineOptions({
  name: "AuthCallbackView",
});

const router = useRouter();
const route = useRoute();
const { handleCallback, migrateSessionTracks } = useAuth();
const { showConfirm } = useConfirm();

const isLoading = ref(true);
const error = ref(null);
const statusMessage = ref("Signed in successfully!");
const secondaryMessage = ref("Redirecting...");

async function handleSessionMigration() {
  const pendingSessionId = sessionStorage.getItem(
    "pending_migration_session_id"
  );

  if (!pendingSessionId) {
    return;
  }

  const confirmed = await showConfirm({
    title: "Link your tracks?",
    message:
      "We found tracks created before you signed in. Link them to your account so you can manage them from any device.",
    confirmText: "Link tracks",
    cancelText: "Skip",
  });

  sessionStorage.removeItem("pending_migration_session_id");

  if (!confirmed) {
    statusMessage.value = "Track linking skipped.";
    return;
  }

  secondaryMessage.value = "Linking your tracks...";
  const result = await migrateSessionTracks(pendingSessionId);
  const tracksMigrated = result?.tracks_migrated ?? 0;
  const poisMigrated = result?.pois_migrated ?? 0;

  if (tracksMigrated > 0 || poisMigrated > 0) {
    statusMessage.value = `Linked ${tracksMigrated} track${
      tracksMigrated === 1 ? "" : "s"
    } and ${poisMigrated} POI${poisMigrated === 1 ? "" : "s"}.`;
  } else {
    statusMessage.value = "No tracks were found to link.";
  }

  secondaryMessage.value = "Redirecting...";
}

async function processCallback() {
  const code = route.query.code;
  const state = route.query.state;
  const errorParam = route.query.error;

  // Check for OAuth error response
  if (errorParam) {
    error.value =
      route.query.error_description || "Authentication was cancelled or failed";
    isLoading.value = false;
    return;
  }

  // Validate required params
  if (!code || !state) {
    error.value = "Invalid callback - missing required parameters";
    isLoading.value = false;
    return;
  }

  try {
    await handleCallback(code, state);
    isLoading.value = false;

    await handleSessionMigration();

    // Brief pause to show success, then redirect
    setTimeout(() => {
      // Redirect to intended destination or home
      const returnTo = sessionStorage.getItem("auth_return_to") || "/";
      sessionStorage.removeItem("auth_return_to");
      router.replace(returnTo);
    }, 1000);
  } catch (e) {
    error.value = e.message || "Failed to complete sign in";
    isLoading.value = false;
  }
}

function goHome() {
  router.replace("/");
}

onMounted(() => {
  processCallback();
});
</script>

<style scoped>
.auth-callback-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-canvas);
  padding: 20px;
}

.auth-callback-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 48px;
  max-width: 400px;
  width: 100%;
  text-align: center;
}

.callback-loading,
.callback-error,
.callback-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  color: var(--color-danger);
}

.success-icon {
  color: var(--color-success);
}

h2 {
  margin: 0;
  font-size: 1.4em;
  color: var(--color-ink);
  font-weight: 600;
}

p {
  margin: 0;
  color: var(--color-muted);
  font-size: 1em;
  line-height: 1.5;
}

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  color: var(--color-danger);
  font-size: 0.9em;
}

.redirect-message {
  color: var(--color-muted);
  font-size: 0.9em;
}

.btn-primary  { margin-top: 8px; }





/* Mobile responsiveness */
@media (max-width: 500px) {
  .auth-callback-card {
    padding: 32px 24px;
  }
}
</style>
