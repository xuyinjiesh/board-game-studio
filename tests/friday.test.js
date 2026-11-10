import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject,startOpening,openEditor,saveEditorDraft,migrateSession,createPlaySession} from '../src/projects.js';
import {validateSession,assetFor,deckEntries,appendDeckEntries} from '../src/model.js';
import {createHistoryCodec} from '../src/history.js';
import {fridayAssets} from '../src/games/friday-assets.js';
import {friday,createFridaySession,finishFridayOpening,revealFridayHazards,chooseFridayHazard,drawFridayCard,advanceFridayPhase,chooseFridayPirate,finishFridayBattle,fridayStatus} from '../src/games/friday.js';
const pile=(s,role)=>s.objects.find(o=>o.frRole===role&&o.type==='deck');
const token=(s,key)=>s.objects.find(o=>o.kind==='fr-'+key);
const cards=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]);
const begin=s=>{revealFridayHazards(s);chooseFridayHazard(s,'1');};

test('Friday includes all 72 Chinese cards, three mats, both backs and original rules',()=>{
  const count=group=>fridayAssets.filter(a=>a.group===group).length;
  assert.deepEqual(['starting','aging','hazard','pirate','phase','mat'].map(count),[18,11,30,10,3,3]);
  assert.equal(new Set(fridayAssets.map(a=>a.id)).size,75);
  for(const a of fridayAssets)for(const file of [a.front,a.back].filter(Boolean))assert.ok(existsSync(new URL('../public'+file,import.meta.url)),file);
  assert.ok(existsSync(new URL('../public/assets/friday/rules-zh.pdf',import.meta.url)));
  assert.deepEqual(fridayAssets.filter(a=>a.group==='starting').map(a=>a.fight).sort((a,b)=>a-b),[-1,-1,-1,-1,-1,0,0,0,0,0,0,0,0,0,1,1,1,2]);
  assert.equal(fridayAssets.filter(a=>a.group==='aging'&&a.hard).length,3);
  for(const a of fridayAssets.filter(a=>a.group==='hazard'))assert.equal(a.hazard.length,3);
});

test('four openings preserve card conservation, life totals and aging order across random seeds',()=>{
  for(const random of [()=>0,()=>.5,()=>.99])for(const n of [1,2,3,4]){
    const s=createFridaySession(random,n);validateSession(s);
    assert.equal(pile(s,'draw').cards.length,n===1?18:19);
    assert.equal(pile(s,'aging').cards.length,n===1?10:n===2?9:10);
    assert.equal(token(s,'life').value,n===4?18:20);
    assert.equal(fridayStatus(s).cap,n===4?20:22);
    assert.equal(pile(s,'pirate-1').cards.length,1);assert.equal(pile(s,'pirate-2').cards.length,1);assert.equal(pile(s,'pirate-reserve').cards.length,8);
    const all=cards(s);assert.equal(new Set(all).size,all.length);assert.equal(all.length,n<=2?71:72);
    assert.equal(all.includes('fr-aging-very-stupid'),n>=3);
    assert.ok(pile(s,'aging').cards.slice(0,3).every(id=>assetFor(s,id).hard));
    assert.ok(pile(s,'aging').cards.slice(3).every(id=>!assetFor(s,id).hard));
    const before=structuredClone(s);finishFridayOpening(s,s.initialSetup,random);assert.deepEqual(s,before);
  }
});

test('profile switching, restarting, JSON saves and edited fixed orders remain valid',()=>{
  const project=createProject('friday');assert.equal(project.setupProfiles.length,4);assert.equal(createPlaySession(project,'example:friday').awaitingOpening,true);
  for(const n of [1,2,3,4]){const s=startOpening(project,'fr-level-'+n,()=>.3);assert.equal(token(s,'level').value,n);assert.equal(token(s,'life').value,n===4?18:20);assert.equal(pile(s,'draw').cards.length,n===1?18:19);assert.deepEqual(migrateSession(JSON.parse(JSON.stringify(s))).objects,s.objects);}
  const editor=openEditor(project),draw=pile(editor,'draw'),pirate=pile(editor,'pirate-1');
  draw.setupOrder='fixed';pirate.setupOrder='fixed';draw.x=240;
  const saved=saveEditorDraft(editor),opened=startOpening(saved,undefined,()=>.1);
  assert.deepEqual(pile(opened,'draw').cards,draw.cards);assert.equal(pile(opened,'draw').x,240);assert.deepEqual(pile(opened,'pirate-1').cards,pirate.cards);
});

