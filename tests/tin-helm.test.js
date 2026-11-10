import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {tinHelmAssets} from '../src/games/tin-helm-assets.js';
import {tinHelm,tinHelmHeroes,createTinHelmSession,exploreTinHelm,finishTinHelmRoom,nextTinHelmLevel,takeTinHelmComponent,defeatTinHelmEnemy,tinHelmStatus,adjustTinHelmToken,tinHelmAnchors,dropTinHelmToken} from '../src/games/tin-helm.js';
import {createProject,startOpening,openEditor,saveEditorDraft,migrateSession} from '../src/projects.js';
import {validateSession,deckEntries} from '../src/model.js';
import {createHistoryCodec} from '../src/history.js';

const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.thRole===role);
const token=(s,key)=>s.objects.find(o=>o.kind==='th-'+key);
const cards=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]);
const begin=()=>createTinHelmSession(()=>.5,'gnome','alchemist');
const clearLevel=s=>{for(let i=0;i<token(s,'room').thRooms;i++){exploreTinHelm(s,i%2?'skip':'enter');finishTinHelmRoom(s);}};

test('all Chinese components exist with mirrored duplex references and independent bonus rooms',()=>{
  assert.deepEqual(['hero','dungeon','enemy','loot','trapping','reference','track'].map(g=>tinHelmAssets.filter(a=>a.group===g).length),[9,14,8,8,6,4,4]);
  for(const a of tinHelmAssets)for(const file of [a.front,a.back].filter(Boolean))assert.ok(existsSync(new URL('../public'+file,import.meta.url)),file);
  assert.equal(tinHelmAssets.find(a=>a.id==='th-hero-human').job,'alchemist');
  assert.deepEqual(tinHelmAssets.find(a=>a.id==='th-gear-mace').sides,['mace','dagger']);
  assert.ok(tinHelmAssets.find(a=>a.id==='th-room-catacombs').back.endsWith('room-catacombs-back.webp'));
  assert.ok(existsSync(new URL('../public/assets/tin-helm/sheets-zh.pdf',import.meta.url)));
});

test('all 72 allowed race/class combinations conserve physical cards and use printed stats',()=>{
  let count=0;
  for(const r of tinHelmHeroes)for(const j of tinHelmHeroes){
    if(r.id===j.id){assert.throws(()=>createTinHelmSession(()=>.5,r.race,j.job));continue;}
    const s=createTinHelmSession(()=>.5,r.race,j.job);validateSession(s);count++;
    assert.equal(token(s,'health').value,r.hp+j.bonusHp);assert.equal(token(s,'energy').value,r.energy+j.bonusEnergy);assert.equal(token(s,'food').value,r.food);
    assert.equal(new Set(cards(s)).size,cards(s).length);assert.equal(cards(s).length,49);
    assert.equal(pile(s,'dungeon').cards.length,12);assert.equal(pile(s,'bonus-rooms').cards.length,2);
    assert.equal(s.objects.find(o=>o.thRole==='class').faceUp,false);
    if(r.race==='halfling')assert.ok(!pile(s,'loot').cards.includes('th-loot-ring'));
  }
  assert.equal(count,72);
});

test('twelve base openings shuffle only the dungeon and preserve edited fixed order',()=>{
  const project=createProject('tin-helm');assert.equal(project.setupProfiles.length,12);
  for(const p of project.setupProfiles){const s=startOpening(project,p.id,()=>.15);validateSession(s);assert.equal(pile(s,'dungeon').cards.length,12);}
  const editor=openEditor(project),source=pile(editor,'dungeon');source.setupOrder='fixed';source.x=780;
  const saved=saveEditorDraft(editor),opening=startOpening(saved,undefined,()=>.99);
  assert.deepEqual(pile(opening,'dungeon').cards,source.cards);assert.equal(pile(opening,'dungeon').x,780);
});

