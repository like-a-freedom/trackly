import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorPois from '../editor/TrackEditorInspectorPois.vue';

describe('TrackEditorInspectorPois', () => {
    it('renders POIs and supports edit/update/delete flows', async () => {
        const wrapper = mount(TrackEditorInspectorPois, {
            props: {
                pois: [
                    {
                        name: 'Water source',
                        description: 'Near the bridge',
                        category: 'water',
                        distFromStart: 1500,
                        isFarFromTrack: false,
                    },
                    {
                        name: 'Camp',
                        description: '',
                        category: 'camping',
                        distFromStart: 2300,
                        isFarFromTrack: true,
                    },
                ],
            },
        });

        expect(wrapper.find('[data-testid="poi-section"]').exists()).toBe(true);
        expect(wrapper.findAll('[data-testid="poi-item"]')).toHaveLength(2);
        expect(wrapper.text()).toContain('Water source');
        expect(wrapper.text()).toContain('>1 km from track');

        await wrapper.findAll('[data-testid="poi-edit-btn"]')[0].trigger('click');
        await wrapper.find('[data-testid="poi-edit-name"]').setValue('Updated water');
        await wrapper.find('[data-testid="poi-edit-description"]').setValue('Fresh water');
        await wrapper.find('[data-testid="poi-edit-category"]').setValue('food');
        await wrapper.find('[data-testid="poi-save-btn"]').trigger('click');
        await wrapper.findAll('[data-testid="poi-delete-btn"]')[1].trigger('click');

        expect(wrapper.emitted('updatePoi')).toEqual([[0, {
            name: 'Updated water',
            description: 'Fresh water',
            category: 'food',
        }]]);
        expect(wrapper.emitted('deletePoi')).toEqual([[1]]);
    });
});
