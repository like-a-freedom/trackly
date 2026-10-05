import { ref, computed, type Ref } from 'vue';
import { http } from '../http-instance';

interface TrackItem {
  id: string;
  is_public: boolean;
}

interface UseBulkOperationsOptions {
  tracks: Ref<TrackItem[]>;
  visibleTracks?: Ref<TrackItem[]>;
  selectedIds: Ref<string[]>;
  allVisibleSelected: Ref<boolean>;
  someSelected: Ref<boolean>;
  removeTracks: (ids: string[]) => void;
  confirm: (options: { title: string; message: string; confirmText: string }) => Promise<boolean>;
}

interface BulkOperationsState {
  bulkOperating: Ref<boolean>;
  error: Ref<string | null>;
  toggleSelectAll: () => void;
  toggleSelection: (trackId: string) => void;
  bulkToggleVisibility: () => Promise<void>;
  bulkDelete: () => Promise<void>;
}

export function useBulkTrackOperations(options: UseBulkOperationsOptions): BulkOperationsState {
  const { tracks, selectedIds, allVisibleSelected, someSelected, removeTracks, confirm } = options;

  const bulkOperating = ref(false);
  const error = ref<string | null>(null);

  function toggleSelectAll(): void {
    if (allVisibleSelected.value || someSelected.value) {
      selectedIds.value = [];
    } else {
      selectedIds.value = (options.visibleTracks ?? tracks).value.map((t) => t.id);
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
    if (selectedIds.value.length === 0 || bulkOperating.value) return;
    const operationIds = [...selectedIds.value];

    bulkOperating.value = true;
    error.value = null;
    try {
      const response = await http('/api/account/tracks/bulk/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids: operationIds }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.ok) {
        const data: { updated: TrackItem[] } = await response.json();
        const updated = new Map(data.updated.map(track => [track.id, track.is_public]));
        tracks.value.forEach(track => {
          if (updated.has(track.id)) track.is_public = updated.get(track.id)!;
        });
        selectedIds.value = selectedIds.value.filter(id => !updated.has(id));
        if (operationIds.some(id => !updated.has(id))) error.value = 'Some tracks could not be changed. Their selection is retained; please retry.';
      }
    } catch (cause) {
      error.value = 'Could not complete this action. Your selection is retained; please retry.';
      console.error('Failed to bulk toggle visibility:', cause);
    } finally {
      bulkOperating.value = false;
    }
  }

  async function bulkDelete(): Promise<void> {
    if (selectedIds.value.length === 0 || bulkOperating.value) return;
    const operationIds = [...selectedIds.value];

    bulkOperating.value = true;
    error.value = null;
    try {
    const confirmed = await confirm({
      title: 'Delete Tracks',
      message: `Are you sure you want to delete ${operationIds.length} track(s)? This action cannot be undone.`,
      confirmText: 'Delete',
    });

    if (!confirmed) return;
      const response = await http('/api/account/tracks/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids: operationIds }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.ok) {
        const data: { deleted: string[] } = await response.json();
        const deleted = new Set(data.deleted);
        removeTracks(data.deleted);
        selectedIds.value = selectedIds.value.filter(id => !deleted.has(id));
        if (operationIds.some(id => !deleted.has(id))) error.value = 'Some tracks could not be deleted. Their selection is retained; please retry.';
      }
    } catch (cause) {
      error.value = 'Could not complete this action. Your selection is retained; please retry.';
      console.error('Failed to bulk delete tracks:', cause);
    } finally {
      bulkOperating.value = false;
    }
  }

  return {
    bulkOperating,
    error,
    toggleSelectAll,
    toggleSelection,
    bulkToggleVisibility,
    bulkDelete,
  };
}
