<template>
  <div class="auth-button-container">
    <!-- Authenticated: show user avatar/menu -->
    <div v-if="isAuthenticated" class="user-menu" ref="userMenuRef">
      <button
        class="user-button"
        @click="toggleMenu"
        :title="user?.name || 'Account'"
      >
        <img
          v-if="user?.avatar_url"
          :src="user.avatar_url"
          :alt="user?.name || 'User'"
          class="user-avatar"
          referrerpolicy="no-referrer"
        />
        <div v-else class="avatar-placeholder-small">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </div>
      </button>

      <!-- Dropdown menu -->
      <transition name="menu-fade">
        <div v-if="menuOpen" class="user-dropdown">
          <div class="dropdown-header">
            <span class="user-name">{{ user?.name || "User" }}</span>
            <span class="user-email">{{ user?.email }}</span>
          </div>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" @click="goToAccount">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            My Account
          </button>
          <div class="dropdown-divider"></div>
          <button
            class="dropdown-item dropdown-item-logout"
            @click="handleLogout"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16,17 21,12 16,7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sign Out
          </button>
        </div>
      </transition>
    </div>

    <!-- Not authenticated: show login button -->
    <button
      v-else
      class="login-button"
      @click="handleLogin"
      :disabled="isLoading"
      title="Sign in with Google"
    >
      <svg
        v-if="isLoading"
        class="spinner"
        width="20"
        height="20"
        viewBox="0 0 24 24"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="3"
          fill="none"
          stroke-dasharray="40"
          stroke-dashoffset="10"
        />
      </svg>
      <!-- Google G icon -->
      <svg v-else width="20" height="20" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { isAuthenticated, isLoading, user, login, logout } = useAuth();

const menuOpen = ref(false);
const userMenuRef = ref(null);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

async function handleLogin() {
  try {
    // Store current route for redirect after login
    sessionStorage.setItem(
      "auth_return_to",
      router.currentRoute.value.fullPath
    );
    await login();
  } catch (e) {
    console.error("Login failed:", e);
  }
}

async function handleLogout() {
  closeMenu();
  await logout();
}

function goToAccount() {
  closeMenu();
  router.push("/account");
}

// Close menu when clicking outside
function handleClickOutside(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
.auth-button-container {
  position: relative;
}

.login-button {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: #666;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
  padding: 0;
}

.login-button svg {
  width: 20px;
  height: 20px;
  transition: transform 0.2s;
}

.login-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.login-button:hover:not(:disabled) svg {
  transform: scale(1.05);
}

.login-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Mobile adjustments to match other buttons */
@media (max-width: 640px) {
  .login-button {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility */
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .login-button svg {
    width: 22px;
    height: 22px;
  }
}

/* Safari-specific mobile fixes */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .login-button {
      background: #ffffff !important;
      backdrop-filter: none !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
  }
}

.spinner {
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

.user-menu {
  position: relative;
}

.user-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: 36px;
  height: 36px;
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s ease;
}

.user-button:hover {
  border-color: #3498db;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.2);
}

.user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder-small {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #e5e7eb;
  color: #9ca3af;
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  padding: 16px;
  background: #f9fafb;
}

.user-name {
  display: block;
  font-weight: 600;
  color: #1a1a1a;
  font-size: 0.95em;
}

.user-email {
  display: block;
  font-size: 0.8em;
  color: #6b7280;
  margin-top: 2px;
}

.dropdown-divider {
  height: 1px;
  background: #e5e7eb;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  font-size: 0.9em;
  color: #374151;
  cursor: pointer;
  transition: background 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: #f3f4f6;
}

.dropdown-item svg {
  color: #9ca3af;
}

.dropdown-item-logout {
  color: #b91c1c;
}

.dropdown-item-logout svg {
  color: #b91c1c;
}

.dropdown-item-logout:hover {
  background: #fef2f2;
}

/* Menu animation */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