test('human chooses one physical extra trapping and cannot begin exploration prematurely',()=>{
  const s=createTinHelmSession(()=>.5);assert.throws(()=>exploreTinHelm(s,'enter'));
  const before=cards(s).sort(),id=pile(s,'gear').cards[0];takeTinHelmComponent(s,id,false);
  assert.equal(token(s,'room').thExtra,false);assert.equal(s.objects.find(o=>o.assetId===id)?.faceUp,false);
  assert.deepEqual(cards(s).sort(),before);assert.throws(()=>takeTinHelmComponent(s,pile(s,'gear').cards[0]));exploreTinHelm(s,'enter');
});

test('enter and skip exchange the map and result without exposing or losing unused rooms',()=>{
  for(const choice of ['enter','skip']){
    const s=begin(),before=cards(s).sort(),source=pile(s,'dungeon'),first=source.cards.at(-1),second=source.cards.at(-2);
    exploreTinHelm(s,choice);
    assert.deepEqual(pile(s,'map').cards,[choice==='enter'?first:second]);assert.deepEqual(pile(s,'result').cards,[choice==='enter'?second:first]);
    assert.equal(pile(s,'result').faceUp,false);assert.equal(source.faceUp,true);assert.equal(source.cards.length,10);assert.throws(()=>exploreTinHelm(s,'enter'));
    finishTinHelmRoom(s);assert.equal(token(s,'room').value,1);assert.equal(pile(s,'discard').cards.length,2);assert.deepEqual(cards(s).sort(),before);validateSession(s);
  }
});

test('six rooms descend with food or hunger, and the fifth layer ends the expedition',()=>{
  const s=begin(),before=cards(s).sort();assert.throws(()=>nextTinHelmLevel(s));
  clearLevel(s);nextTinHelmLevel(s,()=>.2);assert.equal(token(s,'level').value,2);assert.equal(token(s,'food').value,0);assert.equal(token(s,'health').value,9);assert.equal(token(s,'room').value,0);
  clearLevel(s);nextTinHelmLevel(s,()=>.2);assert.equal(token(s,'health').value,6);assert.deepEqual(cards(s).sort(),before);
  token(s,'health').value=9;
  clearLevel(s);nextTinHelmLevel(s);clearLevel(s);nextTinHelmLevel(s);clearLevel(s);nextTinHelmLevel(s);
  assert.equal(token(s,'level').value,5);assert.equal(tinHelmStatus(s).outcome,'lost');assert.throws(()=>exploreTinHelm(s,'enter'));
});

test('bonus rooms are explicitly enabled and require seven complete rooms',()=>{
  const s=createTinHelmSession(()=>.5,'orc','oracle',true);assert.equal(pile(s,'dungeon').cards.length,14);assert.equal(pile(s,'bonus-rooms').cards.length,0);
  for(let i=0;i<6;i++){exploreTinHelm(s,'enter');finishTinHelmRoom(s);}assert.throws(()=>nextTinHelmLevel(s));
  exploreTinHelm(s,'skip');finishTinHelmRoom(s);nextTinHelmLevel(s);assert.equal(token(s,'level').value,2);assert.equal(pile(s,'dungeon').cards.length,14);
});

test('enemy HP and rewards follow the card; skipped enemies never get victory rewards',()=>{
  for(const [id,favor,food,shards] of [['rats',1,1,0],['possessor',2,0,1],['mimic',1,0,0]]){
    const s=begin(),f=token(s,'food').value;exploreTinHelm(s,'enter');takeTinHelmComponent(s,'th-enemy-'+id);
    assert.equal(token(s,'enemy').value,tinHelmAssets.find(a=>a.id==='th-enemy-'+id).hp+1);assert.throws(()=>defeatTinHelmEnemy(s));assert.throws(()=>finishTinHelmRoom(s));
    token(s,'enemy').value=0;defeatTinHelmEnemy(s);assert.equal(token(s,'favor').value,favor);assert.equal(token(s,'food').value,f+food);assert.equal(token(s,'shards').value,shards);
    assert.ok(pile(s,'enemies').cards.includes('th-enemy-'+id));finishTinHelmRoom(s);validateSession(s);
  }
});

