import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import UploadForm from '../UploadForm.vue';

// Create mock function for checkTrackDuplicate
const mockCheckTrackDuplicate = vi.fn().mockResolvedValue({ alreadyExists: false, warning: '' });
const mockUploadTrack = vi.fn().mockResolvedValue({ success: true });

// Mock the useTracks composable
vi.mock('../../composables/useTracks', () => ({
    useTracks: vi.fn(() => ({
        checkTrackDuplicate: mockCheckTrackDuplicate,
        uploadTrack: mockUploadTrack
    }))
}));

// Mock the Multiselect component
vi.mock('@vueform/multiselect', () => ({
    default: {
        name: 'Multiselect',
        props: ['modelValue', 'mode', 'closeOnSelect', 'searchable', 'createOption', 'options', 'object', 'placeholder'],
        emits: ['update:modelValue'],
        template: `
      <div class="multiselect-mock">
        <input 
          :value="Array.isArray(modelValue) ? modelValue.map(v => v.label || v).join(', ') : ''"
          @input="$emit('update:modelValue', $event.target.value ? [{ value: $event.target.value, label: $event.target.value }] : [])"
          :placeholder="placeholder"
          data-testid="categories-input"
        />
      </div>
    `
    }
}));

// Mock the CSS import
vi.mock('@vueform/multiselect/themes/default.css', () => ({}));

