import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,startOpening,migrateSession,openEditor,saveEditorDraft} from '../src/projects.js';
import {validateSession,drawFromDeck,objectsInRect} from '../src/model.js';
import {findCardSnapTarget} from '../src/interactions.js';
import {handCards,leaveHand,insertHandCard,sortHand,handFan} from '../src/hands.js';
import {redealNorthwood,prepareNorthwoodSession} from '../src/games/for-northwood.js';
const fresh=()=>startOpening(createProject('for-northwood'),'nw-intro',()=>.45);

test('hand membership survives openings, import, editor round trips and redealing without duplicating cards',()=>{
  const s=fresh(),cards=handCards(s);
  assert.equal(cards.length,8);assert.deepEqual(cards.map(o=>o.handOrder),[0,1,2,3,4,5,6,7]);
  const ids=cards.map(o=>o.id);sortHand(s,'number');
  const imported=migrateSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(handCards(imported).map(o=>o.id),handCards(s).map(o=>o.id));
  const saved=saveEditorDraft(openEditor(imported)),again=startOpening(saved,'nw-intro',()=>.3);
  assert.equal(handCards(again).length,8);assert.ok(handCards(again).every(o=>!ids.includes(o.id)));
  redealNorthwood(imported,()=>.3);assert.equal(handCards(imported).length,8);
  assert.equal(imported.objects.flatMap(o=>o.type==='deck'?o.cards:o.assetId?[o.assetId]:[]).length,65);
  validateSession(imported);validateSession(again);
});

test('dragging cards out and inserting them back preserves identity, faces and card conservation',()=>{
  const s=fresh(),card=handCards(s)[3],id=card.id,assetId=card.assetId;
  card.faceUp=false;assert.equal(leaveHand(s,card),true);assert.equal(handCards(s).length,7);
  assert.equal(card.handId,undefined);assert.equal(card.handOrder,undefined);
  assert.equal(insertHandCard(s,card,0),true);assert.equal(handCards(s)[0].id,id);
  assert.equal(card.assetId,assetId);assert.equal(card.faceUp,false);assert.equal(handCards(s).length,8);
  const draw=s.objects.find(o=>o.nwRole==='dialogue-draw'),extra=drawFromDeck(s,draw,true,draw);
  assert.equal(insertHandCard(s,extra,3),true);assert.equal(handCards(s).length,9,'abilities can exceed the reference capacity');
  assert.equal(handCards(s)[3].id,extra.id);validateSession(s);
});

test('reordering and sorting only affect hand order; locked cards and wrong groups cannot enter or leave',()=>{
  const s=fresh(),cards=handCards(s),snapshot=s.objects.map(o=>[o.id,o.x,o.y,o.rotation,o.faceUp]);
  insertHandCard(s,cards[0],7);assert.equal(handCards(s).at(-1).id,cards[0].id);
  sortHand(s,'number');
  const values=handCards(s).map(o=>s.assets.find(a=>a.id===o.assetId).number);
  assert.deepEqual(values,[...values].sort((a,b)=>a-b));
  sortHand(s,'suit');
  const suits=handCards(s).map(o=>s.handZone.suits.indexOf(s.assets.find(a=>a.id===o.assetId).suit));
  assert.deepEqual(suits,[...suits].sort((a,b)=>a-b));
  assert.deepEqual(s.objects.map(o=>[o.id,o.x,o.y,o.rotation,o.faceUp]),snapshot);
  const ally=s.objects.find(o=>o.nwRole==='ally');assert.equal(insertHandCard(s,ally),false);
  cards[0].locked=true;assert.equal(leaveHand(s,cards[0]),false);assert.equal(insertHandCard(s,cards[0],0),false);
});

test('screen-space hands cannot become invisible table selection or snapping targets',()=>{
  const s=fresh(),card=handCards(s)[0];card.snapCards=true;
  const ruler=s.objects.find(o=>o.nwRole==='ruler');ruler.x=card.x;ruler.y=card.y;
  assert.ok(!objectsInRect(s,{left:-10000,right:10000,top:-10000,bottom:10000}).some(o=>o.handId));
  assert.notEqual(findCardSnapTarget(s,ruler)?.id,card.id);
  s.mode='edit';assert.ok(objectsInRect(s,{left:-10000,right:10000,top:-10000,bottom:10000}).some(o=>o.id===card.id));
});

test('fan layout stays centered, overlaps cards, curves upward and fits narrow and large hands',()=>{
  for(const count of [0,1,4,8,12,32])for(const width of [288,358,720]){
    const fan=handFan(count,width);assert.equal(fan.length,count);
    if(!count)continue;
    assert.ok(Math.abs(fan[0].x+fan.at(-1).x)<.0001);
    assert.ok(fan.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.angle)<=7));
    assert.ok(fan.at(-1).x+fan.at(-1).width/2<=width/2);
    if(count>1){assert.ok(fan[1].x-fan[0].x<fan[0].width);assert.ok(fan[0].angle<0&&fan.at(-1).angle>0);}
    if(count>2)assert.ok(fan[0].y>fan[Math.floor(count/2)].y);
  }
});

test('legacy hand migration only takes cards in the authored hand row and runs once',()=>{
  const s=fresh();delete s.handZone;delete s.northwoodHandVersion;
  for(const objects of [s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)])for(const o of objects){delete o.handId;delete o.handOrder;}
  const loose=s.objects.find(o=>o.nwRole==='hand');loose.y=450;
  const before=[loose.x,loose.y,loose.faceUp];
  prepareNorthwoodSession(s);assert.equal(handCards(s).length,7);assert.equal(loose.handId,undefined);
  assert.deepEqual([loose.x,loose.y,loose.faceUp],before);
  const snapshot=structuredClone(s);prepareNorthwoodSession(s);assert.deepEqual(s,snapshot);
  assert.equal(handCards(startOpening(s,'nw-full')).length,8);validateSession(s);
});

test('invalid hand configuration, memberships and ordering cannot enter imported sessions',()=>{
  for(const corrupt of [s=>s.handZone.capacity=0,s=>s.handZone.suits=[1],s=>handCards(s)[0].handId='missing',s=>handCards(s)[0].handOrder=-1,s=>handCards(s)[0].handOrder=.5,s=>s.objects.find(o=>o.type==='deck').handId='nw-hand']){
    const s=fresh();corrupt(s);assert.throws(()=>validateSession(s));
  }
});
