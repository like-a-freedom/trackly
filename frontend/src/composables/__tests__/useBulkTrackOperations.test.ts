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

it('sends selected IDs to the current account bulk endpoints',async()=>{
 vi.mocked(http).mockClear();
 vi.mocked(http).mockResolvedValue(new Response(JSON.stringify({updated:[{id:"one",is_public:true}],count:1}),{status:200}));
 const ids=ref(['one']); const remove=vi.fn(); const tracks=ref([{id:'one',is_public:false}]);
 const ops=useBulkTrackOperations({tracks,selectedIds:ids,allVisibleSelected:ref(true),someSelected:ref(true),removeTracks:remove,confirm:vi.fn().mockResolvedValue(true)});
 await ops.bulkToggleVisibility();
 expect(http).toHaveBeenCalledWith('/api/account/tracks/bulk/visibility',expect.objectContaining({method:'PATCH',body:JSON.stringify({track_ids:['one']})}));
 expect(tracks.value[0].is_public).toBe(true);
 vi.mocked(http).mockResolvedValue(new Response(JSON.stringify({deleted:['one'],count:1}),{status:200}));
 ids.value=['one']; await ops.bulkDelete();
 expect(http).toHaveBeenCalledWith('/api/account/tracks/bulk',expect.objectContaining({method:'DELETE'}));
 expect(remove).toHaveBeenCalledWith(['one']);
});
