import { ref, computed, type Ref } from 'vue';
import { http } from '../http-instance';

interface NicknameEditState {
  showModal: Ref<boolean>;
  editValue: Ref<string>;
  saving: Ref<boolean>;
  error: Ref<string | null>;
  hasChanged: Ref<boolean>;
  open: (currentNickname: string) => void;
  close: () => void;
  save: () => Promise<boolean>;
}

const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

export function useNicknameEdit(currentNickname: Ref<string | null>): NicknameEditState {
  const showModal = ref(false);
  const editValue = ref('');
  const saving = ref(false);
  const error = ref<string | null>(null);

  const hasChanged = computed(() => {
    return showModal.value && editValue.value !== currentNickname.value && editValue.value.trim().length > 0;
  });

  function open(current: string): void {
    editValue.value = current;
    error.value = null;
    showModal.value = true;
  }

  function close(): void {
    showModal.value = false;
    editValue.value = '';
    error.value = null;
  }

  async function save(): Promise<boolean> {
    const nickname = editValue.value.trim();

    if (!NICKNAME_REGEX.test(nickname)) {
      error.value = 'Nickname must be 3-30 characters (letters, numbers, underscore, hyphen)';
      return false;
    }

    saving.value = true;
    error.value = null;

    try {
      const response = await http('/api/auth/me/nickname', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      if (response.ok) {
        currentNickname.value = nickname;
        close();
        return true;
      } else {
        const data = await response.json().catch(() => ({}));
        error.value = data.error || 'Failed to update nickname';
        return false;
      }
    } catch (err) {
      error.value = 'Network error. Please try again.';
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    showModal,
    editValue,
    saving,
    error,
    hasChanged,
    open,
    close,
    save,
  };
}
