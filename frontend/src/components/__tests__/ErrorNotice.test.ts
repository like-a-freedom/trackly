import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ErrorNotice from '../ErrorNotice.vue';
import { ApiError } from '../../errors/apiError';

describe('ErrorNotice', () => {
    it('keeps diagnostics in a closed disclosure, with an accessible contextual title', () => {
        const error = new ApiError('The server could not complete this request.', 'Try again.', 500, 'POST', '/api/tracks/upload', 'ref-123');
        const wrapper = mount(ErrorNotice, {props:{title:'Track was not uploaded',error}});
        const alert = wrapper.get('[role="alert"]');
        expect(wrapper.get(`#${alert.attributes('aria-labelledby')}`).text()).toBe('Track was not uploaded');
        expect(alert.attributes('tabindex')).toBe('-1');
        expect(wrapper.get('details').attributes('open')).toBeUndefined();
        expect(wrapper.get('summary').text()).toBe('Technical details');
        expect(wrapper.get('dl').text()).toContain('HTTP 500');
        expect(wrapper.get('dl').text()).toContain('POST /api/tracks/upload');
        expect(wrapper.get('dl').text()).toContain('ref-123');
    });
    it('omits an empty technical disclosure for connection failures', () => {
        const error = new ApiError('Could not reach the server.', 'Check your connection and try again.', null, 'POST', '/api/tracks/upload');
        const wrapper = mount(ErrorNotice, {props:{title:'Track was not uploaded',error}});
        expect(wrapper.find('details').exists()).toBe(false);
        expect(wrapper.text()).toContain('Check your connection');
    });
});
