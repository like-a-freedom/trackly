import {beforeEach,describe,it,expect,vi} from 'vitest';
import {ref} from 'vue';
import {useNicknameEdit} from '../useNicknameEdit';
const http=vi.hoisted(()=>vi.fn());
vi.mock('../../http-instance',()=>({http}));
describe('nickname editing',()=>{
 beforeEach(()=>http.mockReset());
 it('updates the profile through the current public nickname endpoint',async()=>{
   http.mockResolvedValue(new Response(JSON.stringify({nickname:'forest_runner'}),{status:200}));
   const current=ref('old_name');
   const edit=useNicknameEdit(current);
   edit.open(current.value);edit.editValue.value='forest_runner';
   expect(await edit.save()).toBe(true);
   expect(http).toHaveBeenCalledWith('/api/auth/me/nickname',expect.objectContaining({method:'PATCH'}));
   expect(current.value).toBe('forest_runner');
 });
});
