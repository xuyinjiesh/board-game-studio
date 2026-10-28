import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroveSession,grove,grovePlacement} from '../src/games/grove.js';
import {baseObject} from '../src/model.js';
import {findCardSnapTarget} from '../src/interactions.js';

function table(x=680,y=380){
  const s=createGroveSession(()=>.5);
  const anchor={...baseObject('card',x,y,1),assetId:'grove-12',faceUp:true};
  const moving={...baseObject('card',x+43,y-77,2),assetId:'grove-9',faceUp:true};
  s.objects=[anchor,moving];return {s,anchor,moving};
}
test('Grove placement aligns tree cells instead of the generic center magnet',()=>{
  const {s,anchor,moving}=table();moving.y=anchor.y-30;
  assert.equal(findCardSnapTarget(s,moving),anchor);
  const before=structuredClone(s),p=grovePlacement(s,moving);
  assert.deepEqual([p.x,p.y,p.rotation],[760,380,0]);
  assert.deepEqual(s,before);
  grove.onDrop(s,moving);assert.deepEqual([moving.x,moving.y],[p.x,p.y]);
  assert.equal(s.objects.length,2);
});
test('quarter turns align every tree center with a moved orchard outside the original zone',()=>{
  for(const rotation of [-90,0,90,180,270,360]){
    const {s,anchor,moving}=table(1187,943);moving.rotation=rotation;
    const p=grovePlacement(s,moving),a=p.rotation*Math.PI/180;
    for(const dx of [-40,40])for(const dy of [-80,0,80]){
      const x=p.x+dx*Math.cos(a)-dy*Math.sin(a),y=p.y+dx*Math.sin(a)+dy*Math.cos(a);
      assert.ok(Math.abs((x-(anchor.x-40))/80-Math.round((x-(anchor.x-40))/80))<1e-8);
      assert.ok(Math.abs((y-anchor.y)/80-Math.round((y-anchor.y)/80))<1e-8);
    }
  }
});
test('staging cards, decks and editor placement remain free',()=>{
  const {s,moving}=table();moving.x=590;moving.y=820;
  assert.equal(grovePlacement(s,moving),null);
  moving.x=680;moving.y=380;s.mode='edit';assert.equal(grovePlacement(s,moving),null);
  s.mode='play';moving.type='deck';assert.equal(grovePlacement(s,moving),null);
});
