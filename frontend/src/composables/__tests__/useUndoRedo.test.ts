// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach } from 'vitest';
import { useUndoRedo } from '../useUndoRedo';

describe('useUndoRedo', () => {
    let ur: ReturnType<typeof useUndoRedo>;

    beforeEach(() => {
        ur = useUndoRedo(5);
    });

    describe('initial state', () => {
        it('starts with empty stacks', () => {
            expect(ur.canUndo.value).toBe(false);
            expect(ur.canRedo.value).toBe(false);
        });
    });

    describe('pushState', () => {
        it('enables undo after push', () => {
            ur.pushState({ x: 1 });
            expect(ur.canUndo.value).toBe(true);
            expect(ur.canRedo.value).toBe(false);
        });

        it('deep-clones the state', () => {
            const obj = { nested: { val: 42 } };
            ur.pushState(obj);
            obj.nested.val = 99;

            const restored = ur.undo({ dummy: true });
            expect(restored.nested.val).toBe(42);
        });

        it('clears redo stack on push', () => {
            ur.pushState({ a: 1 });
            ur.pushState({ a: 2 });
            // undo to get redo state
            ur.undo({ a: 3 });
            expect(ur.canRedo.value).toBe(true);

            // new push clears redo
            ur.pushState({ a: 4 });
            expect(ur.canRedo.value).toBe(false);
        });

        it('evicts oldest entry when exceeding maxSize', () => {
            // maxSize = 5
            for (let i = 0; i < 7; i++) {
                ur.pushState({ i });
            }
            // Undo 5 times should work (maxSize kept to 5)
            let count = 0;
            while (ur.canUndo.value) {
                ur.undo({ current: true });
                count++;
            }
            expect(count).toBe(5);
        });
    });

    describe('undo', () => {
        it('returns null when stack is empty', () => {
            const result = ur.undo({ current: true });
            expect(result).toBeNull();
        });

        it('returns previous state and pushes current to redo', () => {
            ur.pushState({ step: 1 });
            ur.pushState({ step: 2 });

            const restored = ur.undo({ step: 3 });
            expect(restored).toEqual({ step: 2 });
            expect(ur.canRedo.value).toBe(true);
            expect(ur.canUndo.value).toBe(true);
        });

        it('can undo multiple times', () => {
            ur.pushState({ v: 'a' });
            ur.pushState({ v: 'b' });
            ur.pushState({ v: 'c' });

            const r1 = ur.undo({ v: 'current' });
            expect(r1.v).toBe('c');

            const r2 = ur.undo({ v: 'c' });
            expect(r2.v).toBe('b');

            const r3 = ur.undo({ v: 'b' });
            expect(r3.v).toBe('a');

            expect(ur.canUndo.value).toBe(false);
        });
    });

    describe('redo', () => {
        it('returns null when stack is empty', () => {
            const result = ur.redo({ current: true });
            expect(result).toBeNull();
        });

        it('restores undone state', () => {
            ur.pushState({ v: 1 });
            ur.pushState({ v: 2 });
            ur.undo({ v: 3 }); // undo top → redo gets {v:3}

            const restored = ur.redo({ v: 2 });
            expect(restored).toEqual({ v: 3 });
        });

        it('supports multiple undo then redo cycle', () => {
            ur.pushState({ v: 'a' });
            ur.pushState({ v: 'b' });

            ur.undo({ v: 'c' }); // stack: undo=[a], redo=[c]
            ur.undo({ v: 'b' }); // stack: undo=[], redo=[c, b]

            const r1 = ur.redo({ v: 'a' }); // redo pops b
            expect(r1.v).toBe('b');

            const r2 = ur.redo({ v: 'b' }); // redo pops c
            expect(r2.v).toBe('c');

            expect(ur.canRedo.value).toBe(false);
        });
    });

    describe('clear', () => {
        it('empties both stacks', () => {
            ur.pushState({ x: 1 });
            ur.pushState({ x: 2 });
            ur.undo({ x: 3 });

            ur.clear();
            expect(ur.canUndo.value).toBe(false);
            expect(ur.canRedo.value).toBe(false);
        });
    });

    describe('default maxSize', () => {
        it('defaults to 50', () => {
            const defaultUr = useUndoRedo();
            for (let i = 0; i < 55; i++) {
                defaultUr.pushState({ i });
            }
            let count = 0;
            while (defaultUr.canUndo.value) {
                defaultUr.undo({ current: true });
                count++;
            }
            expect(count).toBe(50);
        });
    });

    describe('stack eviction on undo/redo', () => {
        it('evicts oldest redo entry when redo stack exceeds maxSize', () => {
            const ur = useUndoRedo(2);
            // Push 3 states, undo all to fill redo stack
            ur.pushState({ v: 1 });
            ur.pushState({ v: 2 });
            ur.pushState({ v: 3 });

            // Undo 3 times to fill redo stack beyond maxSize
            ur.undo({ v: 'current1' });
            ur.undo({ v: 'current2' });
            ur.undo({ v: 'current3' });

            // Redo stack should have been evicted to maxSize
            let count = 0;
            while (ur.canRedo.value) {
                ur.redo({ v: 'x' });
                count++;
            }
            expect(count).toBe(2); // maxSize
        });

        it('evicts oldest undo entry when undo stack exceeds maxSize', () => {
            const ur = useUndoRedo(2);
            // Push 4 states (exceeds maxSize of 2)
            ur.pushState({ v: 1 });
            ur.pushState({ v: 2 });
            ur.pushState({ v: 3 });
            ur.pushState({ v: 4 });

            // Undo stack should have been evicted to maxSize
            let count = 0;
            while (ur.canUndo.value) {
                ur.undo({ v: 'x' });
                count++;
            }
            expect(count).toBe(2); // maxSize
        });
    });
});