test('hazards reveal two, keep the choice and discard the unchosen without duplication',()=>{
  const s=createFridaySession(()=>.5),before=cards(s).sort();revealFridayHazards(s);
  const chosen=pile(s,'choice-2').cards[0],other=pile(s,'choice-1').cards[0];
  assert.throws(()=>revealFridayHazards(s));assert.throws(()=>chooseFridayHazard(s,'skip'));
  chooseFridayHazard(s,'2');assert.deepEqual(pile(s,'active').cards,[chosen]);assert.deepEqual(pile(s,'hazard-discard').cards,[other]);
  assert.equal(pile(s,'hazard').cards.length,28);assert.deepEqual(cards(s).sort(),before);
});

test('a lone last hazard may be skipped and the next stage shuffles only hazard discards',()=>{
  const s=createFridaySession(()=>.5),source=pile(s,'hazard'),discard=pile(s,'hazard-discard');
  discard.cards=source.cards.splice(0,29);revealFridayHazards(s);chooseFridayHazard(s,'skip');
  const fight=[...pile(s,'draw').cards],aging=[...pile(s,'aging').cards];
  advanceFridayPhase(s,()=>.3);assert.equal(token(s,'phase').value,2);assert.equal(source.cards.length,30);assert.equal(discard.cards.length,0);
  assert.equal(pile(s,'phase').cards.at(-1),'fr-phase-yellow');assert.deepEqual(pile(s,'draw').cards,fight);assert.deepEqual(pile(s,'aging').cards,aging);
});

test('drawing the last combat card does not refill until another draw is requested',()=>{
  const s=createFridaySession(()=>.5);begin(s);
  const draw=pile(s,'draw'),discard=pile(s,'discard'),aging=pile(s,'aging');
  discard.cards=draw.cards.splice(0,17);const expected=aging.cards.at(-1),before=aging.cards.length;
  drawFridayCard(s,()=>.5);assert.equal(draw.cards.length,0);assert.equal(aging.cards.length,before);
  const first=s.objects.find(o=>o.frRole==='combat').id;
  drawFridayCard(s,()=>.5);assert.equal(draw.cards.length,17);assert.equal(discard.cards.length,0);assert.equal(aging.cards.length,before-1);
  assert.ok(s.objects.some(o=>o.id===first));assert.ok(cards(s).includes(expected));
  assert.ok(deckEntries(draw).every(c=>!c.faceUp));assert.equal(s.objects.filter(o=>o.frRole==='combat').length,2);
});

test('an exhausted aging deck still permits refilling combat discards',()=>{
  const s=createFridaySession(()=>.5);begin(s);pile(s,'removed').cards=pile(s,'aging').cards.splice(0);
  pile(s,'discard').cards=pile(s,'draw').cards.splice(0);drawFridayCard(s,()=>.5);
  assert.equal(pile(s,'draw').cards.length,17);assert.equal(pile(s,'aging').cards.length,0);
});

test('won hazards become knowledge and destroyed cards stay removed',()=>{
  const s=createFridaySession(()=>.5);begin(s);const opponent=pile(s,'active').cards[0];
  drawFridayCard(s);drawFridayCard(s);const combat=s.objects.filter(o=>o.frRole==='combat'),destroyed=combat[0];
  appendDeckEntries(pile(s,'removed'),[{assetId:destroyed.assetId,faceUp:true}]);s.objects=s.objects.filter(o=>o.id!==destroyed.id);
  const expected=[combat[1].assetId,opponent];finishFridayBattle(s,true);
  assert.deepEqual(pile(s,'discard').cards,expected);assert.deepEqual(pile(s,'removed').cards,[destroyed.assetId]);assert.equal(s.objects.some(o=>o.frRole==='combat'),false);
});

