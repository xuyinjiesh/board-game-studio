import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createFixedPile,baseObject,canMoveObject,drawFromDeck,mergeCards,validateSession,dimensions} from '../src/model.js';
import {findCardSnapTarget,snapCardOnto} from '../src/interactions.js';
import {saveEditorDraft,startOpening,copyProject,migrateSession,openEditor,createProject} from '../src/projects.js';
import {ironHelmAssets} from '../src/games/iron-helm-assets.js';
import {pileSettingsHTML,openingChoicesHTML} from '../src/opening-editor.js';
function fixture(){const s=createSession();s.assets=structuredClone(ironHelmAssets);s.mode='play';const slot=createFixedPile(300,400);slot.rotation=30;const card={...baseObject('card',302,405,10),assetId:'ih-hero-1',faceUp:true};s.objects=[slot,card];return {s,slot,card};}

test('fixed piles receive a dragged card, enforce capacity and remain when the card is removed',()=>{
  const {s,slot,card}=fixture();
  assert.equal(canMoveObject(slot),false);assert.equal(canMoveObject(slot,'edit'),true);
  assert.equal(findCardSnapTarget(s,card),slot);assert.equal(snapCardOnto(s,card,slot),true);
  assert.deepEqual(slot.cards,['ih-hero-1']);assert.equal(s.objects.includes(card),false);
  const extra={...card,id:'extra'};s.objects.push(extra);
  assert.equal(findCardSnapTarget(s,extra),null);assert.equal(snapCardOnto(s,extra,slot),false);
  assert.equal(mergeCards(s,[slot.id,extra.id]),null);
  const drawn=drawFromDeck(s,slot);
  assert.deepEqual(slot.cards,[]);assert.deepEqual(dimensions(s,drawn),dimensions(s,slot));
  assert.equal(drawn.rotation,30);assert.equal(s.objects.includes(slot),true);
  slot.snapCards=false;assert.equal(findCardSnapTarget(s,drawn,[drawn.id,extra.id]),null);
});

test('fixed pile settings survive editing, play resets, copies and imports without being repositioned',()=>{
  const {s,slot}=fixture();s.mode='edit';slot.x=712;slot.y=815;slot.width=120;slot.height=170;slot.maxCards=3;slot.snapCards=false;slot.name='自定义牌位';
  const saved=saveEditorDraft(s);
  for(const current of [startOpening(saved),copyProject(saved),migrateSession(JSON.parse(JSON.stringify(saved)))]){
    const restored=current.objects.find(o=>o.type==='deck');
    assert.deepEqual([restored.x,restored.y,restored.width,restored.height,restored.maxCards,restored.snapCards],[712,815,120,170,3,false]);
    assert.match(pileSettingsHTML(openEditor(current),restored),/牌堆与吸附/);
  }
  const bad=structuredClone(saved);bad.objects[0].maxCards=0;assert.throws(()=>validateSession(bad));
});

test('direct dealing and merging cannot exceed a destination capacity or consume rejected cards',()=>{
  const {s,slot,card}=fixture();slot.cards=['ih-hero-2'];
  const source={...baseObject('deck',100,100),cards:['ih-hero-3'],drawTarget:{mode:'deck',deckKey:'slot'}};
  slot.drawKey='slot';s.objects.push(source);const before=structuredClone(s);
  assert.throws(()=>drawFromDeck(s,source));assert.deepEqual(s,before);
  assert.throws(()=>drawFromDeck(s,source,true,{deck:slot}));assert.deepEqual(s,before);
  assert.equal(mergeCards(s,[slot.id,card.id]),null);assert.deepEqual(s,before);
});

test('Iron Helm uses editable generic piles and old tables gain slots once without losing cards',()=>{
  const s=createProject('iron-helm');
  assert.equal(s.objects.filter(o=>o.ihSlot).length,9);
  assert.equal(s.objects.find(o=>o.ihSlot==='hero').maxCards,1);
  assert.doesNotMatch(openingChoicesHTML(s),/生命 |能量 /);
  const legacy=structuredClone(s);legacy.ironHelmTableVersion=3;
  legacy.objects=legacy.objects.filter(o=>!o.ihSlot||o.cards.length).map(o=>{
    if(!o.ihSlot)return o;const {cards,ihSlot,maxCards,snapCards,fixedPosition,...rest}=o;return {...rest,type:'card',assetId:cards[0]};
  });
  const count=t=>t.objects.reduce((n,o)=>n+(o.type==='deck'?o.cards.length:o.type==='card'?1:0),0);
  const restored=migrateSession(legacy);assert.equal(count(restored),count(legacy));
  assert.equal(restored.objects.filter(o=>o.ihSlot).length,9);
  const head=restored.objects.find(o=>o.ihSlot==='head');head.x=777;head.fixedPosition=false;
  const again=migrateSession(restored);assert.equal(again.objects.find(o=>o.id===head.id).x,777);assert.equal(again.objects.find(o=>o.id===head.id).fixedPosition,false);
});
