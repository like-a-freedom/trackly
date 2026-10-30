import {expect,it} from 'vitest';
import {cinematicProgress, clusterPanProgress} from '../clusterFlight';
it('accelerates gently, peaks halfway and brakes symmetrically',()=>{
 expect(cinematicProgress(0)).toBe(0);
 expect(cinematicProgress(1)).toBe(1);
 expect(cinematicProgress(.5)).toBe(.5);
 expect(cinematicProgress(.1)).toBeLessThan(.02);
 expect(cinematicProgress(.9)).toBeGreaterThan(.98);
 for(let i=1;i<100;i++) expect(cinematicProgress(i/100)).toBeGreaterThan(cinematicProgress((i-1)/100));
});

it('keeps the target moving straight toward the screen center at every zoom',()=>{
 for(const zoomDelta of [0,2,6,11]) {
  let previous = 1;
  for(let i=0;i<=100;i++) {
   const progress = cinematicProgress(i/100);
   const screenOffset = (1-clusterPanProgress(progress,zoomDelta))*2**(zoomDelta*progress);
   expect(screenOffset).toBeCloseTo(1-progress,10);
   expect(screenOffset).toBeLessThanOrEqual(previous+1e-10);
   previous = screenOffset;
  }
 }
});
