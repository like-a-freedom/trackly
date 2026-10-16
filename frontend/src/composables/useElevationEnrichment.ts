import { nextTick, ref } from "vue";
import type { Ref } from "vue";
import { clearCacheByPattern } from "./useMemoization";
import { events } from "../events";
import { http } from "../http-instance";

const POLLING_MAX_ATTEMPTS = 15;
const POLLING_BASE_INTERVAL_MS = 3000;
const POLLING_MAX_INTERVAL_MS = 30000;

/** The subset of a track payload the enrichment flow reads and writes. */
export interface EnrichableTrack {
    id: string;
    elevation_enriched?: boolean;
    elevation_gain?: number | null;
    elevation_loss?: number | null;
    elevation_min?: number | null;
    elevation_max?: number | null;
    elevation_dataset?: string | null;
    elevation_enriched_at?: string | null;
    elevation_profile?: unknown;
    slope_min?: number | null;
    slope_max?: number | null;
    slope_segments?: unknown[] | null;
}

export interface ElevationEnrichmentOptions {
    /** Live track object the composable merges refreshed elevation/slope data into. */
    track: Ref<EnrichableTrack | null>;
    /** Bumped on every change so memoized chart computes recompute. */
    chartUpdateKey: Ref<number>;
    /** Does the current track already carry elevation data? Drives the confirm dialog. */
    hasElevationData: () => boolean;
    /** Session id sent with enrichment requests. */
    sessionId: () => string;
    showConfirm: (options: {
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
    }) => Promise<boolean>;
    showToast: (message: string, type: string) => void;
}

/**
 * Elevation enrichment for a track: the manual "force update" action plus the
 * background poller that watches for the backend to finish computing.
 *
 * The poller uses a recursive `setTimeout` with exponential backoff rather than
 * `setInterval`, so a slow backend cannot pile up overlapping requests.
 *
 * Extracted from `TrackDetailPanel.vue` (ADR 0033).
 */
