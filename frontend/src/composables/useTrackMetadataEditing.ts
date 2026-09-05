import { ref, type Ref } from 'vue';

interface MetadataEditingState {
  isEditingName: Ref<boolean>;
  isEditingDescription: Ref<boolean>;
  editingName: Ref<string>;
  editingDescription: Ref<string>;
  startEditingName: (currentName: string) => void;
  stopEditingName: () => void;
  startEditingDescription: (currentDescription: string) => void;
  stopEditingDescription: () => void;
  hasNameChanged: (original: string) => boolean;
  hasDescriptionChanged: (original: string) => boolean;
}

export function useTrackMetadataEditing(): MetadataEditingState {
  const isEditingName = ref(false);
  const isEditingDescription = ref(false);
  const editingName = ref('');
  const editingDescription = ref('');

  function startEditingName(currentName: string): void {
    editingName.value = currentName;
    isEditingName.value = true;
  }

  function stopEditingName(): void {
    isEditingName.value = false;
    editingName.value = '';
  }

  function startEditingDescription(currentDescription: string): void {
    editingDescription.value = currentDescription;
    isEditingDescription.value = true;
  }

  function stopEditingDescription(): void {
    isEditingDescription.value = false;
    editingDescription.value = '';
  }

  function hasNameChanged(original: string): boolean {
    return isEditingName.value && editingName.value !== original && editingName.value.trim().length > 0;
  }

  function hasDescriptionChanged(original: string): boolean {
    return isEditingDescription.value && editingDescription.value !== original;
  }

  return {
    isEditingName,
    isEditingDescription,
    editingName,
    editingDescription,
    startEditingName,
    stopEditingName,
    startEditingDescription,
    stopEditingDescription,
    hasNameChanged,
    hasDescriptionChanged,
  };
}
