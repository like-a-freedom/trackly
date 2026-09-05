// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchButton from '../SearchButton.vue';

describe('SearchButton', () => {
    it('renders the search button', () => {
        const wrapper = mount(SearchButton);
        expect(wrapper.find('.search-button').exists()).toBe(true);
    });

    it('emits open-search event when clicked', async () => {
        const wrapper = mount(SearchButton);
        await wrapper.find('.search-button').trigger('click');
        expect(wrapper.emitted('open-search')).toBeTruthy();
        expect(wrapper.emitted('open-search')).toHaveLength(1);
    });

    it('has correct title attribute', () => {
        const wrapper = mount(SearchButton);
        expect(wrapper.find('.search-button').attributes('title')).toBe('Search tracks');
    });

    it('contains an SVG icon', () => {
        const wrapper = mount(SearchButton);
        expect(wrapper.find('svg').exists()).toBe(true);
    });

    it('SVG has correct attributes', () => {
        const wrapper = mount(SearchButton);
        const svg = wrapper.find('svg');
        expect(svg.attributes('width')).toBe('20');
        expect(svg.attributes('height')).toBe('20');
        expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    });
});
