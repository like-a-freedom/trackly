import { ref, type Ref } from 'vue';
import { http } from '../http-instance';

interface ElevationPollingState {
  isPolling: Ref<boolean>;
  pollCount: Ref<number>;
  startPolling: (trackId: string, targetCount: number, onComplete: () => void) => void;
  stopPolling: () => void;
}

const INITIAL_INTERVAL = 1000;
const MAX_INTERVAL = 8000;
const MAX_POLLS = 12;

export function useElevationPolling(): ElevationPollingState {
  const isPolling = ref(false);
  const pollCount = ref(0);

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTrackId: string | null = null;
  let targetPointCount = 0;
  let onPollComplete: (() => void) | null = null;

  function clearTimer(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function calculateInterval(): number {
    return Math.min(INITIAL_INTERVAL * Math.pow(1.5, pollCount.value), MAX_INTERVAL);
  }

  async function checkElevation(): Promise<void> {
    if (!currentTrackId) return;

    try {
      const response = await http(`/api/tracks/${currentTrackId}`, { method: 'GET' });
      if (!response.ok) return;

      const data = await response.json();
      const points = data?.geom_geojson?.coordinates?.[0] ?? [];

      if (points.length >= targetPointCount) {
        stopPolling();
        onPollComplete?.();
        return;
      }
    } catch {
      // Silently continue polling on error
    }

    pollCount.value++;
    if (pollCount.value >= MAX_POLLS) {
      stopPolling();
      return;
    }

    const interval = calculateInterval();
    pollTimer = setTimeout(checkElevation, interval);
  }

  function startPolling(
    trackId: string,
    targetCount: number,
    onComplete: () => void,
  ): void {
    stopPolling();

    currentTrackId = trackId;
    targetPointCount = targetCount;
    onPollComplete = onComplete;
    pollCount.value = 0;
    isPolling.value = true;

    pollTimer = setTimeout(checkElevation, INITIAL_INTERVAL);
  }

  function stopPolling(): void {
    clearTimer();
    isPolling.value = false;
    pollCount.value = 0;
    currentTrackId = null;
    onPollComplete = null;
  }

  return {
    isPolling,
    pollCount,
    startPolling,
    stopPolling,
  };
}