export function useElevationEnrichment(options: ElevationEnrichmentOptions) {
    const { track, chartUpdateKey, hasElevationData, sessionId, showConfirm, showToast } =
        options;

    const enrichingElevation = ref(false);
    const enrichmentPollingInterval = ref<ReturnType<typeof setTimeout> | null>(null);
    const isPollingForElevation = ref(false);
    const currentPollingTrackId = ref<string | undefined>(undefined);
    const pollingAttempts = ref(0);

    /**
     * Merge freshly fetched elevation/slope data into the current track, bust the
     * chart caches and notify listeners.
     *
     * Shared by the enrichment poller (`pollForElevationData`) and the manual
     * "enrich elevation" action so the merge shape and the
     * `track-elevation-updated` payload stay identical for both entry points.
     *
     * @param trackId - id of the track that was refetched; also used to key the
     *   per-track cache entries.
     * @param updatedTrack - full track payload returned by the detail endpoint.
     */
    async function applyElevationUpdate(
        trackId: string,
        updatedTrack: EnrichableTrack
    ): Promise<void> {
        // Force cache invalidation before updating track data
        clearCacheByPattern(`elevation_${trackId}`);
        clearCacheByPattern(`chartdata_`);
        chartUpdateKey.value = Date.now();

        // Update local track data - create new object to trigger reactivity
        track.value = {
            ...track.value,
            elevation_enriched: updatedTrack.elevation_enriched,
            elevation_gain: updatedTrack.elevation_gain,
            elevation_loss: updatedTrack.elevation_loss,
            elevation_min: updatedTrack.elevation_min,
            elevation_max: updatedTrack.elevation_max,
            elevation_dataset: updatedTrack.elevation_dataset,
            elevation_enriched_at: updatedTrack.elevation_enriched_at,
            elevation_profile: updatedTrack.elevation_profile,
            slope_min: updatedTrack.slope_min,
            slope_max: updatedTrack.slope_max,
            slope_segments: updatedTrack.slope_segments,
            // Add timestamp to force chart update
            _lastUpdated: Date.now(),
        } as EnrichableTrack;

        // Dispatch global event for other components
        events.emit("track-elevation-updated", {
            trackId,
            elevation_gain: updatedTrack.elevation_gain,
            elevation_loss: updatedTrack.elevation_loss,
            elevation_min: updatedTrack.elevation_min,
            elevation_max: updatedTrack.elevation_max,
            elevation_dataset: updatedTrack.elevation_dataset,
            elevation_profile: updatedTrack.elevation_profile,
            elevation_enriched_at: updatedTrack.elevation_enriched_at,
            slope_min: updatedTrack.slope_min,
            slope_max: updatedTrack.slope_max,
            slope_segments: updatedTrack.slope_segments,
        });

        // Force reactivity with nextTick
        await nextTick();
    }

    function stopElevationPolling(): void {
        if (enrichmentPollingInterval.value) {
            console.info(`[TrackDetailPanel] Stopping elevation polling`);
            clearTimeout(enrichmentPollingInterval.value);
            enrichmentPollingInterval.value = null;
        }
        currentPollingTrackId.value = undefined; // Clear the track ID we were polling for
        isPollingForElevation.value = false;
        pollingAttempts.value = 0;
    }

    /**
     * Poll the detail endpoint until elevation data appears.
     *
     * Never re-throws: callers rely on the poller continuing (with backoff) after
     * a transient failure.
     */
    async function pollForElevationData(trackId?: string): Promise<void> {
        try {
            // Resolve the effective trackId for this poll call. Accept explicit trackId,
            // fallback to currentPollingTrackId (set when polling started), then the
            // current track. This prevents callers from accidentally stopping the poll
            // when they invoke pollForElevationData() without providing an argument.
            const effectiveTrackId =
                trackId || currentPollingTrackId.value || track.value?.id;

            // If we have an active polling track recorded and it doesn't match the
            // effectiveTrackId, then the poll is stale and should be stopped.
            if (
                currentPollingTrackId.value &&
                currentPollingTrackId.value !== effectiveTrackId
            ) {
                console.log(
                    `[TrackDetailPanel] Stopping poll for ${effectiveTrackId} - current polling is for ${currentPollingTrackId.value}`
                );
                stopElevationPolling();
                return;
            }

            // Don't fetch if we're not actually polling (safety check)
            if (!isPollingForElevation.value) {
                console.log(`[TrackDetailPanel] Polling flag is false, stopping`);
                return;
            }

            // background=1: this is a poll for enrichment progress, not a track view.
            const response = await http(`/api/tracks/${effectiveTrackId}?background=1`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const updatedTrack = (await response.json()) as EnrichableTrack;
            const current = track.value;

            // Check if elevation data has been updated
            const hasNewElevationData =
                (updatedTrack.elevation_enriched && !current?.elevation_enriched) ||
                updatedTrack.elevation_gain !== current?.elevation_gain ||
                updatedTrack.elevation_loss !== current?.elevation_loss ||
                updatedTrack.elevation_min !== current?.elevation_min ||
                updatedTrack.elevation_max !== current?.elevation_max ||
                updatedTrack.slope_min !== current?.slope_min ||
                updatedTrack.slope_max !== current?.slope_max ||
                updatedTrack.slope_segments?.length !==
                    current?.slope_segments?.length;

            if (hasNewElevationData) {
                console.info(
                    `[TrackDetailPanel] Elevation data updated for track ${
                        trackId || track.value?.id
                    }`
                );

                // Merge the refreshed elevation/slope data, bust caches and notify
                await applyElevationUpdate(effectiveTrackId as string, updatedTrack);

                // Stop polling
                stopElevationPolling();

                // Show success message
                showToast("Elevation data has been successfully updated!", "success");
            }
        } catch (error) {
            console.error(
                `[TrackDetailPanel] Error polling elevation data: ${
                    (error as Error).message
                }`
            );
            // Do NOT re-throw here so that callers won't accidentally stop polling.
            // We want polling to continue (scheduleNext will handle retries/backoff)
            return;
        }
    }

    function startElevationPolling(trackId?: string): void {
        if (isPollingForElevation.value) return;

        isPollingForElevation.value = true;
        currentPollingTrackId.value = trackId; // Remember which track we're polling for
        pollingAttempts.value = 0;
        console.info(
            `[TrackDetailPanel] Starting elevation polling for track ${trackId}`
        );

        // Use recursive timeout with exponential backoff instead of setInterval
        const scheduleNext = async (): Promise<void> => {
            if (!isPollingForElevation.value) return;
            pollingAttempts.value += 1;

            // If we've reached max attempts, stop polling
            if (pollingAttempts.value > POLLING_MAX_ATTEMPTS) {
                console.info(
                    `[TrackDetailPanel] Reached max polling attempts (${POLLING_MAX_ATTEMPTS}) for ${trackId}, stopping`
                );
                stopElevationPolling();
                return;
            }

            try {
                await pollForElevationData(trackId);
            } catch (err) {
                // If pollForElevationData ever throws (shouldn't), log but continue scheduling.
                console.error(
                    `[TrackDetailPanel] scheduleNext: poll failed: ${
                        (err as Error)?.message || err
                    }`
                );
            }

            // Compute interval with exponential backoff
            const interval = Math.min(
                POLLING_BASE_INTERVAL_MS * Math.pow(2, pollingAttempts.value - 1),
                POLLING_MAX_INTERVAL_MS
            );
            enrichmentPollingInterval.value = setTimeout(scheduleNext, interval);
        };

        // Kick off the first call after a short delay to allow UI to settle
        enrichmentPollingInterval.value = setTimeout(
            scheduleNext,
            POLLING_BASE_INTERVAL_MS
        );
    }

    /** Manually trigger backend enrichment and refresh the displayed track. */
    async function forceEnrichElevation(): Promise<void> {
        const current = track.value;
        if (!current?.id || enrichingElevation.value) return;

        // Show confirmation dialog if track already has elevation data
        if (hasElevationData()) {
            const confirmed = await showConfirm({
                title: "Update Elevation Data",
                message:
                    "This track already has elevation data. Updating will replace the existing data with new values from the external service. Continue?",
                confirmText: "Continue",
                cancelText: "Cancel",
            });
            if (!confirmed) return;
        }

        enrichingElevation.value = true;
        try {
            const response = await http(
                `/api/tracks/${current.id}/enrich-elevation`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        session_id: sessionId(),
                        force: true,
                    }),
                }
            );

            if (!response.ok) {
                if (response.status === 403) {
                    showToast("You are not allowed to update this track.", "error");
                    return;
                } else if (response.status === 429) {
                    showToast(
                        "API rate limit exceeded. Please try again later.",
                        "error"
                    );
                    return;
                } else {
                    throw new Error("Failed to update elevation data");
                }
            }

            const result = await response.json();

            // Update local track data with new elevation information
            const target = track.value;
            if (!target) return;
            if (result.elevation_gain !== undefined)
                target.elevation_gain = result.elevation_gain;
            if (result.elevation_loss !== undefined)
                target.elevation_loss = result.elevation_loss;
            if (result.elevation_min !== undefined)
                target.elevation_min = result.elevation_min;
            if (result.elevation_max !== undefined)
                target.elevation_max = result.elevation_max;
            if (result.elevation_dataset !== undefined)
                target.elevation_dataset = result.elevation_dataset;
            if (result.enriched_at !== undefined)
                target.elevation_enriched_at = result.enriched_at;
            target.elevation_enriched = true;

            // Fetch the complete updated track data to get elevation_profile and slope data
            console.info(
                `[TrackDetailPanel] Fetching updated track data after elevation enrichment`
            );
            let merged = false;
            try {
                // background=1: refresh after enrichment completes, not a new track view.
                const trackResponse = await http(
                    `/api/tracks/${target.id}?background=1`
                );
                if (trackResponse.ok) {
                    const updatedTrack = (await trackResponse.json()) as EnrichableTrack;

                    // Merge the refreshed elevation/slope data, bust caches and notify
                    // listeners. `applyElevationUpdate` emits `track-elevation-updated`
                    // itself, so the fallback below must not fire on this path.
                    await applyElevationUpdate(target.id, updatedTrack);
                    merged = true;

                    console.info(`[TrackDetailPanel] Track data updated successfully`);
                }
            } catch (fetchError) {
                console.error(
                    `[TrackDetailPanel] Failed to fetch updated track data:`,
                    fetchError
                );
                // Don't start polling - just show a message
                showToast(
                    "Elevation data was enriched, but failed to refresh the display. Please refresh the page to see the updated data.",
                    "error"
                );
            }

            if (!merged) {
                // The full refresh failed: still notify listeners with the scalar values
                // the enrichment call returned, so other views do not go stale.
                events.emit("track-elevation-updated", {
                    trackId: target.id,
                    elevation_gain: target.elevation_gain,
                    elevation_loss: target.elevation_loss,
                    elevation_min: target.elevation_min,
                    elevation_max: target.elevation_max,
                    elevation_dataset: target.elevation_dataset,
                    elevation_profile: target.elevation_profile,
                    elevation_enriched_at: target.elevation_enriched_at,
                });
            }

            showToast("Elevation data updated successfully!", "success");
        } catch (error) {
            console.error("Elevation enrichment failed:", error);
            showToast("Failed to update elevation data. Please try again.", "error");
        } finally {
            enrichingElevation.value = false;
        }
    }

    return {
        enrichingElevation,
        enrichmentPollingInterval,
        isPollingForElevation,
        currentPollingTrackId,
        pollingAttempts,
        applyElevationUpdate,
        startElevationPolling,
        stopElevationPolling,
        pollForElevationData,
        forceEnrichElevation,
    };
}