test('losing discards the hazard and leaves the manually settled life total unchanged',()=>{
  const s=createFridaySession(()=>.5);begin(s);drawFridayCard(s);
  const opponent=pile(s,'active').cards[0];token(s,'life').value=15;finishFridayBattle(s,false);
  assert.equal(token(s,'life').value,15);assert.equal(pile(s,'hazard-discard').cards.at(-1),opponent);assert.equal(pile(s,'discard').cards.length,1);
});

test('all three phases lead to two compulsory pirate victories and a scored finish',()=>{
  const s=createFridaySession(()=>.5);
  for(let phase=1;phase<=3;phase++){
    while(pile(s,'hazard').cards.length){revealFridayHazards(s);chooseFridayHazard(s,'1');drawFridayCard(s,()=>.5);finishFridayBattle(s,true);}
    advanceFridayPhase(s,()=>.5);
  }
  assert.equal(token(s,'phase').value,4);assert.equal(pile(s,'phase').cards.length,0);assert.ok(pile(s,'hazard-discard').cards.length>0);
  assert.throws(()=>revealFridayHazards(s));chooseFridayPirate(s,'2');assert.equal(pile(s,'active').width,254);
  assert.throws(()=>finishFridayBattle(s,false));drawFridayCard(s,()=>.5);finishFridayBattle(s,true);
  chooseFridayPirate(s,'1');drawFridayCard(s,()=>.5);finishFridayBattle(s,true);
  const v=fridayStatus(s);assert.equal(v.won,true);assert.equal(v.defeated,2);assert.ok(Number.isFinite(v.score));validateSession(s);
});

test('life controls permit zero, enforce the actual token supply and reject unpaid costs',()=>{
  const s=createFridaySession(()=>.5,4),life=token(s,'life');life.value=20;
  friday.act(s,'fr-life','1');assert.equal(life.value,20);life.value=1;friday.act(s,'fr-life','-1');assert.equal(life.value,0);
  const before=structuredClone(s);assert.throws(()=>friday.act(s,'fr-life','-1'));assert.deepEqual(s,before);friday.act(s,'fr-life','1');assert.equal(life.value,1);
  const custom={kind:'custom-counter',value:0};friday.adjustToken(s,custom,-1);assert.equal(custom.value,-1);
});

test('locked or contaminated sources reject helper actions before changing state',()=>{
  for(const corrupt of [s=>pile(s,'choice-2').locked=true,s=>pile(s,'hazard').cards.push('fr-start-1')]){
    const s=createFridaySession(()=>.5);corrupt(s);const before=structuredClone(s);assert.throws(()=>revealFridayHazards(s));assert.deepEqual(s,before);
  }
  const s=createFridaySession(()=>.5);begin(s);pile(s,'draw').cards=[];pile(s,'discard').locked=true;
  const before=structuredClone(s);assert.throws(()=>drawFridayCard(s));assert.deepEqual(s,before);
  s.mode='edit';assert.throws(()=>advanceFridayPhase(s));assert.throws(()=>drawFridayCard(s));
});

test('history restores a whole helper action including all piles and counters',()=>{
  const s=createFridaySession(()=>.5),codec=createHistoryCodec(),before=codec.capture(s);
  begin(s);drawFridayCard(s);token(s,'life').value=18;const after=codec.capture(s);
  assert.equal(pile(codec.restore(before),'hazard').cards.length,30);assert.equal(fridayStatus(codec.restore(before)).life,20);
  assert.equal(codec.restore(after).objects.filter(o=>o.frRole==='combat').length,1);assert.equal(fridayStatus(codec.restore(after)).life,18);
});
