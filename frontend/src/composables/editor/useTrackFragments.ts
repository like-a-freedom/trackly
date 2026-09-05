import { ref, type Ref } from 'vue';
import type { FragmentSelection, Segment, LatLngTuple } from '@/types';

/**
 * Store interface for fragment operations.
 * Provides access to the segment array and fragment selection state.
 */
export interface FragmentStore {
    segments: Segment[];
    fragmentSelection: FragmentSelection;
}

export function useTrackFragments() {
    const fragmentSelection = ref<FragmentSelection>({
        segIndex: null,
        startIdx: null,
        endIdx: null,
    });

    function getFragmentRange(): { segIndex: number; startIdx: number; endIdx: number } | null {
        const { segIndex, startIdx, endIdx } = fragmentSelection.value;
        if (segIndex === null || startIdx === null || endIdx === null) return null;
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        return { segIndex, startIdx: lo, endIdx: hi };
    }

    function setFragmentPoint(store: FragmentStore, segIndex: number, pointIndex: number): boolean {
        const seg = store.segments[segIndex];
        if (!seg || pointIndex < 0 || pointIndex >= seg.points.length) return false;

        const current = store.fragmentSelection;
        if (current.segIndex !== segIndex || current.startIdx === null) {
            store.fragmentSelection = { segIndex, startIdx: pointIndex, endIdx: null };
            return true;
        }

        if (current.endIdx === null) {
            store.fragmentSelection = {
                segIndex,
                startIdx: current.startIdx,
                endIdx: pointIndex,
            };
            return true;
        }

        store.fragmentSelection = { segIndex, startIdx: pointIndex, endIdx: null };
        return true;
    }

    function clearFragmentSelection(): void {
        fragmentSelection.value = { segIndex: null, startIdx: null, endIdx: null };
    }

    function replaceRangeWithPoints(
        store: FragmentStore,
        segIndex: number,
        startIdx: number,
        endIdx: number,
        newPoints: LatLngTuple[],
    ): boolean {
        const seg = store.segments[segIndex];
        if (!seg) return false;

        const removeCount = endIdx - startIdx + 1;
        const before = seg.points.slice(0, startIdx);
        const after = seg.points.slice(endIdx + 1);

        seg.points = before.concat(newPoints, after);

        const keepWaypoints = seg.waypoints
            .filter((idx) => idx < startIdx || idx > endIdx)
            .map((idx) => (idx > endIdx ? idx - removeCount + newPoints.length : idx));

        const startWaypoint = startIdx;
        const endWaypoint = startIdx + newPoints.length - 1;
        seg.waypoints = [...new Set([...keepWaypoints, startWaypoint, endWaypoint])].sort(
            (a, b) => a - b,
        );
        return true;
    }

    function reverseFragment(
        store: FragmentStore,
        segIndex: number,
        startIdx: number,
        endIdx: number,
    ): boolean {
        const seg = store.segments[segIndex];
        if (!seg) return false;
        if (endIdx - startIdx < 1) return false;

        const fragment = seg.points.slice(startIdx, endIdx + 1).reverse();
        seg.points.splice(startIdx, fragment.length, ...fragment);
        if (seg.surfaceTypes) {
            const surfaceFragment = seg.surfaceTypes.slice(startIdx, endIdx + 1).reverse();
            seg.surfaceTypes.splice(startIdx, surfaceFragment.length, ...surfaceFragment);
        }

        seg.waypoints = seg.waypoints.map((idx) => {
            if (idx < startIdx || idx > endIdx) return idx;
            return startIdx + (endIdx - idx);
        });
        seg.waypoints.sort((a, b) => a - b);

        return true;
    }

    function deleteFragmentConnect(
        store: FragmentStore,
        segIndex: number,
        startIdx: number,
        endIdx: number,
    ): boolean {
        const seg = store.segments[segIndex];
        if (!seg) return false;
        if (endIdx - startIdx < 2) return false;
        const ok = shortcutBetweenPoints(store, segIndex, startIdx, endIdx);
        if (ok) {
            clearFragmentSelection();
        }
        return ok;
    }

    function deleteFragmentSplit(
        store: FragmentStore,
        segIndex: number,
        startIdx: number,
        endIdx: number,
    ): boolean {
        const seg = store.segments[segIndex];
        if (!seg) return false;
        if (endIdx - startIdx < 2) return false;

        const firstPoints = seg.points.slice(0, startIdx + 1);
        const secondPoints = seg.points.slice(endIdx);
        const firstSurface = seg.surfaceTypes
            ? seg.surfaceTypes.slice(0, startIdx + 1)
            : [];
        const secondSurface = seg.surfaceTypes
            ? seg.surfaceTypes.slice(endIdx)
            : [];
        if (firstPoints.length < 2 || secondPoints.length < 2) return false;

        const firstWaypoints = seg.waypoints
            .filter((idx) => idx <= startIdx)
            .sort((a, b) => a - b);
        const secondWaypoints = seg.waypoints
            .filter((idx) => idx >= endIdx)
            .map((idx) => idx - endIdx)
            .sort((a, b) => a - b);

        store.segments[segIndex] = {
            points: firstPoints,
            waypoints: firstWaypoints,
            surfaceTypes: firstSurface,
            name: seg.name ?? null,
            color: seg.color || '#2196F3',
        };
        store.segments.splice(segIndex + 1, 0, {
            points: secondPoints,
            waypoints: secondWaypoints,
            surfaceTypes: secondSurface,
            name: null,
            color: '#2196F3',
        });

        return true;
    }

    function shortcutBetweenPoints(
        store: FragmentStore,
        segIndex: number,
        fromIdx: number,
        toIdx: number,
    ): boolean {
        const seg = store.segments[segIndex];
        if (!seg) return false;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        if (lo < 0 || hi >= seg.points.length || hi - lo < 2) return false;

        // Keep only start and end points, remove everything in between
        seg.points.splice(lo + 1, hi - lo - 1);
        if (seg.surfaceTypes) {
            seg.surfaceTypes.splice(lo + 1, hi - lo - 1);
        }

        // Rebuild waypoints
        seg.waypoints = seg.waypoints
            .filter((i) => i <= lo || i >= hi)
            .map((i) => (i > lo ? i - (hi - lo - 1) : i));
        // Ensure lo and lo+1 are waypoints
        if (!seg.waypoints.includes(lo)) seg.waypoints.push(lo);
        if (!seg.waypoints.includes(lo + 1)) seg.waypoints.push(lo + 1);
        seg.waypoints.sort((a, b) => a - b);

        return true;
    }

    return {
        fragmentSelection,
        getFragmentRange,
        setFragmentPoint,
        clearFragmentSelection,
        replaceRangeWithPoints,
        reverseFragment,
        deleteFragmentConnect,
        deleteFragmentSplit,
        shortcutBetweenPoints,
    };
}
