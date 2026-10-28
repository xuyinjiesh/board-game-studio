import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,openEditor,saveEditorDraft,startOpening,migrateSession,gameFor} from '../src/projects.js';
import {createFixedPile,drawFromDeck,deckEntries,validateSession} from '../src/model.js';
import {cardDropPlan,snapCardOnto} from '../src/interactions.js';
import {pileSettingsHTML} from '../src/opening-editor.js';
const cards=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]).sort();

test('the same generic slot receives cards in Grove and Iron Helm before game placement rules',()=>{
  for(const gameId of ['grove','iron-helm']){
    const s=createProject(gameId),before=cards(s),source=s.objects.find(o=>o.type==='deck'&&o.cards.length>1);
    const card=drawFromDeck(s,source),slot=createFixedPile(680,380);s.objects.push(slot);card.x=slot.x;card.y=slot.y;
    const plan=cardDropPlan(s,card,[card.id],{placementFor:gameFor(gameId).cardPlacement});
    assert.equal(plan.target,slot);assert.equal(plan.placement,null);
    const face=card.faceUp;assert.equal(snapCardOnto(s,card,plan.target),true);
    assert.deepEqual(deckEntries(slot),[{assetId:card.assetId,faceUp:face}]);assert.deepEqual(cards(s),before);
    assert.deepEqual(validateSession(s),s);
  }
});

test('Grove keeps tree alignment for loose orchard cards and offers generic pile settings for generated openings',()=>{
  const editor=openEditor(createProject('grove')),slot=editor.objects.find(o=>o.type==='deal'&&o.layout==='deck');
  assert.match(pileSettingsHTML(editor,slot),/data-pile="fixedPosition"/);assert.match(pileSettingsHTML(editor,slot),/data-pile="snapCards"/);
  Object.assign(slot,{fixedPosition:false,snapCards:false,maxCards:10,width:125,height:175,x:1111,y:777});
  const played=startOpening(saveEditorDraft(editor),undefined,()=>0),generated=played.objects.find(o=>o.type==='deck'&&o.name===slot.name);
  assert.deepEqual([generated.fixedPosition,generated.snapCards,generated.maxCards,generated.width,generated.height,generated.x,generated.y],[false,false,10,125,175,1111,777]);
  const s=createProject('grove'),card=s.objects.find(o=>o.type==='card'&&!o.planted),anchor=s.objects.find(o=>o.planted);card.x=anchor.x+20;card.y=anchor.y;
  const plan=cardDropPlan(s,card,[card.id],{placementFor:gameFor('grove').cardPlacement});assert.ok(plan.placement);assert.equal(plan.target,null);
});

test('Grove built-in piles share fixed-slot defaults across fresh and authored openings',()=>{
  const s=createProject('grove'),played=startOpening(openEditor(s));
  for(const current of [s,played])for(const pile of current.objects.filter(o=>o.type==='deck')){
    assert.equal(pile.fixedPosition,true);assert.equal(pile.snapCards,true);assert.equal(pile.maxCards,500);
  }
  const editor=openEditor(s),slot=editor.objects.find(o=>o.type==='deal'&&o.layout==='deck');slot.maxCards=1;
  assert.throws(()=>saveEditorDraft(editor),/容量/);
});

test('legacy Grove defaults upgrade once without resetting explicit settings, layouts or progress',()=>{
  const s=createProject('grove');delete s.grovePileVersion;
  for(const objects of [s.objects,s.initialSetup.objects])for(const o of objects)if(o.type==='deck'||o.type==='deal'&&o.layout==='deck'){delete o.fixedPosition;delete o.snapCards;delete o.maxCards;}
  const pile=s.objects.find(o=>o.type==='deck');Object.assign(pile,{x:999,y:888,width:125,height:175,fixedPosition:false,snapCards:false,maxCards:20});
  const before=cards(s),restored=migrateSession(s),held=restored.objects.find(o=>o.id===pile.id);
  assert.deepEqual([held.x,held.y,held.width,held.height,held.fixedPosition,held.snapCards,held.maxCards],[999,888,125,175,false,false,20]);
  assert.equal(restored.objects.filter(o=>o.type==='deck')[1].fixedPosition,true);assert.deepEqual(cards(restored),before);assert.deepEqual(migrateSession(restored),restored);
});