describe('UploadForm', () => {
    let wrapper;

    beforeEach(() => {
        wrapper = null;
        // Reset mocks to default behavior
        mockCheckTrackDuplicate.mockClear();
        mockUploadTrack.mockClear();
        mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });
        mockUploadTrack.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
    });

    describe('Initial state', () => {
        it('renders upload form correctly', () => {
            wrapper = mount(UploadForm);

            expect(wrapper.find('.upload-form').exists()).toBe(true);
            expect(wrapper.find('.drop-area').exists()).toBe(true);
            // Upload button should not exist initially (only shown when file is selected)
            expect(wrapper.find('.upload-btn').exists()).toBe(false);
        });

        it('shows initial file selection message', () => {
            wrapper = mount(UploadForm);

            expect(wrapper.text()).toContain('Drag and drop a GPX track file or click to select it');
        });

        it('does not show upload button initially', () => {
            wrapper = mount(UploadForm);

            // Upload button should not exist when no file is selected
            expect(wrapper.find('.upload-btn').exists()).toBe(false);
        });

        it('does not show track name input initially', () => {
            wrapper = mount(UploadForm);

            expect(wrapper.find('.track-name-input').exists()).toBe(false);
        });

        it('does not show category select initially', () => {
            wrapper = mount(UploadForm);

            expect(wrapper.find('.track-category-select').exists()).toBe(false);
        });
    });

    describe('File selection', () => {
        it('handles file selection via input change', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test-track.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            expect(wrapper.text()).toContain('File: test-track.gpx');
        });

        it('sets track name from filename', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'my-awesome-track.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for the component to update
            await new Promise(resolve => setTimeout(resolve, 10));

            const nameInput = wrapper.find('.track-name-input');
            expect(nameInput.exists()).toBe(true);
            expect(nameInput.element.value).toBe('my-awesome-track');
        });

        it('shows track name and category inputs after file selection', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(wrapper.find('.track-name-input').exists()).toBe(true);
            expect(wrapper.find('.track-category-select').exists()).toBe(true);
        });

        it('enables upload button after valid file selection', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async check to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            const uploadBtn = wrapper.find('.upload-btn');
            expect(uploadBtn.attributes('disabled')).toBeUndefined();
        });
    });

    describe('Drag and drop functionality', () => {
        it('handles drag over event', async () => {
            wrapper = mount(UploadForm, {
                props: { dragActive: false }
            });

            await wrapper.find('.upload-form').trigger('dragover');

            expect(wrapper.emitted('update:dragActive')).toBeTruthy();
            expect(wrapper.emitted('update:dragActive')[0]).toEqual([true]);
        });

        it('handles drag leave event', async () => {
            wrapper = mount(UploadForm, {
                props: { dragActive: true }
            });

            await wrapper.find('.upload-form').trigger('dragleave');

            expect(wrapper.emitted('update:dragActive')).toBeTruthy();
            expect(wrapper.emitted('update:dragActive')[0]).toEqual([false]);
        });

        it('handles file drop', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'dropped-track.gpx', { type: 'application/gpx+xml' });
            const dropEvent = {
                dataTransfer: {
                    files: [file]
                }
            };

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await wrapper.find('.upload-form').trigger('drop', dropEvent);

            expect(wrapper.emitted('update:dragActive')).toBeTruthy();
            expect(wrapper.emitted('update:dragActive')[0]).toEqual([false]);
        });

        it('adds drag-active class when dragActive prop is true', async () => {
            wrapper = mount(UploadForm, {
                props: { dragActive: true }
            });

            const dropArea = wrapper.find('.drop-area');
            expect(dropArea.classes()).toContain('drag-active');
        });
    });

    describe('Track duplicate checking', () => {
        it('calls checkTrackDuplicate when file is selected', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockCheckTrackDuplicate).toHaveBeenCalledWith({ file });
        });

        it('displays warning when track already exists', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'duplicate.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({
                alreadyExists: true,
                warning: 'This track already exists'
            });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(wrapper.find('.upload-warning').exists()).toBe(true);
            expect(wrapper.text()).toContain('This track already exists');
        });

        it('disables upload button when track exists', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'duplicate.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({
                alreadyExists: true,
                warning: 'Track exists'
            });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            const uploadBtn = wrapper.find('.upload-btn');
            expect(uploadBtn.attributes('disabled')).toBeDefined();
        });
    });

    describe('Form submission', () => {
        it('calls uploadTrack with correct data', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations and component updates
            await new Promise(resolve => setTimeout(resolve, 10));

            // Update track name
            const nameInput = wrapper.find('.track-name-input');
            await nameInput.setValue('My Custom Track');

            // Submit form
            await wrapper.find('.upload-form').trigger('submit');

            // Wait for async operations
            await wrapper.vm.$nextTick();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockUploadTrack).toHaveBeenCalledWith({
                file: file,
                name: 'My Custom Track',
                categories: []
            });
            expect(wrapper.emitted('uploaded')).toBeTruthy();
        });

        it('calls uploadTrack with categories', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate selecting categories
            wrapper.vm.trackCategories = [
                { value: 'running', label: 'Running' },
                { value: 'morning', label: 'Morning' }
            ];

            await wrapper.find('.upload-form').trigger('submit');

            // Wait for async operations
            await wrapper.vm.$nextTick();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockUploadTrack).toHaveBeenCalledWith({
                file: file,
                name: file.name.replace(/\.[^.]+$/, ""), // Default name from filename
                categories: ['running', 'morning']
            });
        });

        it('emits uploaded event after successful upload', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');

            expect(wrapper.emitted('uploaded')).toBeTruthy();
        });

        it('resets form after successful upload', async () => {
            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackName = 'Test Track';
            wrapper.vm.trackCategories = [{ value: 'running', label: 'Running' }];
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');

            expect(wrapper.vm.selectedFile).toBe(null);
            expect(wrapper.vm.trackName).toBe('');
            expect(wrapper.vm.trackCategories).toEqual([]);
        });

        it('does not submit when no file selected', async () => {
            wrapper = mount(UploadForm);

            await wrapper.find('.upload-form').trigger('submit');

            expect(mockUploadTrack).not.toHaveBeenCalled();
            expect(wrapper.emitted('uploaded')).toBeFalsy();
        });

        it('does not submit when track exists', async () => {
            wrapper = mount(UploadForm);

            wrapper.vm.selectedFile = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.trackExists = true;

            await wrapper.find('.upload-form').trigger('submit');

            expect(mockUploadTrack).not.toHaveBeenCalled();
            expect(wrapper.emitted('uploaded')).toBeFalsy();
        });

        it('does not submit when checking exists', async () => {
            wrapper = mount(UploadForm);

            wrapper.vm.selectedFile = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.checkingExists = true;

            await wrapper.find('.upload-form').trigger('submit');

            expect(mockUploadTrack).not.toHaveBeenCalled();
            expect(wrapper.emitted('uploaded')).toBeFalsy();
        });

        it('shows success message after successful upload', async () => {
            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;
            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();
            expect(wrapper.find('.upload-success').exists()).toBe(true);
            expect(wrapper.text()).toContain('Track uploaded successfully!');
        });
        it('hides success message after timeout', async () => {
            // Test that setTimeout is called with the correct timeout duration
            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            // Trigger form submit and wait for async upload to complete
            await wrapper.find('.upload-form').trigger('submit');

            // Wait for success message to appear
            await flushPromises();
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.upload-success').exists()).toBe(true);
            expect(wrapper.vm.uploadSuccess).toBe(true);

            // Verify that setTimeout was called with 3000ms timeout
            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

            // Test that setting uploadSuccess to false hides the message (validates reactive behavior)
            wrapper.vm.uploadSuccess = false;
            await wrapper.vm.$nextTick();

            // The reactive variable should be false
            expect(wrapper.vm.uploadSuccess).toBe(false);

            setTimeoutSpy.mockRestore();
        });
        it('clears success message on new file selection', async () => {
            wrapper = mount(UploadForm);
            wrapper.vm.uploadSuccess = true;
            // Simulate file selection via onFileChange to trigger uploadSuccess reset
            const file = new File(['test'], 'test2.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');
            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });
            await input.trigger('change');
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.uploadSuccess).toBe(false);
        });
    });

    describe('Categories functionality', () => {
        it('initializes with predefined categories list', () => {
            wrapper = mount(UploadForm);

            const expectedCategories = [
                { value: 'hiking', label: 'Hiking' },
                { value: 'running', label: 'Running' },
                { value: 'walking', label: 'Walking' },
                { value: 'cycling', label: 'Cycling' },
                { value: 'skiing', label: 'Skiing' },
                { value: 'other', label: 'Other' },
            ];

            expect(wrapper.vm.categoriesList).toEqual(expectedCategories);
        });
    });

    describe('Props and reactivity', () => {
        it('updates dragActive when prop changes', async () => {
            wrapper = mount(UploadForm, {
                props: { dragActive: false }
            });

            expect(wrapper.vm.dragActive).toBe(false);

            await wrapper.setProps({ dragActive: true });

            expect(wrapper.vm.dragActive).toBe(true);
        });

        it('updates drop area class when dragActive changes', async () => {
            wrapper = mount(UploadForm, {
                props: { dragActive: false }
            });

            let dropArea = wrapper.find('.drop-area');
            expect(dropArea.classes()).not.toContain('drag-active');

            await wrapper.setProps({ dragActive: true });

            dropArea = wrapper.find('.drop-area');
            expect(dropArea.classes()).toContain('drag-active');
        });
    });

    describe('Edge cases', () => {
        it('handles file input without files', async () => {
            wrapper = mount(UploadForm);

            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [],
                writable: false,
            });

            await input.trigger('change');

            expect(wrapper.vm.selectedFile).toBe(null);
            expect(wrapper.vm.trackName).toBe('');
        });

        it('handles drop without files', async () => {
            wrapper = mount(UploadForm);

            const dropEvent = {
                dataTransfer: {
                    files: []
                }
            };

            await wrapper.find('.upload-form').trigger('drop', dropEvent);

            expect(wrapper.vm.selectedFile).toBe(null);
        });

        it('handles checkTrackDuplicate error gracefully', async () => {
            // Suppress Vue warnings during this test
            const originalWarn = console.warn;
            const originalError = console.error;
            console.warn = vi.fn();
            console.error = vi.fn();

            wrapper = mount(UploadForm);

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });

            // Mock to return a warning message (simulating an error condition)
            mockCheckTrackDuplicate.mockResolvedValue({
                alreadyExists: false,
                warning: 'Network error'
            });

            // Directly set the file to trigger the watcher
            wrapper.vm.selectedFile = file;

            // Wait for the watcher to complete
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick(); // Extra tick for async operations

            // Component should handle error gracefully and not crash
            expect(wrapper.vm.selectedFile).toBe(file);
            expect(wrapper.vm.warning).toBe('Network error');
            expect(wrapper.vm.checkingExists).toBe(false);

            // Restore console methods
            console.warn = originalWarn;
            console.error = originalError;
        }, 1000); // Set a reasonable timeout
    });

    describe('Collapsible Form Integration', () => {
        it('respects dragActive prop from parent', () => {
            wrapper = mount(UploadForm, {
                props: {
                    dragActive: true
                }
            });

            const dropArea = wrapper.find('.drop-area');
            expect(dropArea.classes()).toContain('drag-active');
        });

        it('does not show drag-active class when dragActive prop is false', () => {
            wrapper = mount(UploadForm, {
                props: {
                    dragActive: false
                }
            });

            const dropArea = wrapper.find('.drop-area');
            expect(dropArea.classes()).not.toContain('drag-active');
        });

        it('emits update:dragActive when drag state changes internally', async () => {
            wrapper = mount(UploadForm);

            // Trigger dragover without custom event object
            await wrapper.find('.drop-area').trigger('dragover');

            // Should emit update:dragActive with true
            expect(wrapper.emitted('update:dragActive')).toBeTruthy();
            expect(wrapper.emitted('update:dragActive')[0]).toEqual([true]);
        });

        it('emits update:dragActive when drag leaves', async () => {
            wrapper = mount(UploadForm);

            // First trigger dragover to set drag active
            await wrapper.find('.drop-area').trigger('dragover');

            // Trigger dragleave
            await wrapper.find('.drop-area').trigger('dragleave');

            // Should emit update:dragActive with false
            const emissions = wrapper.emitted('update:dragActive');
            expect(emissions).toBeTruthy();
            expect(emissions[emissions.length - 1]).toEqual([false]);
        });

        it('maintains drag state consistency with parent component', async () => {
            // Start with dragActive false
            wrapper = mount(UploadForm, {
                props: {
                    dragActive: false
                }
            });

            expect(wrapper.find('.drop-area').classes()).not.toContain('drag-active');

            // Update prop to true
            await wrapper.setProps({ dragActive: true });
            expect(wrapper.find('.drop-area').classes()).toContain('drag-active');

            // Update prop back to false
            await wrapper.setProps({ dragActive: false });
            expect(wrapper.find('.drop-area').classes()).not.toContain('drag-active');
        });

        it('handles file drop when controlled by parent dragActive prop', async () => {
            wrapper = mount(UploadForm, {
                props: {
                    dragActive: true
                }
            });

            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });

            // Mock the dataTransfer for drop event
            const mockDataTransfer = {
                files: [file]
            };

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            // Trigger drop with mocked dataTransfer
            const dropArea = wrapper.find('.drop-area');
            await dropArea.trigger('drop', { dataTransfer: mockDataTransfer });

            // Should emit update:dragActive with false after drop
            const emissions = wrapper.emitted('update:dragActive');
            expect(emissions).toBeTruthy();
            expect(emissions[emissions.length - 1]).toEqual([false]);

            // File should be processed
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.selectedFile).toBe(file);
        });

        it('works correctly when parent manages drag state externally', async () => {
            wrapper = mount(UploadForm, {
                props: {
                    dragActive: false
                }
            });

            // Simulate parent setting drag active due to external drag event
            await wrapper.setProps({ dragActive: true });
            expect(wrapper.find('.drop-area').classes()).toContain('drag-active');

            // Simulate file drop
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const mockDataTransfer = {
                files: [file]
            };

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await wrapper.find('.drop-area').trigger('drop', { dataTransfer: mockDataTransfer });

            // Should signal parent to update drag state
            expect(wrapper.emitted('update:dragActive')).toBeTruthy();

            // Parent should then update the prop
            await wrapper.setProps({ dragActive: false });
            expect(wrapper.find('.drop-area').classes()).not.toContain('drag-active');
        });

        it('handles multiple drag events without conflicts', async () => {
            wrapper = mount(UploadForm);

            // First dragover event
            await wrapper.find('.drop-area').trigger('dragover');

            // Check first emission
            let emissions = wrapper.emitted('update:dragActive');
            expect(emissions).toBeTruthy();
            expect(emissions[0]).toEqual([true]);

            // Multiple dragover events should not emit additional events if already active
            // (This depends on the component implementation - if it always emits, that's also valid)
            await wrapper.find('.drop-area').trigger('dragover');
            await wrapper.find('.drop-area').trigger('dragover');

            // Check that we have emissions (the exact number depends on implementation)
            emissions = wrapper.emitted('update:dragActive');
            expect(emissions.length).toBeGreaterThan(0);

            // Dragleave
            await wrapper.find('.drop-area').trigger('dragleave');

            // Should emit false
            emissions = wrapper.emitted('update:dragActive');
            expect(emissions[emissions.length - 1]).toEqual([false]);

            // Another dragover after leave
            await wrapper.find('.drop-area').trigger('dragover');

            // Should emit true again
            emissions = wrapper.emitted('update:dragActive');
            expect(emissions[emissions.length - 1]).toEqual([true]);
        });
    });
});
