<template>
  <div class="account-page">
    <!-- Header with back button -->
    <header class="account-header">
      <button class="back-btn" @click="goBack" title="Back to map">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5"></path>
          <polyline points="12,19 5,12 12,5"></polyline>
        </svg>
        <span>Back</span>
      </button>
      <h1>My Account</h1>
      <div class="header-spacer"></div>
    </header>

    <!-- Loading state -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner"></div>
      <p>Loading account...</p>
    </div>

    <!-- Account content -->
    <div v-else class="account-content">
      <!-- Profile Section -->
      <section class="account-section profile-section">
        <div class="section-header">
          <h2>Profile</h2>
        </div>
        <div class="profile-card">
          <div class="avatar-wrapper">
            <img
              v-if="user?.avatar_url"
              :src="user.avatar_url"
              :alt="user.name || 'User avatar'"
              class="avatar"
              referrerpolicy="no-referrer"
            />
            <div v-else class="avatar-placeholder">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
            </div>
          </div>
          <div class="profile-info">
            <h3 class="user-name">{{ user?.name || "User" }}</h3>
            <p class="user-email">{{ user?.email }}</p>
            <p v-if="user?.nickname" class="user-nickname">
              @{{ user.nickname }}
            </p>
          </div>
        </div>

        <!-- Nickname editing -->
        <div class="nickname-section">
          <label for="nickname" class="input-label">Nickname</label>
          <div class="nickname-edit">
            <input
              id="nickname"
              v-model="editNickname"
              type="text"
              class="input-field"
              placeholder="Enter a nickname..."
              maxlength="50"
              :disabled="savingNickname"
            />
            <button
              class="btn-save"
              @click="saveNickname"
              :disabled="!nicknameChanged || savingNickname"
            >
              {{ savingNickname ? "Saving..." : "Save" }}
            </button>
          </div>
          <p v-if="nicknameError" class="field-error">{{ nicknameError }}</p>
          <p class="field-hint">
            1-50 characters, alphanumeric with underscores and hyphens
          </p>
        </div>
      </section>

      <!-- My Tracks Section -->
      <section class="account-section tracks-section">
        <div class="section-header">
          <h2>My Tracks</h2>
          <span class="track-count">{{ tracks.length }} tracks</span>
        </div>

        <div v-if="loadingTracks" class="tracks-loading">
          <div class="spinner-small"></div>
          <span>Loading tracks...</span>
        </div>

        <div v-else-if="tracks.length === 0" class="tracks-empty">
          <div class="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7"
              ></path>
              <path d="M9 20l6-3"></path>
              <path d="M9 7l6-3"></path>
              <path d="M15 4v13"></path>
              <path
                d="M15 17l5.447 2.724A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4"
              ></path>
            </svg>
          </div>
          <p>You don't have any tracks yet</p>
          <button class="btn-secondary" @click="goToUpload">
            Upload a track
          </button>
        </div>

        <div v-else class="tracks-list">
          <div
            v-for="track in tracks"
            :key="track.id"
            class="track-card"
            @click="openTrack(track.id)"
          >
            <div class="track-info">
              <h4 class="track-name">{{ track.name || "Unnamed Track" }}</h4>
              <div class="track-meta">
                <span class="track-stat">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M13.5,5.5C14.59,5.5 15.5,4.58 15.5,3.5C15.5,2.38 14.59,1.5 13.5,1.5C12.39,1.5 11.5,2.38 11.5,3.5C11.5,4.58 12.39,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.09,11 15.5,10 14.69,8.58L13.69,7C13.29,6.38 12.69,6 12,6C11.69,6 11.5,6.08 11.19,6.08L6,8.28V13H8V9.58L9.79,8.88L8.19,17L3.29,16L2.89,18L9.89,19.38Z"
                    />
                  </svg>
                  {{ formatDistance(track.length_km) }}
                </span>
                <span v-if="track.elevation_gain" class="track-stat">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z"
                    />
                  </svg>
                  {{ track.elevation_gain }}m
                </span>
                <span class="track-date">{{
                  formatDate(track.created_at)
                }}</span>
              </div>
            </div>
            <div class="track-visibility" :class="{ public: track.is_public }">
              {{ track.is_public ? "Public" : "Private" }}
            </div>
          </div>
        </div>

        <button
          v-if="hasMoreTracks"
          class="btn-load-more"
          @click="loadMoreTracks"
          :disabled="loadingTracks"
        >
          {{ loadingTracks ? "Loading..." : "Load more" }}
        </button>
      </section>

      <!-- Danger Zone -->
      <section class="account-section danger-section">
        <div class="section-header">
          <h2>Danger Zone</h2>
        </div>
        <div class="danger-card">
          <div class="danger-info">
            <h4>Delete Account</h4>
            <p>
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
          </div>
          <button class="btn-danger" @click="confirmDeleteAccount">
            Delete Account
          </button>
        </div>
      </section>

      <!-- Logout Button -->
      <div class="logout-section">
        <button class="btn-logout" @click="handleLogout">
          <svg
            width="18"
            height="18"
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useConfirm } from "../composables/useConfirm";

