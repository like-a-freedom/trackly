import { ref, onMounted, onUnmounted } from 'vue';

interface TooltipState {
  activeTooltipId: Ref<string | null>;
  showTooltip: (id: string) => void;
  hideTooltip: (id: string) => void;
  toggleTooltip: (id: string) => void;
  isVisible: (id: string) => boolean;
}

export function useIconTooltips(): TooltipState {
  const activeTooltipId = ref<string | null>(null);

  function showTooltip(id: string): void {
    activeTooltipId.value = id;
  }

  function hideTooltip(id: string): void {
    if (activeTooltipId.value === id) {
      activeTooltipId.value = null;
    }
  }

  function toggleTooltip(id: string): void {
    if (activeTooltipId.value === id) {
      activeTooltipId.value = null;
    } else {
      activeTooltipId.value = id;
    }
  }

  function isVisible(id: string): boolean {
    return activeTooltipId.value === id;
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.info-icon') && !target.closest('.tooltip-content')) {
      activeTooltipId.value = null;
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  return {
    activeTooltipId,
    showTooltip,
    hideTooltip,
    toggleTooltip,
    isVisible,
  };
}
