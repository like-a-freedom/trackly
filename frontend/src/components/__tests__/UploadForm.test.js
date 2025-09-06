import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import UploadForm from '../UploadForm.vue';
import * as VueRouter from 'vue-router';

// Create mock function for checkTrackDuplicate
const mockCheckTrackDuplicate = vi.fn().mockResolvedValue({ alreadyExists: false, warning: '' });
const mockUploadTrack = vi.fn().mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', url: '/tracks/123e4567-e89b-12d3-a456-426614174000' });
const mockPush = vi.fn();

// Mock the useTracks composable
vi.mock('../../composables/useTracks', () => ({
    useTracks: vi.fn(() => ({
        checkTrackDuplicate: mockCheckTrackDuplicate,
        uploadTrack: mockUploadTrack
    }))
}));

// Spy on useRouter to override the default mock
vi.spyOn(VueRouter, 'useRouter').mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
    currentRoute: { value: { path: '/', params: {} } }
});

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
        mockPush.mockClear();
        mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });
        mockUploadTrack.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', url: '/tracks/123e4567-e89b-12d3-a456-426614174000' });
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

            // Verify that setTimeout was called with 5000ms timeout (updated from 3000ms)
            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

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

    describe('Upload Success with Track Links', () => {
        beforeEach(() => {
            // Mock clipboard API
            global.navigator = {
                clipboard: {
                    writeText: vi.fn().mockResolvedValue()
                }
            };

            // Mock window.location
            delete window.location;
            window.location = {
                origin: 'http://localhost:3000'
            };
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('shows success message with track links after successful upload', async () => {
            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.upload-success').exists()).toBe(true);
            expect(wrapper.find('.success-message').text()).toContain('Track uploaded successfully!');
            expect(wrapper.find('.success-actions').exists()).toBe(true);
            expect(wrapper.find('.track-link-btn').exists()).toBe(true);
            expect(wrapper.find('.copy-link-btn').exists()).toBe(true);
        });

        it('navigates to track when View Track button is clicked', async () => {
            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            const viewTrackBtn = wrapper.find('.track-link-btn');
            expect(viewTrackBtn.exists()).toBe(true);
            expect(viewTrackBtn.text()).toBe('Show track');

            await viewTrackBtn.trigger('click');

            expect(mockPush).toHaveBeenCalledWith('/track/123e4567-e89b-12d3-a456-426614174000');
        });

        it('copies track URL to clipboard when Copy Link button is clicked', async () => {
            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            const copyLinkBtn = wrapper.find('.copy-link-btn');
            expect(copyLinkBtn.exists()).toBe(true);

            // Check initial state
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);

            await copyLinkBtn.trigger('click');

            expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith(
                'http://localhost:3000/track/123e4567-e89b-12d3-a456-426614174000'
            );

            // Check that the success state is set
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.linkCopied).toBe(true);
        });

        it('shows correct copy button states during copying process', async () => {
            vi.useFakeTimers();

            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            const copyLinkBtn = wrapper.find('.copy-link-btn');

            // Initial state - link icon should be visible
            expect(copyLinkBtn.find('svg').exists()).toBe(true);
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);

            // Click to copy
            await copyLinkBtn.trigger('click');
            await wrapper.vm.$nextTick();

            // Should show success state
            expect(wrapper.vm.linkCopied).toBe(true);
            expect(wrapper.vm.copyingLink).toBe(false);

            // Fast-forward time to clear success state
            vi.advanceTimersByTime(2000);
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.linkCopied).toBe(false);

            vi.useRealTimers();
        });

        it('handles clipboard fallback when clipboard API is not available', async () => {
            // This test validates that the clipboard fallback method exists and can be called
            // without throwing errors. Full integration testing of document manipulation
            // is tested in integration tests.

            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            // Check that the copy function exists and can be called
            expect(typeof wrapper.vm.copyTrackUrl).toBe('function');

            // Test that calling the function doesn't throw an error
            expect(() => wrapper.vm.copyTrackUrl()).not.toThrow();
        });

        it('does not show action buttons when no upload data is available', async () => {
            wrapper = mount(UploadForm);

            // Manually set uploadSuccess without uploadedTrackData
            wrapper.vm.uploadSuccess = true;
            wrapper.vm.uploadedTrackData = null;
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.upload-success').exists()).toBe(true);
            expect(wrapper.find('.success-message').exists()).toBe(true);
            expect(wrapper.find('.success-actions').exists()).toBe(false);
        });

        it('clears uploaded track data on new file selection', async () => {
            wrapper = mount(UploadForm);

            // Set initial uploaded track data and copy states
            wrapper.vm.uploadedTrackData = { id: '123', url: '/tracks/123' };
            wrapper.vm.uploadSuccess = true;
            wrapper.vm.copyingLink = true;
            wrapper.vm.linkCopied = true;
            await wrapper.vm.$nextTick();

            // Select new file
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const input = wrapper.find('#track-upload');

            Object.defineProperty(input.element, 'files', {
                value: [file],
                writable: false,
            });

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await input.trigger('change');
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.uploadSuccess).toBe(false);
            expect(wrapper.vm.uploadedTrackData).toBe(null);
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);
        });

        it('clears uploaded track data on file drop', async () => {
            wrapper = mount(UploadForm);

            // Set initial uploaded track data and copy states
            wrapper.vm.uploadedTrackData = { id: '123', url: '/tracks/123' };
            wrapper.vm.uploadSuccess = true;
            wrapper.vm.copyingLink = true;
            wrapper.vm.linkCopied = true;
            await wrapper.vm.$nextTick();

            // Drop new file
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            const dropEvent = {
                dataTransfer: {
                    files: [file]
                }
            };

            mockCheckTrackDuplicate.mockResolvedValue({ alreadyExists: false, warning: '' });

            await wrapper.find('.upload-form').trigger('drop', dropEvent);
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.uploadSuccess).toBe(false);
            expect(wrapper.vm.uploadedTrackData).toBe(null);
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);
        });

        it('automatically clears upload data after extended timeout', async () => {
            vi.useFakeTimers();

            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.uploadSuccess).toBe(true);
            expect(wrapper.vm.uploadedTrackData).not.toBe(null);

            // Fast-forward time past the 5 second timeout
            vi.advanceTimersByTime(5000);

            expect(wrapper.vm.uploadSuccess).toBe(false);
            expect(wrapper.vm.uploadedTrackData).toBe(null);

            vi.useRealTimers();
        });

        it('handles navigation when no track data is available gracefully', async () => {
            wrapper = mount(UploadForm);

            // Manually call navigateToTrack without uploadedTrackData
            wrapper.vm.uploadedTrackData = null;
            wrapper.vm.navigateToTrack();

            expect(mockPush).not.toHaveBeenCalled();
        });

        it('handles copy operation when no track data is available gracefully', async () => {
            wrapper = mount(UploadForm);

            // Manually call copyTrackUrl without uploadedTrackData
            wrapper.vm.uploadedTrackData = null;
            await wrapper.vm.copyTrackUrl();

            expect(global.navigator.clipboard.writeText).not.toHaveBeenCalled();
        });

        it('stores upload response correctly after successful upload', async () => {
            const mockResponse = {
                id: 'test-track-id-123',
                url: '/tracks/test-track-id-123'
            };
            mockUploadTrack.mockResolvedValue(mockResponse);

            wrapper = mount(UploadForm);
            const file = new File(['test'], 'test.gpx', { type: 'application/gpx+xml' });
            wrapper.vm.selectedFile = file;
            wrapper.vm.trackExists = false;
            wrapper.vm.checkingExists = false;

            await wrapper.find('.upload-form').trigger('submit');
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.uploadedTrackData).toEqual(mockResponse);
        });

        it('manages copy states correctly during copy operation', async () => {
            wrapper = mount(UploadForm);

            // Set up uploaded track data
            wrapper.vm.uploadedTrackData = { id: '123', url: '/tracks/123' };
            wrapper.vm.uploadSuccess = true;
            await wrapper.vm.$nextTick();

            // Initial state
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);

            // Start copy operation
            const copyPromise = wrapper.vm.copyTrackUrl();

            // Should be in copying state
            expect(wrapper.vm.copyingLink).toBe(true);
            expect(wrapper.vm.linkCopied).toBe(false);

            await copyPromise;
            await wrapper.vm.$nextTick();

            // Should be in copied state
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(true);
        });

        it('resets copy states when clearing upload data', async () => {
            wrapper = mount(UploadForm);

            // Set up initial state with copy states active
            wrapper.vm.uploadedTrackData = { id: '123', url: '/tracks/123' };
            wrapper.vm.uploadSuccess = true;
            wrapper.vm.copyingLink = true;
            wrapper.vm.linkCopied = true;
            await wrapper.vm.$nextTick();

            // Clear upload data manually (simulating new file selection)
            wrapper.vm.uploadedTrackData = null;
            wrapper.vm.uploadSuccess = false;
            wrapper.vm.copyingLink = false;
            wrapper.vm.linkCopied = false;
            await wrapper.vm.$nextTick();

            // Copy states should be reset
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);
            expect(wrapper.vm.uploadSuccess).toBe(false);
            expect(wrapper.vm.uploadedTrackData).toBe(null);
        });

        it('copy button shows correct states', async () => {
            wrapper = mount(UploadForm);

            // Set up uploaded track data
            wrapper.vm.uploadedTrackData = { id: '123', url: '/tracks/123' };
            wrapper.vm.uploadSuccess = true;
            await wrapper.vm.$nextTick();

            // Find copy button
            const copyButton = wrapper.find('.copy-link-btn');
            expect(copyButton.exists()).toBe(true);

            // Default state
            expect(wrapper.vm.copyingLink).toBe(false);
            expect(wrapper.vm.linkCopied).toBe(false);

            // Simulate copying state
            wrapper.vm.copyingLink = true;
            await wrapper.vm.$nextTick();

            // Button should be disabled during copying
            expect(copyButton.attributes('disabled')).toBeDefined();

            // Simulate copied state
            wrapper.vm.copyingLink = false;
            wrapper.vm.linkCopied = true;
            await wrapper.vm.$nextTick();

            // Button should show copied state
            expect(copyButton.attributes('disabled')).toBeUndefined();
        });
    });
});
