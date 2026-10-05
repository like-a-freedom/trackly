import { ref, onBeforeUnmount, type Ref } from 'vue';
import type { LatLngTuple } from '@/types';

const DRAFT_KEY = 'trackly_draft';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface DraftState {
    track: {
        segments: Array<{
            points: LatLngTuple[];
            waypoints?: number[];
            surfaceTypes?: string[];
            name?: string | null;
            color?: string;
        }>;
        name: string;
        description: string;
        categories: string[];
        pois?: Array<{ lat: number; lng: number; name: string; category?: string }>;
    };
    editingState: {
        mode: string;
        activeSegmentIndex: number;
        activeSegment?: number;
        routingMode?: string;
        routingProfile?: string;
        snapToRoadMode?: string;
        createRequestId?: string;
        contentDirty?: boolean;
        viewport?: {lat: number; lng: number; zoom: number};
    };
}

interface DraftData extends DraftState {
    version: number;
    timestamp: string;
    writerId?: string;
    origin?: { kind: 'new' | 'edit'; trackId?: string };
}

interface UseDraftSaveOptions {
    debounceMs?: number;
    trackId?: string | null;
}

/**
 * Draft save/restore composable.
 * Auto-saves editor state to localStorage with debounce.
 * Handles beforeunload warning and draft recovery.
 */
export function useDraftSave({ debounceMs = 500, trackId = null }: UseDraftSaveOptions = {}) {
    const draftKey = trackId ? `${DRAFT_KEY}:${trackId}` : DRAFT_KEY;
    const storageError = ref<string | null>(null);
    const conflict = ref(false);
    const writerId = crypto.randomUUID();
    let pendingState: DraftState | null = null;
    const hasDraft: Ref<boolean> = ref(false);
    const isDirty: Ref<boolean> = ref(false);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Check if a draft exists in localStorage and is not expired (30 days TTL). */
    function checkDraft(): boolean {
        try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
                const parsed = JSON.parse(raw) as DraftData;
                if (parsed?.version !== DRAFT_VERSION || !parsed?.track) {
                    hasDraft.value = false;
                    return false;
                }
                // Check 30-day TTL
                if (parsed.timestamp) {
                    const age = Date.now() - new Date(parsed.timestamp).getTime();
                    if (age > DRAFT_MAX_AGE_MS) {
                        deleteDraft();
                        return false;
                    }
                }
                hasDraft.value = true;
                return true;
            }
        } catch {
            // Corrupted data — ignore
        }
        hasDraft.value = false;
        return false;
    }

    /** Load draft from localStorage. Returns parsed draft object or null. Enforces 30-day TTL. */
    function loadDraft(): DraftData | null {
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as DraftData;
            if (parsed?.version !== DRAFT_VERSION || !parsed.track || !parsed.editingState) return null;
            if (typeof parsed.track.name !== 'string') return null;
            if (parsed.track.categories && (!Array.isArray(parsed.track.categories) || parsed.track.categories.some(c => typeof c !== 'string'))) return null;
            if (parsed.track.segments) {
                if (!Array.isArray(parsed.track.segments) || parsed.track.segments.length > 1000) return null;
                let count = 0;
                for (const segment of parsed.track.segments) {
                    if (!Array.isArray(segment.points)) return null;
                    count += segment.points.length;
                    if (count > 100000 || segment.points.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) return null;
                    if (segment.waypoints && (!Array.isArray(segment.waypoints) || segment.waypoints.some(i => !Number.isInteger(i) || i < 0 || i >= segment.points.length))) return null;
                }
            }
            if (parsed.track.pois && (!Array.isArray(parsed.track.pois) || parsed.track.pois.length > 1000 || parsed.track.pois.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || typeof p.name !== 'string'))) return null;
            if (parsed.origin && (trackId ? parsed.origin.kind !== 'edit' || parsed.origin.trackId !== trackId : parsed.origin.kind !== 'new')) return null;
            // Check 30-day TTL
            if (parsed.timestamp) {
                const age = Date.now() - new Date(parsed.timestamp).getTime();
                if (!Number.isFinite(age) || age < -300000) return null;
                if (age > DRAFT_MAX_AGE_MS) {
                    deleteDraft();
                    return null;
                }
            }
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * Save current editor state as draft.
     */
    function saveDraft(state: DraftState): void {
        if (conflict.value) return;
        try {
            const draft: DraftData = {
                version: DRAFT_VERSION,
                writerId,
                timestamp: new Date().toISOString(),
                track: state.track,
                editingState: state.editingState,
            };
            localStorage.setItem(draftKey, JSON.stringify({ ...draft, origin: trackId ? { kind: 'edit', trackId } : { kind: 'new' } }));
            storageError.value = null;
            hasDraft.value = true;
        } catch (e: unknown) {
            // localStorage full — try to clean old data
            console.warn('Failed to save draft:', e instanceof Error ? e.message : String(e));
            storageError.value = 'Your work is not backed up on this device. Keep this page open and save the track.';
        }
    }

    /** Remove draft from localStorage. */
    function deleteDraft(): void {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
        pendingState = null;
        try {
            localStorage.removeItem(draftKey);
        } catch {
            // ignore
        }
        hasDraft.value = false;
        isDirty.value = false;
    }

    /**
     * Schedule a debounced draft save.
     */
    function debouncedSave(state: DraftState, dirty = true): void {
        if (dirty) isDirty.value = true;
        pendingState = JSON.parse(JSON.stringify(state));
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            flush();
        }, debounceMs);
    }

    function flush(): void {
        if (conflict.value) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
        if (pendingState) {
            const state = pendingState;
            pendingState = null;
            saveDraft(state);
        }
    }

    function handleStorage(event: StorageEvent): void {
        if (event.key !== draftKey) return;
        try {
            const incoming = event.newValue ? JSON.parse(event.newValue) as DraftData : null;
            if (!incoming || incoming.writerId !== writerId) conflict.value = true;
        } catch { conflict.value = true; }
    }

    function resumeWrites(): void {
        conflict.value = false;
        flush();
    }

    function acceptIncoming(): void {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
        pendingState = null;
        conflict.value = false;
    }

    /** beforeunload handler — warns user of unsaved changes. */
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
        flush();
        if (isDirty.value) {
            e.preventDefault();
            // Modern browsers ignore custom message, but returning a string is still required
            e.returnValue = '';
        }
    }

    /** Install beforeunload listener. */
    function install(): void {
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', flush);
        window.addEventListener('storage', handleStorage);
    }

    /** Uninstall beforeunload listener and clear timer. */
    function uninstall(): void {
        flush();
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('storage', handleStorage);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    }

    /** Mark state as clean (after successful server save). */
    function markClean(): void {
        isDirty.value = false;
    }

    // Auto-cleanup on component unmount
    onBeforeUnmount(() => {
        uninstall();
    });

    // Check for existing draft on init
    checkDraft();

    return {
        hasDraft,
        conflict,
        resumeWrites,
        acceptIncoming,
        storageError,
        flush,
        isDirty,
        checkDraft,
        loadDraft,
        saveDraft,
        deleteDraft,
        debouncedSave,
        markClean,
        install,
        uninstall,
    };
}
