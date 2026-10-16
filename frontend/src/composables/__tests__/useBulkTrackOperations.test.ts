import { describe, it, expect, vi } from 'vitest';
import { http } from '../../http-instance';
import { nextTick, ref } from 'vue';
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

describe('selection scope follows the visible set', () => {
 const setup = (ids: string[], visible: { id: string; is_public: boolean }[]) => {
  const tracks = ref([{ id: 'a', is_public: false }, { id: 'b', is_public: false }]);
  const visibleTracks = ref(visible);
  const selectedIds = ref<string[]>(ids);
  const operations = useBulkTrackOperations({ tracks, visibleTracks, selectedIds, allVisibleSelected: ref(false), someSelected: ref(false), removeTracks: vi.fn(), confirm: vi.fn() });
  return { visibleTracks, selectedIds, operations };
 };

 it('drops selected tracks that the search filter hides', async () => {
  const { visibleTracks, selectedIds } = setup(['a', 'b'], [{ id: 'a', is_public: false }, { id: 'b', is_public: false }]);
  visibleTracks.value = [{ id: 'a', is_public: false }];
  await nextTick();
  expect(selectedIds.value).toEqual(['a']);
 });

 it('clears the selection when the filter hides every selected track', async () => {
  const { visibleTracks, selectedIds } = setup(['b'], [{ id: 'a', is_public: false }, { id: 'b', is_public: false }]);
  visibleTracks.value = [{ id: 'a', is_public: false }];
  await nextTick();
  expect(selectedIds.value).toEqual([]);
 });

 it('keeps the selection while every selected track stays visible', async () => {
  const { visibleTracks, selectedIds } = setup(['a', 'b'], [{ id: 'a', is_public: false }, { id: 'b', is_public: false }]);
  const before = selectedIds.value;
  visibleTracks.value = [{ id: 'a', is_public: false }, { id: 'b', is_public: false }];
  await nextTick();
  expect(selectedIds.value).toBe(before);
 });

 it('leaves the selection untouched when the caller provides no visible set', async () => {
  const selectedIds = ref<string[]>(['a']);
  useBulkTrackOperations({ tracks: ref([{ id: 'a', is_public: false }]), selectedIds, allVisibleSelected: ref(true), someSelected: ref(true), removeTracks: vi.fn(), confirm: vi.fn() });
  selectedIds.value = ['a', 'hidden'];
  await nextTick();
  expect(selectedIds.value).toEqual(['a', 'hidden']);
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
