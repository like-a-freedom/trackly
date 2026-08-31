import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@vue-leaflet/vue-leaflet', () => ({
    LMap: {
        name: 'LMap',
        template: '<div class="mock-lmap"><slot /></div>',
        emits: ['ready', 'click', 'mousedown', 'touchstart'],
    },
    LTileLayer: {
        name: 'LTileLayer',
        template: '<div class="mock-tile-layer"></div>',
    },
    LPolyline: {
        name: 'LPolyline',
        template: '<div class="mock-polyline"><slot /></div>',
        emits: ['click', 'contextmenu', 'mouseover', 'mouseout'],
    },
    LCircleMarker: {
        name: 'LCircleMarker',
        template: '<div class="mock-circle-marker"><slot /></div>',
        emits: ['click', 'mousedown', 'touchstart', 'contextmenu'],
    },
    LTooltip: {
        name: 'LTooltip',
        template: '<div class="mock-tooltip"><slot /></div>',
    },
}));

import TrackEditorMap from '../TrackEditorMap.vue';

describe('TrackEditorMap', () => {
    it('keeps a stable map shell, context menu shell, and exposed map hooks', async () => {
        const wrapper = mount(TrackEditorMap, {
            props: {
                segments: [
                    {
                        points: [[50.45, 30.52], [50.46, 30.53], [50.47, 30.54]],
                        waypoints: [0, 2],
                        surfaceTypes: [],
                        color: '#1976D2',
                    },
                ],
                activeSegmentIndex: 0,
                totalPoints: 3,
                editorMode: 'edit',
            },
        });

        expect(wrapper.find('[data-testid="track-editor-map-wrapper"]').exists()).toBe(true);

        const mockMap = {
            getZoom: vi.fn(() => 14),
            on: vi.fn(),
            off: vi.fn(),
            fitBounds: vi.fn(),
            panTo: vi.fn(),
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
        };

        wrapper.vm.onMapReady(mockMap);
        wrapper.vm.$.exposed.fitBounds();
        wrapper.vm.$.exposed.panTo([50.45, 30.52]);
        wrapper.vm.$.exposed.zoomIn();
        wrapper.vm.$.exposed.zoomOut();

        expect(mockMap.fitBounds).toHaveBeenCalledWith([[50.45, 30.52], [50.47, 30.54]], { padding: [40, 40] });
        expect(mockMap.panTo).toHaveBeenCalledWith([50.45, 30.52], { animate: true });
        expect(mockMap.zoomIn).toHaveBeenCalledTimes(1);
        expect(mockMap.zoomOut).toHaveBeenCalledTimes(1);

        const event = {
            originalEvent: {
                preventDefault: vi.fn(),
                stopPropagation: vi.fn(),
                clientX: 40,
                clientY: 60,
            },
        };

        wrapper.vm.onWaypointContextMenu(0, 0, event);
        await wrapper.vm.$nextTick();

        const contextMenu = wrapper.find('[data-testid="context-menu"]');
        expect(contextMenu.exists()).toBe(true);
        expect(contextMenu.attributes('role')).toBe('menu');
        expect(contextMenu.find('[data-testid="ctx-reverse"]').exists()).toBe(true);
    });
});
