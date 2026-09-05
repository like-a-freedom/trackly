import { ref, onMounted, onUnmounted } from 'vue';

interface SettingsMenuState {
  showMenu: Ref<boolean>;
  buttonRef: Ref<HTMLElement | null>;
  menuRef: Ref<HTMLElement | null>;
  toggle: () => void;
  close: () => void;
}

export function useSettingsMenu(): SettingsMenuState {
  const showMenu = ref(false);
  const buttonRef = ref<HTMLElement | null>(null);
  const menuRef = ref<HTMLElement | null>(null);

  function toggle(): void {
    showMenu.value = !showMenu.value;
  }

  function close(): void {
    showMenu.value = false;
  }

  function handleClickOutside(event: MouseEvent): void {
    if (!showMenu.value) return;

    const target = event.target as HTMLElement;
    if (
      buttonRef.value &&
      !buttonRef.value.contains(target) &&
      menuRef.value &&
      !menuRef.value.contains(target)
    ) {
      showMenu.value = false;
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  return {
    showMenu,
    buttonRef,
    menuRef,
    toggle,
    close,
  };
}
