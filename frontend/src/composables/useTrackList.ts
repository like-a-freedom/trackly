import { ref, type Ref } from 'vue';
import { http } from '../http-instance';

export interface TrackItem {
  id: string;
  name: string;
  length_km: number;
  elevation_up: number;
  created_at: string;
  is_public: boolean;
  category: string | null;
}

interface TrackListResponse {
  tracks: TrackItem[];
  total: number;
}

interface UseTrackListOptions {
  limit?: number;
}

interface TrackListState {
  tracks: Ref<TrackItem[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  hasMore: Ref<boolean>;
  offset: Ref<number>;
  loadTracks: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  toggleVisibility: (trackId: string, isPublic: boolean) => Promise<void>;
  removeTracks: (trackIds: string[]) => void;
}

export function useTrackList(options: UseTrackListOptions = {}): TrackListState {
  const limit = options.limit ?? 20;

  const tracks = ref<TrackItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(false);
  const offset = ref(0);

  async function fetchTracks(currentOffset: number): Promise<TrackListResponse> {
    const response = await http(`/api/users/me/tracks?offset=${currentOffset}&limit=${limit}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`Failed to load tracks: ${response.status}`);
    }
    return response.json();
  }

  async function loadTracks(reset = true): Promise<void> {
    if (loading.value) return;
    if (reset) {
      offset.value = 0;
      tracks.value = [];
    }

    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await fetchTracks(offset.value);
      tracks.value = data.tracks;
      hasMore.value = offset.value + data.tracks.length < data.total;
    } catch (error) {
      console.error('Failed to load tracks:', error);
      loadError('Could not load your tracks. Please retry.');
      tracks.value = [];
      hasMore.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value) return;
    offset.value += limit;
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await fetchTracks(offset.value);
      tracks.value = [...tracks.value, ...data.tracks];
      hasMore.value = offset.value + data.tracks.length < data.total;
    } catch (error) {
      console.error('Failed to load more tracks:', error);
      loadError('Could not load more tracks. Please retry.');
      offset.value -= limit;
    } finally {
      loading.value = false;
    }
  }

  async function toggleVisibility(trackId: string, isPublic: boolean): Promise<void> {
    try {
      const response = await http(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: isPublic }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.ok) {
        const track = tracks.value.find((t) => t.id === trackId);
        if (track) {
          track.is_public = isPublic;
        }
      }
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
      loadError('Could not change visibility. Please retry.');
    }
  }

  const loadError = (message: string) => { error.value = message; };

  function removeTracks(trackIds: string[]): void {
    const idSet = new Set(trackIds);
    tracks.value = tracks.value.filter((t) => !idSet.has(t.id));
  }

  return {
    tracks,
    loading,
    error,
    hasMore,
    offset,
    loadTracks,
    loadMore,
    toggleVisibility,
    removeTracks,
  };
}
