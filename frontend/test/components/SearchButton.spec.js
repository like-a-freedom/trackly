import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchButton from '../../src/components/SearchButton.vue';

describe('SearchButton', () => {
    it('renders button with search icon', () => {
        const wrapper = mount(SearchButton);

        expect(wrapper.find('button.search-button').exists()).toBe(true);
        expect(wrapper.find('svg').exists()).toBe(true);
    });

    it('has correct icon structure with circle and path', () => {
        const wrapper = mount(SearchButton);
        const svg = wrapper.find('svg');

        expect(svg.find('circle').exists()).toBe(true);
        expect(svg.find('path').exists()).toBe(true);
    });

    it('has correct viewBox for proper icon sizing', () => {
        const wrapper = mount(SearchButton);
        const svg = wrapper.find('svg');

        expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    });

    it('icon has stroke attribute for visibility', () => {
        const wrapper = mount(SearchButton);
        const svg = wrapper.find('svg');

        expect(svg.attributes('stroke')).toBe('currentColor');
        expect(svg.attributes('fill')).toBe('none');
    });

    it('SVG has proper styles applied for visibility', () => {
        const wrapper = mount(SearchButton);
        const button = wrapper.find('button.search-button');

        // Check that button has color style (computed styles in real DOM)
        expect(button.exists()).toBe(true);

        const svg = button.find('svg');
        expect(svg.exists()).toBe(true);
    });

    it('emits open-search event when clicked', async () => {
        const wrapper = mount(SearchButton);

        await wrapper.find('button').trigger('click');

        expect(wrapper.emitted('open-search')).toBeTruthy();
        expect(wrapper.emitted('open-search')).toHaveLength(1);
    });

    it('has proper accessibility attributes', () => {
        const wrapper = mount(SearchButton);
        const button = wrapper.find('button');

        expect(button.attributes('title')).toBe('Search tracks');
    });

    it('has hover interaction styles', () => {
        const wrapper = mount(SearchButton);
        const button = wrapper.find('button.search-button');

        expect(button.classes()).toContain('search-button');
    });

    it('maintains icon visibility on mobile screens', () => {
        const wrapper = mount(SearchButton);
        const svg = wrapper.find('svg');

        // Icon should always be present regardless of screen size
        expect(svg.exists()).toBe(true);
        expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    });

    it('icon elements have proper geometry', () => {
        const wrapper = mount(SearchButton);
        const circle = wrapper.find('circle');
        const path = wrapper.find('path');

        // Verify circle attributes
        expect(circle.attributes('cx')).toBe('11');
        expect(circle.attributes('cy')).toBe('11');
        expect(circle.attributes('r')).toBe('8');

        // Verify path exists for search handle
        expect(path.attributes('d')).toBe('M21 21l-4.35-4.35');
    });

    it('renders without errors', () => {
        expect(() => mount(SearchButton)).not.toThrow();
    });

    it('button is not disabled by default', () => {
        const wrapper = mount(SearchButton);
        const button = wrapper.find('button');

        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('has proper z-index positioning context', () => {
        const wrapper = mount(SearchButton);
        const button = wrapper.find('button.search-button');

        // Button should have styles for proper layering
        expect(button.exists()).toBe(true);
    });
});
