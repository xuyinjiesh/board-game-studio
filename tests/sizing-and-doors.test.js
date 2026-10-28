import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,validateSession,drawFromDeck} from '../src/model.js';
import {createProject,openEditor,saveEditorDraft,startOpening,migrateSession} from '../src/projects.js';
import {resizeObjects,matchObjectSize} from '../src/sizing.js';
import {explore,revealDoor,switchDoor,finishTurn} from '../src/games/iron-helm.js';
const slot=(s,key)=>s.objects.find(o=>o.ihSlot===key);
const inventory=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]).sort();

test('resizing locks proportions by default, can unlock them and rejects an invalid batch atomically',()=>{
  const s=openEditor(createProject('iron-helm')),left=slot(s,'door-a'),right=slot(s,'door-b');
  resizeObjects(s,[left],'width',180);assert.deepEqual(dimensions(s,left),{w:180,h:252});
  left.lockAspect=false;resizeObjects(s,[left],'height',240);assert.deepEqual(dimensions(s,left),{w:180,h:240});
  right.width=20;right.height=2000;const before=structuredClone(s);
  assert.throws(()=>resizeObjects(s,[left,right],'width',200));assert.deepEqual(s,before);
  const invalid=structuredClone(s);slot(invalid,'door-a').lockAspect='yes';assert.throws(()=>validateSession(invalid));
});

test('size matching applies exact reference dimensions to every selection and survives saved openings',()=>{
  const s=openEditor(createProject('iron-helm')),left=slot(s,'door-a'),right=slot(s,'door-b');
  const reference=s.objects.find(o=>o.ihRole==='dungeon');reference.width=130;reference.height=182;
  matchObjectSize(s,[left,right],reference);
  for(const o of [left,right])assert.deepEqual(dimensions(s,o),{w:130,h:182});
  const played=startOpening(migrateSession(JSON.parse(JSON.stringify(saveEditorDraft(s)))));
  for(const key of ['door-a','door-b'])assert.deepEqual(dimensions(played,slot(played,key)),{w:130,h:182});
});

test('exploring fills the edited door slots and switching and finishing empty them without deleting them',()=>{
  let s=openEditor(createProject('iron-helm'));const left=slot(s,'door-a'),right=slot(s,'door-b');
  Object.assign(left,{x:1234,y:789,rotation:30,width:120,height:168});
  Object.assign(right,{x:1456,y:789,rotation:-30,width:120,height:168});
  s=startOpening(s);const initial=inventory(s),ids=['door-a','door-b'].map(key=>slot(s,key).id);
  for(let i=0;i<8;i++){
    explore(s);assert.equal(slot(s,'door-a').cards.length,1);assert.equal(slot(s,'door-b').cards.length,1);
    assert.equal(slot(s,'door-a').faceUp,false);assert.equal(slot(s,'door-b').faceUp,false);
    assert.deepEqual([slot(s,'door-a').x,slot(s,'door-a').y,slot(s,'door-a').rotation],[1234,789,30]);
    revealDoor(s,i%2?'b':'a');if(i%2)switchDoor(s);finishTurn(s);
    for(const key of ['door-a','door-b'])assert.equal(slot(s,key).cards.length,0);
    assert.deepEqual(['door-a','door-b'].map(key=>slot(s,key).id),ids);assert.deepEqual(inventory(s),initial);
  }
});

test('occupied doors reject exploration before consuming source cards and drawn cards retain slot dimensions',()=>{
  const s=createProject('iron-helm'),before=inventory(s);slot(s,'door-b').cards.push(s.objects.find(o=>o.ihRole==='dungeon').cards.pop());
  const snapshot=structuredClone(s);assert.throws(()=>explore(s));assert.deepEqual(s,snapshot);assert.deepEqual(inventory(s),before);
  slot(s,'door-b').width=125;slot(s,'door-b').height=175;
  assert.deepEqual(dimensions(s,drawFromDeck(s,slot(s,'door-b'))),{w:125,h:175});
});

test('version-four saves gain both doors across profiles without moving an adventure in progress',()=>{
  const s=createProject('iron-helm');explore(s);revealDoor(s,'b');const before=inventory(s);s.ironHelmTableVersion=4;
  // Reconstruct the loose door cards used by the old format.
  s.objects=s.objects.map(o=>{if(!o.ihSlot?.startsWith('door-'))return o;const {cards,ihSlot,fixedPosition,maxCards,snapCards,...rest}=o;return {...rest,type:'card',assetId:cards[0]};});
  const first=s.objects.find(o=>o.ihRole==='door-first');first.x=1777;first.y=888;
  for(const setup of [s.initialSetup,...s.setupProfiles.map(p=>p.setup)])setup.objects=setup.objects.filter(o=>!o.ihSlot?.startsWith('door-'));
  const restored=migrateSession(s),held=restored.objects.find(o=>o.id===first.id);
  assert.deepEqual([held.x,held.y,held.faceUp],[1777,888,true]);assert.deepEqual(inventory(restored),before);
  for(const setup of [restored,...restored.setupProfiles.map(p=>p.setup)])for(const key of ['door-a','door-b'])assert.ok(slot(setup,key));
  assert.deepEqual(migrateSession(restored),restored);switchDoor(restored);finishTurn(restored);assert.deepEqual(inventory(restored),before);
});
