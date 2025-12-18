import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TrackSearch from '../TrackSearch.vue'

// Mock fetch
global.fetch = vi.fn()

describe('TrackSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search modal when visible', () => {
    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    expect(wrapper.find('.search-overlay').exists()).toBe(true)
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('does not render when not visible', () => {
    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: false
      }
    })

    expect(wrapper.find('.search-overlay').exists()).toBe(false)
  })

  it('emits close when overlay is clicked', async () => {
    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    await wrapper.find('.search-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when escape key is pressed', async () => {
    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    const input = wrapper.find('.search-input')
    await input.trigger('keydown.escape')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('performs search when enter is pressed', async () => {
    const mockResponse = [
      {
        id: '123',
        name: 'Test Track',
        description: 'A test track',
        categories: ['running'],
        length_km: 5.0,
        url: '/tracks/123'
      }
    ]

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    const input = wrapper.find('.search-input')
    await input.setValue('test')
    await input.trigger('keydown.enter')

    // Wait for the search to complete
    await wrapper.vm.$nextTick()
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/tracks/search?query=test')
  })

  it('shows no results message when no tracks found', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    })

    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    const input = wrapper.find('.search-input')
    await input.setValue('nonexistent')
    await input.trigger('keydown.enter')

    // Wait for the search to complete
    await wrapper.vm.$nextTick()
    await flushPromises()

    expect(wrapper.find('.no-results').exists()).toBe(true)
    expect(wrapper.text()).toContain('No tracks found. Please, refine your query.')
  })

  it('emits track-selected when track is clicked', async () => {
    const mockResponse = [
      {
        id: '123',
        name: 'Test Track',
        description: 'A test track',
        categories: ['running'],
        length_km: 5.0,
        url: '/tracks/123'
      }
    ]

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    const input = wrapper.find('.search-input')
    await input.setValue('test')
    await input.trigger('keydown.enter')

    // Wait for the search to complete
    await wrapper.vm.$nextTick()
    await flushPromises()

    const resultItem = wrapper.find('.search-result-item')
    await resultItem.trigger('click')

    expect(wrapper.emitted('track-selected')).toBeTruthy()
    expect(wrapper.emitted('track-selected')[0][0]).toEqual(mockResponse[0])
  })

  it('debounces input changes', async () => {
    vi.useFakeTimers()

    fetch.mockResolvedValue({
      ok: true,
      json: async () => []
    })

    const wrapper = mount(TrackSearch, {
      props: {
        isVisible: true
      }
    })

    const input = wrapper.find('.search-input')

    // Type multiple characters quickly
    await input.setValue('t')
    await input.setValue('te')
    await input.setValue('tes')
    await input.setValue('test')

    // Fast-forward time by 299ms (less than debounce time)
    vi.advanceTimersByTime(299)
    expect(fetch).not.toHaveBeenCalled()

    // Fast-forward past debounce time
    vi.advanceTimersByTime(1)
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
