import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DistanceMarkersButton from '../DistanceMarkersButton.vue';

describe('DistanceMarkersButton', () => {
  it.each([true, false])('exposes the current state and requests its inverse (%s)', async enabled => {
    const wrapper = mount(DistanceMarkersButton, {props:{enabled,persisted:true}});
    expect(wrapper.get('button').attributes('aria-pressed')).toBe(String(enabled));
    expect(wrapper.get('button').attributes('data-tooltip')).toContain('Only in this browser.');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([[!enabled]]);
  });
  it('explains unavailable storage without adding a visible label', async () => {
    const wrapper = mount(DistanceMarkersButton, {props:{enabled:true,persisted:false}});
    expect(wrapper.get('button').attributes('data-tooltip')).toContain('For this visit only.');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('button').attributes('aria-describedby')).toMatch(/^hint-/);
  });
});
