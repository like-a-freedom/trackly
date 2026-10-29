import { h, render, type ObjectDirective } from 'vue';
import AppHint from '../components/AppHint.vue';
const hosts = new WeakMap<HTMLElement, HTMLElement>();
function dispose(target: HTMLElement) {
  const host = hosts.get(target);
  if (host) { render(null, host); host.remove(); hosts.delete(target); }
  target.removeAttribute('data-tooltip');
}
function update(target: HTMLElement, text?: string) {
  if (!text) { dispose(target); return; }
  let host = hosts.get(target);
  if (!host) {
    host = document.createElement('div');
    hosts.set(target, host);
    document.body.append(host);
  }
  target.setAttribute('data-tooltip', text);
  render(h(AppHint, {target,text}), host);
}
export const tooltip: ObjectDirective<HTMLElement, string | undefined> = {
  mounted: (target, binding) => update(target, binding.value),
  updated: (target, binding) => { if (binding.value !== binding.oldValue) update(target, binding.value); },
  beforeUnmount: dispose,
};