test('loot is moved only once, and reference score and terminal states follow saved counters',()=>{
  const s=begin(),before=cards(s).sort();takeTinHelmComponent(s,'th-loot-sword');assert.throws(()=>takeTinHelmComponent(s,'th-loot-sword'));assert.deepEqual(cards(s).sort(),before);
  token(s,'shards').value=3;assert.equal(tinHelmStatus(s).outcome,'won');assert.equal(tinHelmStatus(s).score,51);assert.throws(()=>exploreTinHelm(s,'enter'));
  assert.equal(tinHelmStatus(migrateSession(JSON.parse(JSON.stringify(s)))).outcome,'won');
  token(s,'health').value=0;assert.equal(tinHelmStatus(s).outcome,'lost');
});

test('track adjustments clamp to combined stats and drag positions follow rotated mats',()=>{
  const s=begin(),hp=token(s,'health');adjustTinHelmToken(s,hp,100);assert.equal(hp.value,9);adjustTinHelmToken(s,hp,-100);assert.equal(hp.value,0);
  const mat=s.objects.find(o=>o.assetId==='th-track-health');mat.rotation=90;
  const anchor=tinHelmAnchors(s,'health').find(a=>a.value===7);Object.assign(hp,{x:anchor.x+1,y:anchor.y+1});dropTinHelmToken(s,hp);assert.equal(hp.value,7);assert.equal(hp.x,anchor.x);
  adjustTinHelmToken(s,token(s,'food'),50);assert.equal(token(s,'food').value,5);
});

test('locked, missing and contaminated piles reject operations before mutation',()=>{
  for(const corrupt of [s=>pile(s,'result').locked=true,s=>pile(s,'dungeon').cards.push('th-loot-sword'),s=>token(s,'room').locked=true]){
    const s=begin();corrupt(s);const before=structuredClone(s);assert.throws(()=>exploreTinHelm(s,'enter'));assert.deepEqual(s,before);
  }
  const s=begin();clearLevel(s);pile(s,'discard').cards[0]=pile(s,'discard').cards[1];const before=structuredClone(s);assert.throws(()=>nextTinHelmLevel(s));assert.deepEqual(s,before);
  s.mode='edit';assert.throws(()=>exploreTinHelm(s,'enter'));
});

test('history, custom hero reset, and saved opening retain all Tin Helm state',()=>{
  const s=createProject('tin-helm'),codec=createHistoryCodec(),before=codec.capture(s);
  tinHelm.act(s,'th-adventurer','|catfolk|alchemist');validateSession(s);assert.equal(token(s,'health').value,11);
  assert.equal(s.setupProfiles.length,13);assert.equal(s.activeSetupProfileId,'th-custom');
  assert.equal(s.setupProfiles.find(p=>p.id==='th-human-footpad').name,'人类 · 潜行者');
  assert.equal(startOpening(s).objects.find(o=>o.thRole==='race').assetId,'th-hero-catfolk');
  exploreTinHelm(s,'skip');const after=codec.capture(s);
  assert.equal(pile(codec.restore(before),'dungeon').cards.length,12);assert.equal(pile(codec.restore(after),'map').cards.length,1);
  assert.equal(token(codec.restore(after),'room').thChoice,'skip');
  assert.ok(deckEntries(pile(codec.restore(after),'result')).every(a=>!a.faceUp));
});

test('game dialogs escape imported card names and use canonical hero data',()=>{
  const s=begin();s.assets.find(a=>a.id==='th-loot-sword').name='<img src=x onerror=alert(1)>';
  s.assets.find(a=>a.id==='th-hero-gnome').raceName='<svg onload=alert(1)>';
  token(s,'room').thRooms='<svg onload=alert(1)>';token(s,'favor').value='<svg onload=alert(1)>';
  assert.ok(tinHelm.catalog(s).includes('&lt;img'));assert.ok(!tinHelm.journal(s).includes('<svg'));
  assert.ok(!tinHelm.toolbar(s).includes('<svg'));
});
