import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackTooltip from '../TrackTooltip.vue';

describe('TrackTooltip', () => {
    let wrapper;

    const mockTrackMinimal = {
        id: 1,
        name: 'Test Track',
        length_km: 10.5,
        recorded_at: '2023-05-20T10:30:00Z',
        created_at: '2023-05-20T11:00:00Z'
    };

    const mockTrackComplete = {
        id: 2,
        name: 'Complete Track',
        description: 'A great running track through the park',
        length_km: 15.8,
        recorded_at: '2023-05-21T08:15:00Z',
        created_at: '2023-05-21T09:00:00Z',
        updated_at: '2023-05-21T10:00:00Z',
        avg_hr: 145,
        avg_speed: 12.5,
        elevation_gain: 250,
        categories: ['running', 'park', 'morning']
    };

    beforeEach(() => {
        // Reset wrapper before each test
        wrapper = null;
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
    });

    describe('Visibility and positioning', () => {
        it('does not render when visible is false', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: false,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(false);
        });

        it('does not render when data is null', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: null
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(false);
        });

        it('renders when visible is true and data is provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(true);
        });

        it('positions tooltip correctly', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 150,
                    y: 250,
                    data: mockTrackMinimal
                }
            });

            const tooltip = wrapper.find('.custom-tooltip');
            expect(tooltip.attributes('style')).toContain('left: 150px');
            expect(tooltip.attributes('style')).toContain('top: 250px');
            expect(tooltip.attributes('style')).toContain('position: fixed');
            expect(tooltip.attributes('style')).toContain('z-index: 2000');
        });
    });

    describe('Basic track information display', () => {
        it('displays track name when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).toContain('Test Track');
            expect(wrapper.find('.upload-label.name').exists()).toBe(true);
        });

        it('displays track description when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('A great running track through the park');
            expect(wrapper.find('.upload-label.description').exists()).toBe(true);
        });

        it('displays distance when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).toContain('Distance: 10.50 km');
        });

        it('formats distance to 2 decimal places', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: { ...mockTrackMinimal, length_km: 5.123456 }
                }
            });

            expect(wrapper.text()).toContain('Distance: 5.12 km');
        });
    });

    describe('Date formatting', () => {
        it('displays recorded date when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).toContain('Recorded:');
            expect(wrapper.find('.upload-label.meta').exists()).toBe(true);
        });

        it('displays created date when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).toContain('Added:');
        });

        it('displays updated date when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('Updated:');
        });

        it('formats dates using 24-hour format', () => {
            const testDate = '2023-05-20T10:30:00Z';
            const expectedOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false // Force 24-hour format
            };
            const expectedFormat = new Date(testDate).toLocaleString(undefined, expectedOptions);

            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: { ...mockTrackMinimal, recorded_at: testDate }
                }
            });

            expect(wrapper.text()).toContain(expectedFormat);
        });
    });

    describe('Performance metrics display', () => {
        it('displays average heart rate when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('Average pulse: 145 bpm');
        });

        it('displays average speed when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('Average speed: 12.5 km/h');
        });

        it('formats average speed to 1 decimal place', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: { ...mockTrackComplete, avg_speed: 12.123456 }
                }
            });

            expect(wrapper.text()).toContain('Average speed: 12.1 km/h');
        });

        it('displays elevation gain when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('Elevation gain: 250 m');
        });

        it('does not display performance metrics section when all metrics are missing', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).not.toContain('Average pulse:');
            expect(wrapper.text()).not.toContain('Average speed:');
            expect(wrapper.text()).not.toContain('Elevation gain:');
        });
    });

    describe('Categories display', () => {
        it('displays categories when provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            expect(wrapper.text()).toContain('Categories:');
            expect(wrapper.find('.categories-section').exists()).toBe(true);
            expect(wrapper.find('.category-tags').exists()).toBe(true);
        });

        it('displays all category tags', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackComplete
                }
            });

            const categoryTags = wrapper.findAll('.category-tag');
            expect(categoryTags).toHaveLength(3);
            expect(categoryTags[0].text()).toBe('running');
            expect(categoryTags[1].text()).toBe('park');
            expect(categoryTags[2].text()).toBe('morning');
        });

        it('does not display categories section when categories are empty', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: { ...mockTrackComplete, categories: [] }
                }
            });

            expect(wrapper.text()).not.toContain('Categories:');
            expect(wrapper.find('.categories-section').exists()).toBe(false);
        });

        it('does not display categories section when categories are not provided', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).not.toContain('Categories:');
            expect(wrapper.find('.categories-section').exists()).toBe(false);
        });
    });

    describe('Props reactivity', () => {
        it('updates position when x and y props change', async () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            await wrapper.setProps({ x: 300, y: 400 });

            const tooltip = wrapper.find('.custom-tooltip');
            expect(tooltip.attributes('style')).toContain('left: 300px');
            expect(tooltip.attributes('style')).toContain('top: 400px');
        });

        it('updates content when data prop changes', async () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.text()).toContain('Test Track');
            expect(wrapper.text()).not.toContain('Complete Track');

            await wrapper.setProps({ data: mockTrackComplete });

            expect(wrapper.text()).toContain('Complete Track');
            expect(wrapper.text()).not.toContain('Test Track');
        });

        it('hides tooltip when visible prop changes to false', async () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: mockTrackMinimal
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(true);

            await wrapper.setProps({ visible: false });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('handles missing optional fields gracefully', () => {
            const minimalData = { id: 1 };

            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: minimalData
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(true);
            expect(wrapper.text()).not.toContain('Distance:');
            expect(wrapper.text()).not.toContain('Recorded:');
        });

        it('handles zero values correctly', () => {
            const zeroData = {
                id: 1,
                name: 'Zero Track',
                length_km: 0,
                avg_speed: 0,
                avg_hr: 0,
                elevation_gain: 0
            };

            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: zeroData
                }
            });

            // Zero values should not be displayed due to v-if conditions
            expect(wrapper.text()).toContain('Zero Track');
            expect(wrapper.text()).not.toContain('Distance:');
            expect(wrapper.text()).not.toContain('Average speed:');
            expect(wrapper.text()).not.toContain('Average pulse:');
            expect(wrapper.text()).not.toContain('Elevation gain:');
        });

        it('handles undefined data gracefully', () => {
            wrapper = mount(TrackTooltip, {
                props: {
                    visible: true,
                    x: 100,
                    y: 200,
                    data: undefined
                }
            });

            expect(wrapper.find('.custom-tooltip').exists()).toBe(false);
        });
    });
});
