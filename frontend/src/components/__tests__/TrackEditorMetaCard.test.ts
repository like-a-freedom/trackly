// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorMetaCard from '../editor/TrackEditorMetaCard.vue';

const TrackEditorInspectorOverview = {
    name: 'TrackEditorInspectorOverview',
    template: '<div data-testid="inspector-overview"></div>',
    props: [
        'showContextAlerts', 'trackName', 'trackDescription', 'trackCategories', 'totalPoints',
        'onUpdateTrackName', 'onUpdateTrackDescription', 'onUpdateTrackCategories',
    ],
};

describe('TrackEditorMetaCard', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorMetaCard, {
            props: {
                trackName: '',
                trackDescription: '',
                trackCategories: [],
                totalPoints: 0,
                ...props,
            },
            global: {
                stubs: {
                    TrackEditorInspectorOverview,
                },
            },
        });
    }

    it('renders the meta card container', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-editor-meta-card"]').exists()).toBe(true);
    });

    it('renders the inspector overview component', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="inspector-overview"]').exists()).toBe(true);
    });

    it('passes trackName to inspector overview', () => {
        const wrapper = createWrapper({ trackName: 'Test Track' });
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('trackName')).toBe('Test Track');
    });

    it('passes trackDescription to inspector overview', () => {
        const wrapper = createWrapper({ trackDescription: 'Test Description' });
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('trackDescription')).toBe('Test Description');
    });

    it('passes trackCategories to inspector overview', () => {
        const wrapper = createWrapper({ trackCategories: ['hiking', 'cycling'] });
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('trackCategories')).toEqual(['hiking', 'cycling']);
    });

    it('passes totalPoints to inspector overview', () => {
        const wrapper = createWrapper({ totalPoints: 42 });
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('totalPoints')).toBe(42);
    });

    it('passes showContextAlerts as false', () => {
        const wrapper = createWrapper();
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('showContextAlerts')).toBe(false);
    });

    it('handles empty props', () => {
        const wrapper = createWrapper();
        const overview = wrapper.findComponent({ name: 'TrackEditorInspectorOverview' });
        expect(overview.props('trackName')).toBe('');
        expect(overview.props('trackDescription')).toBe('');
        expect(overview.props('trackCategories')).toEqual([]);
        expect(overview.props('totalPoints')).toBe(0);
    });
});
