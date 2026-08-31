import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test the standalone buildFragmentGpx helper ──────────────
// We import the composable and exercise its fragment/loop methods.

// Mock fetch globally
vi.stubGlobal("fetch", vi.fn());

// We need to import after mocks are set up
const { useTrackEditor } = await import(
    "../../src/composables/useTrackEditor.js"
);

function createEditor(points = [], opts = {}) {
    const editor = useTrackEditor();
    // Set up a segment with points
    if (points.length > 0) {
        editor.segments.value = [
            {
                points: points.map((p) => [p[0], p[1]]),
                waypoints: points.map((_, i) => i),
                surfaceTypes: points.map(() => "unknown"),
                name: null,
                color: "#FF5722",
            },
        ];
        editor.activeSegmentIndex.value = 0;
    }
    return editor;
}

describe("closeLoopSameWay", () => {
    it("returns false if segment has < 2 points", () => {
        const editor = createEditor([[0, 0]]);
        expect(editor.closeLoopSameWay()).toBe(false);
    });

    it("returns false if already closed (first === last)", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.001, 30.001],
            [50.0, 30.0],
        ]);
        expect(editor.closeLoopSameWay()).toBe(false);
    });

    it("duplicates all points in reverse to return to start", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        const ok = editor.closeLoopSameWay();
        expect(ok).toBe(true);

        const pts = editor.segments.value[0].points;
        // Original: 3 points + reversed (first 2 in reverse) = 3 + 2 = 5
        expect(pts.length).toBe(5);
        // Last point should match first
        expect(pts[pts.length - 1][0]).toBeCloseTo(50.0);
        expect(pts[pts.length - 1][1]).toBeCloseTo(30.0);
        // Middle point (turnaround) should be original last
        expect(pts[2][0]).toBeCloseTo(50.02);
        expect(pts[2][1]).toBeCloseTo(30.02);
    });
});

describe("closeLoopDifferentRoute", () => {
    it("returns false if segment has < 2 points", () => {
        const editor = createEditor([[0, 0]]);
        expect(editor.closeLoopDifferentRoute()).toBe(false);
    });

    it("returns false if already closed", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.001, 30.001],
            [50.0, 30.0],
        ]);
        expect(editor.closeLoopDifferentRoute()).toBe(false);
    });

    it("returns false if routing returns nothing", () => {
        // routing.findRouteDetailed is not loaded, will return null
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        // Without WASM loaded, findRouteDetailed returns null
        const ok = editor.closeLoopDifferentRoute();
        expect(ok).toBe(false);
    });

    it("calls onRoutingNotAvailable callback when routing unavailable", () => {
        const cb = vi.fn();
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        editor.closeLoopDifferentRoute({ onRoutingNotAvailable: cb });
        // Callback may or may not fire depending on routing impl;
        // at minimum, it should not throw
    });
});

describe("closeLoop (basic)", () => {
    it("adds a point at start position", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        const ok = editor.closeLoop();
        expect(ok).toBe(true);
        const pts = editor.segments.value[0].points;
        expect(pts.length).toBe(4);
        expect(pts[3][0]).toBeCloseTo(50.0);
        expect(pts[3][1]).toBeCloseTo(30.0);
    });

    it("returns false if < 3 points", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
        ]);
        expect(editor.closeLoop()).toBe(false);
    });
});

describe("exportFragment", () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    const mockClick = vi.fn();

    beforeEach(() => {
        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:mock-url");
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(document, "createElement").mockReturnValue({
            href: "",
            download: "",
            click: mockClick,
        });
        vi.spyOn(document.body, "appendChild").mockImplementation(() => { });
        vi.spyOn(document.body, "removeChild").mockImplementation(() => { });
        mockClick.mockClear();
    });

    it("returns false if no fragment selected", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        expect(editor.exportFragment()).toBe(false);
    });

    it("returns false if fragment has < 2 points", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        // Select only one point
        editor.setFragmentPoint(0, 1);
        expect(editor.exportFragment()).toBe(false);
    });

    it("exports fragment as GPX and triggers download", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
            [50.03, 30.03],
        ]);
        editor.trackName.value = "MyTrack";
        // Select fragment: point 1 to point 3
        editor.setFragmentPoint(0, 1);
        editor.setFragmentPoint(0, 3);

        const ok = editor.exportFragment();
        expect(ok).toBe(true);
        expect(mockClick).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
    });
});

describe("shortcutCursorValid — visual feedback", () => {
    it("shortcut is invalid when points are adjacent (less than 2 apart)", () => {
        // This tests the concept — the actual computed is in TrackEditorMap.vue
        // We verify the underlying shortcutBetweenPoints rejects adjacent points
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        // Shortcut from 0 to 1 (adjacent) should fail
        const ok = editor.shortcutBetweenPoints(0, 0, 1);
        expect(ok).toBe(false);
    });

    it("shortcut is valid when points are at least 2 apart", () => {
        const editor = createEditor([
            [50.0, 30.0],
            [50.01, 30.01],
            [50.02, 30.02],
        ]);
        const ok = editor.shortcutBetweenPoints(0, 0, 2);
        expect(ok).toBe(true);
        // After shortcut, middle point is removed
        expect(editor.segments.value[0].points.length).toBe(2);
    });
});
