import { ref, computed } from 'vue';

/**
 * Undo/Redo composable with configurable stack size.
 * Manages state snapshots for track editor operations.
 *
 * @param {number} maxSize - Maximum stack depth (default 50, FIFO eviction)
 * @returns {Object} Undo/redo API
 */
export function useUndoRedo(maxSize = 50) {
    const undoStack = ref([]);
    const redoStack = ref([]);

    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    /**
     * Take a deep-clone snapshot of the given state and push to undo stack.
     * Clears redo stack (any new action invalidates redo history).
     * @param {Object} state - State object to snapshot
     */
    function pushState(state) {
        const snapshot = JSON.parse(JSON.stringify(state));
        undoStack.value.push(snapshot);
        if (undoStack.value.length > maxSize) {
            undoStack.value.shift(); // FIFO eviction
        }
        redoStack.value = [];
    }

    /**
     * Pop the most recent undo snapshot and push current state to redo stack.
     * @param {Object} currentState - Current state (will be pushed to redo)
     * @returns {Object|null} Previous state or null if stack is empty
     */
    function undo(currentState) {
        if (!canUndo.value) return null;
        const snapshot = undoStack.value.pop();
        redoStack.value.push(JSON.parse(JSON.stringify(currentState)));
        if (redoStack.value.length > maxSize) {
            redoStack.value.shift();
        }
        return snapshot;
    }

    /**
     * Pop the most recent redo snapshot and push current state to undo stack.
     * @param {Object} currentState - Current state (will be pushed to undo)
     * @returns {Object|null} Next state or null if stack is empty
     */
    function redo(currentState) {
        if (!canRedo.value) return null;
        const snapshot = redoStack.value.pop();
        undoStack.value.push(JSON.parse(JSON.stringify(currentState)));
        if (undoStack.value.length > maxSize) {
            undoStack.value.shift();
        }
        return snapshot;
    }

    /** Clear both stacks. */
    function clear() {
        undoStack.value = [];
        redoStack.value = [];
    }

    return { canUndo, canRedo, pushState, undo, redo, clear };
}
