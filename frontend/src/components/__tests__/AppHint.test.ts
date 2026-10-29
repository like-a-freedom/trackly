import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import AppHint from '../AppHint.vue';

describe('AppHint', () => {
  it('uses one light surface, opens on focus and dismisses on Escape', async () => {
    const target = document.createElement('button');
    document.body.append(target);
    const wrapper = mount(AppHint, { props: { target, text: 'Shared hint' }, attachTo: document.body });
    const hint = wrapper.get<HTMLElement>('[role=tooltip]');
    hint.element.showPopover = vi.fn();
    hint.element.hidePopover = vi.fn();
    target.dispatchEvent(new FocusEvent('focusin', {bubbles:true}));
    expect(hint.element.showPopover).toHaveBeenCalled();
    expect(target.getAttribute('aria-describedby')).toBe(hint.attributes('id'));
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    expect(hint.element.hidePopover).toHaveBeenCalled();
    wrapper.unmount(); target.remove();
  });
  it('never forwards clicks from the hint to the action', async () => {
    const target = document.createElement('button');
    const action = vi.fn(); target.addEventListener('click', action);
    const wrapper = mount(AppHint, {props:{target,text:'Hint'}});
    await wrapper.get<HTMLElement>('[role=tooltip]').trigger('click');
    expect(action).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('gives hints unique associations and closes the previous hint', () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    document.body.append(first, second);
    const a = mount(AppHint, {props:{target:first,text:'First'},attachTo:document.body});
    const b = mount(AppHint, {props:{target:second,text:'Second'},attachTo:document.body});
    const firstHint = a.get<HTMLElement>('[role=tooltip]').element;
    const secondHint = b.get<HTMLElement>('[role=tooltip]').element;
    firstHint.showPopover = vi.fn(); firstHint.hidePopover = vi.fn();
    secondHint.showPopover = vi.fn(); secondHint.hidePopover = vi.fn();
    first.dispatchEvent(new Event('mouseenter'));
    second.dispatchEvent(new FocusEvent('focusin', {bubbles:true}));
    expect(firstHint.hidePopover).toHaveBeenCalled();
    expect(secondHint.showPopover).toHaveBeenCalled();
    expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
    a.unmount(); b.unmount(); first.remove(); second.remove();
  });
  it('dismisses on outside tap and cleans up associations on unmount', () => {
    const target = document.createElement('button');
    target.setAttribute('aria-describedby','existing');
    document.body.append(target);
    const wrapper = mount(AppHint, {props:{target,text:'Hint'},attachTo:document.body});
    const hint = wrapper.get<HTMLElement>('[role=tooltip]').element;
    hint.showPopover = vi.fn(); hint.hidePopover = vi.fn();
    target.click();
    document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));
    expect(hint.hidePopover).toHaveBeenCalled();
    wrapper.unmount();
    expect(target.getAttribute('aria-describedby')).toBe('existing');
    target.remove();
  });

  it('dismisses a hover hint on Escape even when the trigger has no focus', () => {
    const target = document.createElement('button'); document.body.append(target);
    const wrapper = mount(AppHint, {props:{target,text:'Hint'},attachTo:document.body});
    const hint = wrapper.get<HTMLElement>('[role=tooltip]').element;
    hint.showPopover = vi.fn(); hint.hidePopover = vi.fn();
    target.dispatchEvent(new Event('mouseenter'));
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(hint.hidePopover).toHaveBeenCalled();
    wrapper.unmount(); target.remove();
  });
  it('dismisses when its cached screen leaves the document', async () => {
    const target = document.createElement('button'); document.body.append(target);
    const wrapper = mount(AppHint, {props:{target,text:'Hint'},attachTo:document.body});
    const hint = wrapper.get<HTMLElement>('[role=tooltip]').element;
    hint.showPopover = vi.fn(); hint.hidePopover = vi.fn();
    target.dispatchEvent(new Event('mouseenter'));
    target.remove(); await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(hint.hidePopover).toHaveBeenCalled();
    wrapper.unmount();
  });

});
