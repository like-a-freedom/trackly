import { describe, it, expect, vi } from 'vitest';
import { http } from '../../http-instance';
import { ref } from 'vue';
import { useBulkTrackOperations } from '../useBulkTrackOperations';
vi.mock('../../http-instance', () => ({ http: vi.fn() }));
describe('bulk selection', () => {
 it('selects only the filtered visible tracks', () => {
  const visible = { id: 'visible', is_public: false };
  const selectedIds = ref<string[]>([]);
  const operations = useBulkTrackOperations({ tracks: ref([visible, { id:'hidden', is_public:false }]), visibleTracks: ref([visible]), selectedIds, allVisibleSelected:ref(false), someSelected:ref(false), removeTracks:vi.fn(), confirm:vi.fn() });
  operations.toggleSelectAll();
  expect(selectedIds.value).toEqual(['visible']);
 });
});

it('retains selection and reports a rejected bulk action', async () => {
 vi.mocked(http).mockResolvedValue({ok:false,status:403} as Response);
 const ids=ref(['one']); const ops=useBulkTrackOperations({tracks:ref([{id:'one',is_public:false}]),selectedIds:ids,allVisibleSelected:ref(true),someSelected:ref(true),removeTracks:vi.fn(),confirm:vi.fn()});
 await ops.bulkToggleVisibility();
 expect(ids.value).toEqual(['one']); expect(ops.error.value).toContain('Could not');
});
