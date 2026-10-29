<script lang="ts">
let nextHintId = 0;
let closeActiveHint: (() => void) | undefined;
</script>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
const props = defineProps<{target: HTMLElement; text: string}>();
const tooltip = ref<HTMLElement>();
const id = `hint-${nextHintId++}`;
const anchor = `--${id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
let timer: ReturnType<typeof setTimeout> | undefined;
let oldAnchor = '';
const visibilityObserver = new MutationObserver(() => {
  if (!props.target.isConnected) handleHide();
});
function handleHide() {
  clearTimeout(timer);
  visibilityObserver.disconnect();
  tooltip.value?.hidePopover?.();
  if (closeActiveHint === handleHide) closeActiveHint = undefined;
  document.removeEventListener('pointerdown', handleOutside, true);
  document.removeEventListener('keydown', handleKey, true);
  window.removeEventListener('scroll', handleHide, true);
  window.removeEventListener('resize', handleHide);
}
function handleShow() {
  if (!props.text || !props.target.isConnected) return;
  clearTimeout(timer);
  if (closeActiveHint !== handleHide) closeActiveHint?.();
  closeActiveHint = handleHide;
  visibilityObserver.observe(document.body, {childList:true,subtree:true});
  tooltip.value?.showPopover?.({source:props.target});
  document.addEventListener('pointerdown', handleOutside, true);
  document.addEventListener('keydown', handleKey, true);
  window.addEventListener('scroll', handleHide, true);
  window.addEventListener('resize', handleHide);
}
function handleKeepOpen() { clearTimeout(timer); }
function handleLeave() {
  if (document.activeElement === props.target) return;
  timer = setTimeout(handleHide, 100);
}
function handleOutside(event: Event) {
  const node = event.target as Node;
  if (!props.target.contains(node) && !tooltip.value?.contains(node)) handleHide();
}
function handleKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || closeActiveHint !== handleHide) return;
  event.stopPropagation();
  handleHide();
}
const listeners = {mouseenter:handleShow,mouseleave:handleLeave,focusin:handleShow,focusout:handleHide,click:handleShow};
onMounted(() => {
  oldAnchor = props.target.style.getPropertyValue('anchor-name');
  props.target.style.setProperty('anchor-name', anchor);
  const descriptions = props.target.getAttribute('aria-describedby');
  props.target.setAttribute('aria-describedby', [descriptions,id].filter(Boolean).join(' '));
  for (const [event, handler] of Object.entries(listeners)) props.target.addEventListener(event, handler as EventListener);
});
onBeforeUnmount(() => {
  handleHide();
  props.target.style.setProperty('anchor-name', oldAnchor);
  const descriptions = (props.target.getAttribute('aria-describedby') ?? '').split(' ').filter(value => value !== id).join(' ');
  if (descriptions) props.target.setAttribute('aria-describedby', descriptions);
  else props.target.removeAttribute('aria-describedby');
  for (const [event, handler] of Object.entries(listeners)) props.target.removeEventListener(event, handler as EventListener);
});
</script>
<template>
  <span ref="tooltip" :id="id" popover="manual" role="tooltip" class="app-hint"
    :style="{'position-anchor':anchor}" @click.stop @mouseenter="handleKeepOpen" @mouseleave="handleLeave">{{ text }}</span>
</template>
<style scoped>
.app-hint {
  position: fixed;
  inset: 0;
  margin: auto;
  inline-size: max-content;
  max-inline-size: min(240px, calc(100vi - 16px));
  block-size: fit-content;
  box-sizing: border-box;
  padding-block: 8px;
  padding-inline: 12px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 2px 12px oklch(0% 0 none / 0.15);
  font: 400 0.8125rem/1.4 var(--font-family, system-ui, sans-serif);
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
}
@supports (position-area: block-end) {
  .app-hint {
    inset: auto;
    margin: 0;
    margin-block-start: 8px;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-inline, flip-block, flip-block flip-inline;
  }
}
</style>
