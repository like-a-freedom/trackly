<template>
  <div class="account-page">
    <!-- Header with profile and settings -->
    <header class="account-header">
      <button
        class="back-btn"
        title="Back to map"
        @click="goBack"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5" />
          <polyline points="12,19 5,12 12,5" />
        </svg>
        <span>Back</span>
      </button>

      <div class="header-profile">
        <div class="header-avatar">
          <img
            v-if="user?.avatar_url"
            :src="user.avatar_url"
            :alt="user.name || 'User avatar'"
            referrerpolicy="no-referrer"
          >
          <svg
            v-else
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </div>
        <span class="header-user-name">{{ user?.name || "User" }}</span>
      </div>

      <div class="header-actions">
        <button
          ref="settingsMenu.buttonRef"
          class="settings-btn"
          title="Settings"
          @click="settingsMenu.toggle"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="3"
            />
            <path
              d="M12 1v6m0 6v6m10-7h-6M8 12H2m16.65-6.65l-4.24 4.24m-4.82 4.82L4.35 19.07M19.07 19.07l-4.24-4.24m-4.82-4.82L4.77 4.77"
            />
          </svg>
        </button>

        <!-- Settings dropdown menu -->
        <div
          v-if="settingsMenu.showMenu.value"
          ref="settingsMenu.menuRef"
          class="settings-menu"
        >
          <button
            class="menu-item"
            @click="nicknameEdit.open(user?.nickname || '')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
            Edit Nickname
          </button>
          <button
            class="menu-item menu-item-danger"
            @click="confirmDeleteAccount"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="3,6 5,6 21,6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
            Delete Account
          </button>
          <div class="menu-separator" />
          <button
            class="menu-item"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line
                x1="21"
                y1="12"
                x2="9"
                y2="12"
              />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </header>

    <!-- Nickname Edit Modal -->
    <Teleport to="body">
      <div
        v-if="nicknameEdit.showModal.value"
        class="modal-overlay"
        @click="nicknameEdit.close"
      >
        <div
          class="modal-content"
          @click.stop
        >
          <div class="modal-header">
            <h3>Edit Nickname</h3>
            <button
              class="modal-close"
              @click="nicknameEdit.close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label
                for="nickname-input"
                class="form-label"
              >Nickname</label>
              <input
                id="nickname-input"
                v-model="nicknameEdit.editValue.value"
                type="text"
                class="form-input"
                placeholder="Enter a nickname..."
                maxlength="50"
                :disabled="nicknameEdit.saving.value"
                @keyup.enter="nicknameEdit.save"
              >
              <p
                v-if="nicknameEdit.error.value"
                class="form-error"
              >
                {{ nicknameEdit.error.value }}
              </p>
              <p class="form-hint">
                1-50 characters, alphanumeric with underscores and hyphens
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button
              class="btn-cancel"
              :disabled="nicknameEdit.saving.value"
              @click="nicknameEdit.close"
            >
              Cancel
            </button>
            <button
              class="btn-primary"
              :disabled="!nicknameEdit.hasChanged.value || nicknameEdit.saving.value"
              @click="nicknameEdit.save"
            >
              {{ nicknameEdit.saving.value ? "Saving..." : "Save" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Loading state -->
    <div
      v-if="isLoading"
      class="loading-container"
    >
      <div class="spinner" />
      <p>Loading account...</p>
    </div>

    <!-- Account content -->
    <div
      v-else
      class="account-content"
    >
      <!-- My Tracks Section -->
      <section class="account-section tracks-section">
        <div class="section-header">
          <h2>My Tracks</h2>
          <span class="track-count">{{ search.filteredTracks.value.length }} tracks</span>
        </div>

        <!-- Search and Bulk Actions Bar -->
        <div
          v-if="trackList.tracks.value.length > 0"
          class="tracks-toolbar"
        >
          <div class="search-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              v-model="search.query.value"
              type="text"
              placeholder="Search tracks..."
              class="search-input"
            >
          </div>
          <div class="toolbar-actions">
            <label class="select-all-label">
              <input
                type="checkbox"
                :checked="bulkOps.allVisibleSelected.value"
                :indeterminate="bulkOps.someSelected.value && !bulkOps.allVisibleSelected.value"
                @change="bulkOps.toggleSelectAll"
              >
              <span>Select all</span>
            </label>
            <button
              v-if="selectedTrackIds.length > 0"
              class="btn-bulk"
              :disabled="bulkOps.bulkOperating.value"
              @click="bulkOps.bulkToggleVisibility"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                />
              </svg>
              Toggle visibility ({{ selectedTrackIds.length }})
            </button>
            <button
              v-if="selectedTrackIds.length > 0"
              class="btn-bulk btn-bulk-danger"
              :disabled="bulkOps.bulkOperating.value"
              @click="bulkOps.bulkDelete"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="3,6 5,6 21,6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
              </svg>
              Delete ({{ selectedTrackIds.length }})
            </button>
          </div>
        </div>

        <div
          v-if="trackList.loading.value"
          class="tracks-loading"
        >
          <div class="spinner-small" />
          <span>Loading tracks...</span>
        </div>

        <div
          v-else-if="trackList.tracks.value.length === 0"
          class="tracks-empty"
        >
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
              />
              <path d="M9 20l6-3" />
              <path d="M9 7l6-3" />
              <path d="M15 4v13" />
              <path
                d="M15 17l5.447 2.724A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4"
              />
            </svg>
          </div>
          <p>You don't have any tracks yet</p>
          <button
            class="btn-secondary"
            @click="goToUpload"
          >
            Upload a track
          </button>
        </div>

        <div
          v-else-if="search.filteredTracks.value.length === 0"
          class="tracks-empty"
        >
          <p>No tracks match your search</p>
          <button
            class="btn-secondary"
            @click="search.clear"
          >
            Clear search
          </button>
        </div>

        <div
          v-else
          class="tracks-list-container"
        >
          <div class="tracks-list">
            <div
              v-for="track in search.filteredTracks.value"
              :key="track.id"
              class="track-card"
              :class="{ selected: selectedTrackIds.includes(track.id) }"
            >
              <label
                class="track-checkbox"
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="selectedTrackIds.includes(track.id)"
                  @change="bulkOps.toggleSelection(track.id)"
                >
              </label>
              <div
                class="track-info"
                @click="openTrack(track.id)"
              >
                <h4 class="track-name">
                  {{ track.name || "Unnamed Track" }}
                </h4>
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
                  <span
                    v-if="track.elevation_gain"
                    class="track-stat"
                  >
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
                    {{ Math.round(track.elevation_gain) }}m
                  </span>
                  <span class="track-date">{{
                    formatDate(track.created_at)
                  }}</span>
                </div>
              </div>
              <button
                class="visibility-toggle"
                :class="{ public: track.is_public }"
                :disabled="togglingVisibility === track.id"
                :title="track.is_public ? 'Make private' : 'Make public'"
                @click.stop="handleToggleVisibility(track)"
              >
                <svg
                  v-if="togglingVisibility === track.id"
                  class="spinner-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="none"
                    stroke-dasharray="31.4"
                    stroke-dashoffset="10"
                  />
                </svg>
                <template v-else>
                  <svg
                    v-if="track.is_public"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                    />
                  </svg>
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                    />
                    <line
                      x1="1"
                      y1="1"
                      x2="23"
                      y2="23"
                    />
                  </svg>
                </template>
                <span>{{ track.is_public ? "Public" : "Private" }}</span>
              </button>
            </div>
          </div>
        </div>

        <button
          v-if="trackList.hasMore.value"
          class="btn-load-more"
          :disabled="trackList.loading.value"
          @click="trackList.loadMore"
        >
          {{ trackList.loading.value ? "Loading..." : "Load more" }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useConfirm } from "../composables/useConfirm";
import { http } from "../http-instance";
import { useTrackList } from "../composables/useTrackList";
import { useBulkTrackOperations } from "../composables/useBulkTrackOperations";
import { useSettingsMenu } from "../composables/useSettingsMenu";
import { useNicknameEdit } from "../composables/useNicknameEdit";
import { useTrackSearch } from "../composables/useTrackSearch";

defineOptions({
  name: "AccountView",
});

const router = useRouter();
const { user, isLoading, logout, deleteAccount } = useAuth();
const { confirm } = useConfirm();

// Composables
const settingsMenu = useSettingsMenu();
const trackList = useTrackList({ limit: 20 });
const search = useTrackSearch(trackList.tracks);
const nicknameEdit = useNicknameEdit(computed(() => user.value?.nickname || ""));

const selectedTrackIds = ref([]);
const togglingVisibility = ref(null);

const allVisibleSelected = computed(() => {
  if (search.filteredTracks.value.length === 0) return false;
  return search.filteredTracks.value.every((track) =>
    selectedTrackIds.value.includes(track.id)
  );
});

const someSelected = computed(() => {
  return (
    selectedTrackIds.value.length > 0 &&
    search.filteredTracks.value.some((track) =>
      selectedTrackIds.value.includes(track.id)
    )
  );
});

const bulkOps = useBulkTrackOperations({
  tracks: trackList.tracks,
  selectedIds: selectedTrackIds,
  allVisibleSelected,
  someSelected,
  removeTracks: trackList.removeTracks,
  confirm,
});

// Utility functions
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

async function handleToggleVisibility(track) {
  togglingVisibility.value = track.id;
  try {
    await trackList.toggleVisibility(track.id, !track.is_public);
  } finally {
    togglingVisibility.value = null;
  }
}

async function handleLogout() {
  settingsMenu.close();
  await logout();
  router.replace("/");
}

async function confirmDeleteAccount() {
  settingsMenu.close();

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
  trackList.loadTracks();
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
  gap: 16px;
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
  flex-shrink: 0;
}

.back-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.header-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  flex-shrink: 0;
}

.header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-user-name {
  font-size: 1em;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  position: relative;
  flex-shrink: 0;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.settings-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 6px;
  z-index: 1000;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 500;
  color: #374151;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-item-danger {
  color: #dc2626;
}

.menu-item-danger:hover {
  background: #fef2f2;
}

.menu-separator {
  height: 1px;
  background: #e5e7eb;
  margin: 6px 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1em;
  font-weight: 600;
  color: #1a1a1a;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 0.9em;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95em;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.form-input:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.form-error {
  margin: 8px 0 0 0;
  font-size: 0.85em;
  color: #dc2626;
}

.form-hint {
  margin: 8px 0 0 0;
  font-size: 0.8em;
  color: #9ca3af;
}

.btn-cancel {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9em;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:hover:not(:disabled) {
  background: #f3f4f6;
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
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

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.account-section {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
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

/* Tracks Section */
.tracks-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #9ca3af;
}

.search-box:focus-within {
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.9em;
  color: #374151;
  background: transparent;
}

.search-input::placeholder {
  color: #9ca3af;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
}

.select-all-label input {
  cursor: pointer;
}

.btn-bulk {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-bulk:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: #9ca3af;
}

.btn-bulk:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-bulk-danger {
  color: #dc2626;
  border-color: #fca5a5;
}

.btn-bulk-danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #f87171;
}

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

.tracks-list-container {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
}

.tracks-list {
  padding: 0;
}

.track-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s ease;
}

.track-card:last-child {
  border-bottom: none;
}

.track-card:hover {
  background: #f9fafb;
}

.track-card.selected {
  background: #eff6ff;
}

.track-checkbox {
  flex-shrink: 0;
  cursor: pointer;
}

.track-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.track-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
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

.visibility-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.visibility-toggle:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.visibility-toggle:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.visibility-toggle.public {
  background: #dcfce7;
  color: #16a34a;
  border-color: #86efac;
}

.visibility-toggle.public:hover:not(:disabled) {
  background: #bbf7d0;
  border-color: #4ade80;
}

.spinner-icon {
  animation: spin 1s linear infinite;
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

/* Mobile responsiveness */
@media (max-width: 640px) {
  .account-header {
    padding: 12px 16px;
  }

  .back-btn span {
    display: none;
  }

  .back-btn {
    padding: 8px;
  }

  .header-user-name {
    font-size: 0.9em;
  }

  .header-avatar {
    width: 32px;
    height: 32px;
  }

  .settings-menu {
    right: -8px;
  }

  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-content {
    border-radius: 12px 12px 0 0;
    max-width: none;
  }

  .account-content {
    padding: 16px;
  }

  .section-header {
    padding: 16px 20px;
  }

  .tracks-toolbar {
    padding: 12px 20px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-box {
    max-width: none;
  }

  .toolbar-actions {
    justify-content: space-between;
  }

  .tracks-list-container {
    max-height: calc(100vh - 240px);
  }

  .track-card {
    padding: 12px 20px;
  }

  .track-info {
    min-width: 0;
  }

  .visibility-toggle span {
    display: none;
  }

  .visibility-toggle {
    padding: 8px;
    border-radius: 50%;
  }

  .btn-load-more {
    width: calc(100% - 40px);
    margin: 16px 20px 20px;
  }
}
</style>
