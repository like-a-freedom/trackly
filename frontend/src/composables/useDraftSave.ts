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
    };
}

interface DraftData extends DraftState {
    version: number;
    timestamp: string;
}

interface UseDraftSaveOptions {
    debounceMs?: number;
}

/**
 * Draft save/restore composable.
 * Auto-saves editor state to localStorage with debounce.
 * Handles beforeunload warning and draft recovery.
 */
export function useDraftSave({ debounceMs = 500 }: UseDraftSaveOptions = {}) {
    const hasDraft: Ref<boolean> = ref(false);
    const isDirty: Ref<boolean> = ref(false);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Check if a draft exists in localStorage and is not expired (30 days TTL). */
    function checkDraft(): boolean {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
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
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as DraftData;
            if (parsed?.version !== DRAFT_VERSION) return null;
            // Check 30-day TTL
            if (parsed.timestamp) {
                const age = Date.now() - new Date(parsed.timestamp).getTime();
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
        try {
            const draft: DraftData = {
                version: DRAFT_VERSION,
                timestamp: new Date().toISOString(),
                track: state.track,
                editingState: state.editingState,
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            hasDraft.value = true;
        } catch (e: unknown) {
            // localStorage full — try to clean old data
            console.warn('Failed to save draft:', e instanceof Error ? e.message : String(e));
        }
    }

    /** Remove draft from localStorage. */
    function deleteDraft(): void {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch {
            // ignore
        }
        hasDraft.value = false;
        isDirty.value = false;
    }

    /**
     * Schedule a debounced draft save.
     */
    function debouncedSave(state: DraftState): void {
        isDirty.value = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            saveDraft(state);
        }, debounceMs);
    }

    /** beforeunload handler — warns user of unsaved changes. */
    function handleBeforeUnload(e: BeforeUnloadEvent): void {
        if (isDirty.value) {
            e.preventDefault();
            // Modern browsers ignore custom message, but returning a string is still required
            e.returnValue = '';
        }
    }

    /** Install beforeunload listener. */
    function install(): void {
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    /** Uninstall beforeunload listener and clear timer. */
    function uninstall(): void {
        window.removeEventListener('beforeunload', handleBeforeUnload);
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