defineOptions({
  name: "AccountView",
});

const router = useRouter();
const { user, isLoading, logout, updateProfile, deleteAccount, authFetch } =
  useAuth();
const { confirm } = useConfirm();

// Profile editing
const editNickname = ref("");
const savingNickname = ref(false);
const nicknameError = ref(null);

// Tracks
const tracks = ref([]);
const loadingTracks = ref(false);
const tracksOffset = ref(0);
const tracksLimit = 20;
const hasMoreTracks = ref(false);

const nicknameChanged = computed(() => {
  return editNickname.value !== (user.value?.nickname || "");
});

function formatDistance(km) {
  if (!km || isNaN(km)) return "N/A";
  return `${km.toFixed(1)} km`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function loadTracks() {
  loadingTracks.value = true;
  try {
    const response = await authFetch(
      `/api/account/tracks?limit=${tracksLimit}&offset=${tracksOffset.value}&sort=created_at&order=desc`
    );
    if (response.ok) {
      const data = await response.json();
      if (tracksOffset.value === 0) {
        tracks.value = data.tracks || [];
      } else {
        tracks.value = [...tracks.value, ...(data.tracks || [])];
      }
      hasMoreTracks.value = (data.tracks?.length || 0) === tracksLimit;
    }
  } catch (e) {
    console.error("Failed to load tracks:", e);
  } finally {
    loadingTracks.value = false;
  }
}

async function loadMoreTracks() {
  tracksOffset.value += tracksLimit;
  await loadTracks();
}

async function saveNickname() {
  if (!nicknameChanged.value) return;

  // Validate nickname
  const nickname = editNickname.value.trim();
  if (nickname && !/^[a-zA-Z0-9_-]{1,50}$/.test(nickname)) {
    nicknameError.value =
      "Nickname must be 1-50 characters, alphanumeric with underscores and hyphens only";
    return;
  }

  savingNickname.value = true;
  nicknameError.value = null;

  try {
    await updateProfile({ nickname: nickname || null });
    editNickname.value = user.value?.nickname || "";
  } catch (e) {
    nicknameError.value = e.message || "Failed to update nickname";
  } finally {
    savingNickname.value = false;
  }
}

async function handleLogout() {
  await logout();
  router.replace("/");
}

async function confirmDeleteAccount() {
  const confirmed = await confirm({
    title: "Delete Account?",
    message:
      "This will permanently delete your account and all your tracks. This action cannot be undone.",
    confirmText: "Delete Account",
    cancelText: "Cancel",
  });

  if (confirmed) {
    try {
      await deleteAccount();
      router.replace("/");
    } catch (e) {
      alert(e.message || "Failed to delete account");
    }
  }
}

function goBack() {
  router.push("/");
}

function goToUpload() {
  router.push("/");
}

function openTrack(trackId) {
  router.push(`/track/${trackId}`);
}

onMounted(() => {
  if (user.value) {
    editNickname.value = user.value.nickname || "";
  }
  loadTracks();
});
</script>

<style scoped>
.account-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.account-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #374151;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.account-header h1 {
  margin: 0;
  font-size: 1.25em;
  font-weight: 600;
  color: #1a1a1a;
}

