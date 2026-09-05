import { ref, computed, type Ref } from 'vue';

interface TrackItem {
  name: string;
}

interface TrackSearchState {
  query: Ref<string>;
  filteredTracks: Ref<TrackItem[]>;
  clear: () => void;
}

export function useTrackSearch<T extends TrackItem>(tracks: Ref<T[]>): TrackSearchState {
  const query = ref('');

  const filteredTracks = computed(() => {
    if (!query.value.trim()) {
      return tracks.value;
    }

    const searchTerm = query.value.toLowerCase().trim();
    return tracks.value.filter((track) => track.name?.toLowerCase().includes(searchTerm));
  });

  function clear(): void {
    query.value = '';
  }

  return {
    query,
    filteredTracks,
    clear,
  };
}
