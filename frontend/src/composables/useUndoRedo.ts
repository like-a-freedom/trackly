import { ref, computed, type Ref, type ComputedRef } from 'vue';

interface UndoRedoApi<T> {
    canUndo: ComputedRef<boolean>;
    canRedo: ComputedRef<boolean>;
    pushState: (state: T) => void;
    undo: (currentState: T) => T | null;
    redo: (currentState: T) => T | null;
    clear: () => void;
}

/**
 * Undo/Redo composable with configurable stack size.
 * Manages state snapshots for track editor operations.
 *
 * @param maxSize - Maximum stack depth (default 50, FIFO eviction)
 * @returns Undo/redo API
 */
export function useUndoRedo<T = unknown>(maxSize: number = 50): UndoRedoApi<T> {
    const undoStack: Ref<T[]> = ref([]);
    const redoStack: Ref<T[]> = ref([]);

    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    /**
     * Take a deep-clone snapshot of the given state and push to undo stack.
     * Clears redo stack (any new action invalidates redo history).
     */
    function pushState(state: T): void {
        const snapshot = JSON.parse(JSON.stringify(state)) as T;
        undoStack.value.push(snapshot);
        if (undoStack.value.length > maxSize) {
            undoStack.value.shift(); // FIFO eviction
        }
        redoStack.value = [];
    }

    /**
     * Pop the most recent undo snapshot and push current state to redo stack.
     * @returns Previous state or null if stack is empty
     */
    function undo(currentState: T): T | null {
        if (!canUndo.value) return null;
        const snapshot = undoStack.value.pop()!;
        redoStack.value.push(JSON.parse(JSON.stringify(currentState)) as T);
        if (redoStack.value.length > maxSize) {
            redoStack.value.shift();
        }
        return snapshot;
    }

    /**
     * Pop the most recent redo snapshot and push current state to undo stack.
     * @returns Next state or null if stack is empty
     */
    function redo(currentState: T): T | null {
        if (!canRedo.value) return null;
        const snapshot = redoStack.value.pop()!;
        undoStack.value.push(JSON.parse(JSON.stringify(currentState)) as T);
        if (undoStack.value.length > maxSize) {
            undoStack.value.shift();
        }
        return snapshot;
    }

    /** Clear both stacks. */
    function clear(): void {
        undoStack.value = [];
        redoStack.value = [];
    }

    return { canUndo, canRedo, pushState, undo, redo, clear };
}
