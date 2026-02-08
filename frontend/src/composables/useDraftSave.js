import { ref, watch, onBeforeUnmount } from 'vue';

const DRAFT_KEY = 'trackly_draft';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Draft save/restore composable.
 * Auto-saves editor state to localStorage with debounce.
 * Handles beforeunload warning and draft recovery.
 *
 * @param {Object} options
 * @param {number} options.debounceMs - Debounce interval (default 500)
 * @returns {Object} Draft save API
 */
export function useDraftSave({ debounceMs = 500 } = {}) {
    const hasDraft = ref(false);
    const isDirty = ref(false);
    let debounceTimer = null;

    /** Check if a draft exists in localStorage and is not expired (30 days TTL). */
    function checkDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
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
    function loadDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
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
     * @param {Object} state - { track, editingState }
     */
    function saveDraft(state) {
        try {
            const draft = {
                version: DRAFT_VERSION,
                timestamp: new Date().toISOString(),
                track: state.track,
                editingState: state.editingState,
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            hasDraft.value = true;
        } catch (e) {
            // localStorage full — try to clean old data
            console.warn('Failed to save draft:', e.message);
        }
    }

    /** Remove draft from localStorage. */
    function deleteDraft() {
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
     * @param {Object} state - Current editor state
     */
    function debouncedSave(state) {
        isDirty.value = true;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            saveDraft(state);
        }, debounceMs);
    }

    /** beforeunload handler — warns user of unsaved changes. */
    function handleBeforeUnload(e) {
        if (isDirty.value) {
            e.preventDefault();
            // Modern browsers ignore custom message, but returning a string is still required
            e.returnValue = '';
        }
    }

    /** Install beforeunload listener. */
    function install() {
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    /** Uninstall beforeunload listener and clear timer. */
    function uninstall() {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    }

    /** Mark state as clean (after successful server save). */
    function markClean() {
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