.header-spacer {
  width: 80px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 16px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #3498db;
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

.account-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.account-section {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f0f0f0;
}

.section-header h2 {
  margin: 0;
  font-size: 1.1em;
  font-weight: 600;
  color: #1a1a1a;
}

.track-count {
  font-size: 0.9em;
  color: #6b7280;
  background: #f3f4f6;
  padding: 4px 10px;
  border-radius: 12px;
}

/* Profile Section */
.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-bottom: 1px solid #f0f0f0;
}

.avatar-wrapper {
  flex-shrink: 0;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #e5e7eb;
}

.avatar-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.profile-info {
  flex: 1;
}

.user-name {
  margin: 0 0 4px 0;
  font-size: 1.2em;
  font-weight: 600;
  color: #1a1a1a;
}

.user-email {
  margin: 0;
  font-size: 0.9em;
  color: #6b7280;
}

.user-nickname {
  margin: 4px 0 0 0;
  font-size: 0.85em;
  color: #3498db;
}

.nickname-section {
  padding: 20px 24px;
}

.input-label {
  display: block;
  font-size: 0.9em;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.nickname-edit {
  display: flex;
  gap: 12px;
}

.input-field {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95em;
  transition: all 0.2s ease;
}

.input-field:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.input-field:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.btn-save {
  padding: 10px 20px;
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-save:hover:not(:disabled) {
  background: #2980b9;
}

.btn-save:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.field-error {
  margin: 8px 0 0 0;
  font-size: 0.85em;
  color: #dc2626;
}

.field-hint {
  margin: 8px 0 0 0;
  font-size: 0.8em;
  color: #9ca3af;
}

/* Tracks Section */
.tracks-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: #6b7280;
}

.tracks-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  gap: 16px;
}

.empty-icon {
  color: #d1d5db;
}

.tracks-empty p {
  margin: 0;
  color: #6b7280;
}

.btn-secondary {
  padding: 10px 20px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #e5e7eb;
  border-color: #9ca3af;
}

.tracks-list {
  padding: 0;
}

.track-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s ease;
}

.track-card:last-child {
  border-bottom: none;
}

.track-card:hover {
  background: #f9fafb;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-name {
  margin: 0 0 6px 0;
  font-size: 0.95em;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.track-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85em;
  color: #6b7280;
}

.track-stat svg {
  color: #9ca3af;
}

.track-date {
  font-size: 0.8em;
  color: #9ca3af;
}

.track-visibility {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  background: #f3f4f6;
  color: #6b7280;
}

.track-visibility.public {
  background: #dcfce7;
  color: #16a34a;
}

.btn-load-more {
  display: block;
  width: calc(100% - 48px);
  margin: 16px 24px 24px;
  padding: 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9em;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-load-more:hover:not(:disabled) {
  background: #e5e7eb;
}

.btn-load-more:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Danger Section */
.danger-section {
  border: 1px solid #fecaca;
}

.danger-section .section-header {
  background: #fef2f2;
}

.danger-section h2 {
  color: #b91c1c;
}

.danger-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  gap: 24px;
}

.danger-info h4 {
  margin: 0 0 4px 0;
  font-size: 0.95em;
  font-weight: 600;
  color: #1a1a1a;
}

.danger-info p {
  margin: 0;
  font-size: 0.85em;
  color: #6b7280;
}

.btn-danger {
  flex-shrink: 0;
  padding: 10px 20px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
}

/* Logout Section */
.logout-section {
  text-align: center;
  padding: 24px;
}

.btn-logout {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95em;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-logout:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

/* Mobile responsiveness */
@media (max-width: 640px) {
  .account-header {
    padding: 12px 16px;
  }

  .account-header h1 {
    font-size: 1.1em;
  }

  .header-spacer {
    width: 40px;
  }

  .account-content {
    padding: 16px;
  }

  .section-header {
    padding: 16px 20px;
  }

  .profile-card {
    flex-direction: column;
    text-align: center;
    padding: 24px 20px;
  }

  .nickname-section {
    padding: 16px 20px;
  }

  .nickname-edit {
    flex-direction: column;
  }

  .btn-save {
    width: 100%;
  }

  .track-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 20px;
  }

  .track-visibility {
    align-self: flex-start;
  }

  .danger-card {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 16px;
    padding: 20px;
  }

  .btn-danger {
    width: 100%;
  }

  .btn-load-more {
    width: calc(100% - 40px);
    margin: 16px 20px 20px;
  }
}
</style>
