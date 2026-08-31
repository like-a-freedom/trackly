import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorInspectorOptimizer from '../editor/TrackEditorInspectorOptimizer.vue';

describe('TrackEditorInspectorOptimizer', () => {
    it('renders optimizer controls and emits actions', async () => {
        const wrapper = mount(TrackEditorInspectorOptimizer, {
            props: {
                optimizerTargetRatio: 0.15,
                optimizerPreview: { segments: [[1, 2]] },
                optimizerStats: {
                    originalPoints: 100,
                    simplifiedPoints: 15,
                    compressionRatio: 0.15,
                    toleranceUsed: 8.5,
                },
                optimizerLoading: false,
                optimizerError: null,
                totalPoints: 50,
            },
        });

        expect(wrapper.find('[data-testid="optimizer-section"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Keep 15% of points');
        expect(wrapper.text()).toContain('100');
        expect(wrapper.text()).toContain('15');

        await wrapper.find('.optimizer-range').setValue('25');
        await wrapper.find('[data-testid="optimizer-preview-btn"]').trigger('click');
        await wrapper.find('[data-testid="optimizer-apply-btn"]').trigger('click');
        await wrapper.find('[data-testid="optimizer-clear-btn"]').trigger('click');
        await wrapper.find('[data-testid="optimizer-download-btn"]').trigger('click');

        expect(wrapper.emitted('update:optimizerTargetRatio')).toEqual([[0.25]]);
        expect(wrapper.emitted('previewOptimization')).toHaveLength(1);
        expect(wrapper.emitted('applyOptimization')).toHaveLength(1);
        expect(wrapper.emitted('clearOptimization')).toHaveLength(1);
        expect(wrapper.emitted('downloadOptimization')).toHaveLength(1);
    });
});
