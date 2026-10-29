import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackActionButton from '../TrackActionButton.vue';
describe('shared track action', () => {
 it.each(['edit','save','cancel','upload','refresh'] as const)('renders %s consistently', action => {
  const wrapper = mount(TrackActionButton,{props:{action,label:'Action'}});
  expect(wrapper.findAll('svg')).toHaveLength(1);
  expect(wrapper.classes()).toContain('track-action-button');
  expect(wrapper.classes()).toContain(action === 'save' || action === 'upload' ? 'ui-primary' : 'ui-secondary');
  expect(wrapper.find('span').exists()).toBe(action !== 'edit' && action !== 'refresh');
 });
 it('disables saving and animates only its icon', () => {
  const wrapper = mount(TrackActionButton,{props:{action:'save',loading:true},slots:{default:'Saving…'}});
  expect(wrapper.get('button').element.disabled).toBe(true);
  expect(wrapper.attributes('aria-busy')).toBe('true');
  expect(wrapper.get('.track-action-loading').element.tagName.toLowerCase()).toBe('svg');
  expect(wrapper.get('span').text()).toBe('Saving…');
 });
 it('preserves submit semantics for upload', () => {
  const wrapper = mount(TrackActionButton,{props:{action:'upload',type:'submit'}});
  expect(wrapper.attributes('type')).toBe('submit');
 });
});
