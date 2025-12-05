// Flyout panel padding for fitBounds
// Leaflet's paddingBottomRight expects [x, y] = [rightPadding, bottomPadding]
// Bottom padding accounts for the detail panel (max-height: 50vh, min-height: 200px)

// Function to calculate dynamic flyout padding based on viewport
// Returns options object for fitBounds with proper padding for detail panel
export function getDetailPanelFitBoundsOptions() {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Panel takes up to 50vh, so visible map area is 50vh
    // We want track to fit comfortably in the top half with some margin

    // Target track space - use ~45% of viewport (leaving 5% margin from panel)
    const targetTrackSpace = viewportHeight * 0.45;

    // Bottom padding = viewport height - space for track - top padding
    const topPadding = 40;
    const bottomPadding = Math.round(viewportHeight - targetTrackSpace - topPadding);

    // Side padding
    const sidePadding = viewportWidth < 640 ? 15 : 30;

    console.log('[getDetailPanelFitBoundsOptions] Calculated:', {
        viewportHeight,
        targetTrackSpace,
        bottomPadding,
        topPadding,
        sidePadding,
        availableForTrack: viewportHeight - bottomPadding - topPadding
    });

    return {
        paddingTopLeft: [sidePadding, topPadding],       // [left, top]
        paddingBottomRight: [sidePadding, bottomPadding], // [right, bottom]
        animate: true,
        duration: 0.5,
        maxZoom: 16 // Limit zoom to keep more context visible
    };
}

// Polyline style constants
export const POLYLINE_WEIGHT_ACTIVE = 7;
export const POLYLINE_WEIGHT_SELECTED_DETAIL = 5;
export const POLYLINE_WEIGHT_DEFAULT = 4;

export const POLYLINE_OPACITY_ACTIVE = 1;
export const POLYLINE_OPACITY_HOVER_DIM = 0.75;
export const POLYLINE_OPACITY_SELECTED_DETAIL = 1;
export const POLYLINE_OPACITY_DEFAULT = 0.85;
