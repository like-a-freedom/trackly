import { ref, computed, type Ref } from 'vue';
import { http } from '../http-instance';

interface TrackItem {
  id: string;
  is_public: boolean;
}

interface UseBulkOperationsOptions {
  tracks: Ref<TrackItem[]>;
  selectedIds: Ref<string[]>;
  allVisibleSelected: Ref<boolean>;
  someSelected: Ref<boolean>;
  removeTracks: (ids: string[]) => void;
  confirm: (options: { title: string; message: string; confirmText: string }) => Promise<boolean>;
}

interface BulkOperationsState {
  bulkOperating: Ref<boolean>;
  toggleSelectAll: () => void;
  toggleSelection: (trackId: string) => void;
  bulkToggleVisibility: () => Promise<void>;
  bulkDelete: () => Promise<void>;
}

export function useBulkTrackOperations(options: UseBulkOperationsOptions): BulkOperationsState {
  const { tracks, selectedIds, allVisibleSelected, someSelected, removeTracks, confirm } = options;

  const bulkOperating = ref(false);

  function toggleSelectAll(): void {
    if (allVisibleSelected.value || someSelected.value) {
      selectedIds.value = [];
    } else {
      selectedIds.value = tracks.value.map((t) => t.id);
    }
  }

  function toggleSelection(trackId: string): void {
    const index = selectedIds.value.indexOf(trackId);
    if (index === -1) {
      selectedIds.value = [...selectedIds.value, trackId];
    } else {
      selectedIds.value = selectedIds.value.filter((id) => id !== trackId);
    }
  }

  async function bulkToggleVisibility(): Promise<void> {
    if (selectedIds.value.length === 0) return;

    bulkOperating.value = true;
    try {
      const response = await http.patch('/api/users/me/tracks/visibility', {
        track_ids: selectedIds.value,
      });
      if (response.ok) {
        const data: { is_public: boolean } = await response.json();
        tracks.value.forEach((track) => {
          if (selectedIds.value.includes(track.id)) {
            track.is_public = data.is_public;
          }
        });
        selectedIds.value = [];
      }
    } catch (error) {
      console.error('Failed to bulk toggle visibility:', error);
    } finally {
      bulkOperating.value = false;
    }
  }

  async function bulkDelete(): Promise<void> {
    if (selectedIds.value.length === 0) return;

    const confirmed = await confirm({
      title: 'Delete Tracks',
      message: `Are you sure you want to delete ${selectedIds.value.length} track(s)? This action cannot be undone.`,
      confirmText: 'Delete',
    });

    if (!confirmed) return;

    bulkOperating.value = true;
    try {
      const response = await http.delete('/api/users/me/tracks', {
        body: JSON.stringify({ track_ids: selectedIds.value }),
      });
      if (response.ok) {
        removeTracks(selectedIds.value);
        selectedIds.value = [];
      }
    } catch (error) {
      console.error('Failed to bulk delete tracks:', error);
    } finally {
      bulkOperating.value = false;
    }
  }

  return {
    bulkOperating,
    toggleSelectAll,
    toggleSelection,
    bulkToggleVisibility,
    bulkDelete,
  };
}
