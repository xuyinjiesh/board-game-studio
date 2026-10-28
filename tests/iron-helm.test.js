import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {ironHelmAssets} from '../src/games/iron-helm-assets.js';
import {createIronHelmSession,HEROES,value,changeValue,explore,revealDoor,switchDoor,finishTurn,nextLevel,takeFromCatalog,act,ironHelm,toolbar,journal} from '../src/games/iron-helm.js';
import {ironHelmTableAssets,matPoint} from '../src/games/iron-helm-table.js';
import {validateSession,applySetup,dimensions,drawFromDeck,canMoveObject,objectsInRect,mergeCards} from '../src/model.js';
import {createProject,copyProject,migrateSession,gameFor} from '../src/projects.js';
const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.ihRole===role);
const cards=s=>s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]).sort();
const all=ironHelmAssets.map(a=>a.id).sort();
const complete=s=>{explore(s);revealDoor(s,'a');finishTurn(s);};

test('only the complete base set is registered, with local front and back images',()=>{
  const counts=Object.fromEntries([...new Set(ironHelmAssets.map(a=>a.group))].map(group=>[group,ironHelmAssets.filter(a=>a.group===group).length]));
  assert.deepEqual(counts,{hero:4,boss:3,dungeon:16,enemy:18,loot:18,potion:10,plot:9,skill:12,trapping:14,track:2,blessing:12});
  assert.equal(new Set(all).size,118);
  for(const a of ironHelmAssets){assert.ok(a.sourcePage<=23);for(const url of [a.front,a.back])assert.ok(existsSync(new URL('../public'+url,import.meta.url)),url);}
  assert.equal(gameFor(createProject('iron-helm').gameId).id,'iron-helm');
});
test('all four heroes have unique, conserved cards and their own starting resources',()=>{
  for(const h of HEROES){
    const s=createIronHelmSession(()=>.3,h.id);
    assert.deepEqual(cards(s),all);assert.equal(value(s,'health'),h.health);assert.equal(value(s,'energy'),h.energy);assert.equal(value(s,'gold'),h.gold);assert.equal(value(s,'rations'),h.rations);
    assert.equal(s.objects.find(o=>o.ihRole==='hero').cards.at(-1),`ih-hero-${h.id}`);
    assert.deepEqual(s.objects.filter(o=>o.ihRole==='inventory').map(o=>o.cards.at(-1)),h.items.map(n=>`ih-trapping-${n}`));
    assert.deepEqual(validateSession(s),s);
  }
});
test('exploration never reveals the unchosen door, counts eight turns, and preserves all cards',()=>{
  const s=createIronHelmSession(()=>.2);
  for(let turn=0;turn<8;turn++){
    explore(s);const a=s.objects.find(o=>o.ihRole==='door-a'),b=s.objects.find(o=>o.ihRole==='door-b');
    assert.equal(a.faceUp,false);assert.equal(b.faceUp,false);assert.throws(()=>explore(s));
    revealDoor(s,turn%2?'b':'a');assert.equal(s.objects.filter(o=>/^door-/.test(o.ihRole||'')&&o.faceUp).length,1);
    if(turn%2){switchDoor(s);assert.throws(()=>switchDoor(s));}
    finishTurn(s);assert.equal(value(s,'turn'),turn+1);assert.deepEqual(cards(s),all);
  }
  assert.equal(pile(s,'dungeon').cards.length,0);assert.equal(pile(s,'dungeon-discard').cards.length,16);assert.throws(()=>explore(s));
});
test('next level feeds, grows poison, reshuffles dungeon, and draws exactly one plot',()=>{
  const s=createIronHelmSession(()=>.2);for(let i=0;i<8;i++)complete(s);
  changeValue(s,'poison',3);nextLevel(s,()=>.4);
  assert.equal(value(s,'rations'),0);assert.equal(value(s,'poison'),4);assert.equal(value(s,'health'),14);assert.equal(value(s,'level'),2);assert.equal(value(s,'turn'),0);
  assert.equal(pile(s,'dungeon').cards.length,16);assert.equal(pile(s,'plot').cards.length,8);assert.equal(s.objects.filter(o=>o.ihRole==='plot-active').length,1);assert.deepEqual(cards(s),all);
  for(let i=0;i<8;i++)complete(s);nextLevel(s);
  assert.equal(value(s,'health'),11);assert.equal(value(s,'poison'),6);
});
test('poison death at level end stops before advancing or drawing a new plot',()=>{
  const s=createIronHelmSession();for(let i=0;i<8;i++)complete(s);
  changeValue(s,'health',-10);changeValue(s,'poison',3);
  assert.match(nextLevel(s),/倒下/);assert.equal(value(s,'level'),1);assert.equal(pile(s,'plot').cards.length,9);assert.throws(()=>explore(s));
});
test('buying starting equipment charges once; learning spends the correct enemy cards',()=>{
  const s=createIronHelmSession();takeFromCatalog(s,'ih-trapping-5');assert.equal(value(s,'gold'),1);assert.throws(()=>takeFromCatalog(s,'ih-trapping-5'));
  assert.throws(()=>takeFromCatalog(s,'ih-trapping-11'));
  const grave=pile(s,'enemy-discard');grave.cards.push(...pile(s,'enemy').cards.splice(-3));
  takeFromCatalog(s,'ih-skill-5');assert.equal(grave.cards.length,0);assert.equal(pile(s,'spent').cards.length,3);
  assert.throws(()=>takeFromCatalog(s,'ih-skill-1'));assert.deepEqual(cards(s),all);
  complete(s);assert.throws(()=>takeFromCatalog(s,'ih-trapping-6'));
});
test('alchemy chooses exactly two starting potions before exploration',()=>{
  const s=createIronHelmSession(()=>.5,'2');assert.throws(()=>explore(s));
  takeFromCatalog(s,'ih-potion-3');takeFromCatalog(s,'ih-potion-1');assert.throws(()=>takeFromCatalog(s,'ih-potion-4'));
  assert.equal(pile(s,'potion').cards.length,8);explore(s);assert.deepEqual(cards(s),all);
});
test('archiving plot adds eyes once, enemies remain available for experience',()=>{
  const s=createIronHelmSession();act(s,'draw','plot');const plot=s.objects.find(o=>o.ihRole==='plot-active');
  const eyes=ironHelmAssets.find(a=>a.id===plot.assetId).eyes;
  act(s,'discard','',[plot.id]);assert.equal(value(s,'eyes'),eyes);assert.throws(()=>act(s,'discard','',[plot.id]));
  act(s,'draw','enemy');const enemy=s.objects.find(o=>o.ihRole==='drawn');act(s,'discard','',[enemy.id]);assert.equal(pile(s,'enemy-discard').cards.length,1);assert.deepEqual(cards(s),all);
});
test('mid-decision saves survive import, copy, and setup resets without cross-shuffling',()=>{
  const s=createIronHelmSession(()=>.2);explore(s);revealDoor(s,'b');
  const restored=migrateSession(JSON.parse(JSON.stringify(s))),copy=copyProject(restored);
  switchDoor(copy);finishTurn(copy);assert.deepEqual(cards(copy),all);assert.equal(value(s,'turn'),0);
  const reset=applySetup(copy,copy.initialSetup,()=>.6);assert.deepEqual(cards(reset),all);
  for(const group of ['enemy','dungeon','potion','loot','plot'])assert.ok(pile(reset,group).cards.every(n=>n.startsWith(`ih-${group}-`)));
  assert.equal(value(reset,'turn'),0);assert.equal(reset.objects.find(o=>o.kind==='ih-turn').phase,'ready');assert.deepEqual(validateSession(reset),reset);
});
test('blessings stay face down, square tiles keep their own dimensions, and health caps at the hero maximum',()=>{
  const s=createIronHelmSession();act(s,'draw','blessing');const b=s.objects.find(o=>o.ihRole==='blessing-owned');
  assert.equal(b.faceUp,false);assert.deepEqual(dimensions(s,b),{w:58,h:58});
  changeValue(s,'health',100);changeValue(s,'energy',100);changeValue(s,'morality',-100);
  assert.equal(value(s,'health'),14);assert.equal(value(s,'energy'),11);assert.equal(value(s,'morality'),-5);
  assert.deepEqual(cards(s),all);const bad=structuredClone(s);bad.objects.find(o=>o.type==='token').value=NaN;assert.throws(()=>validateSession(bad));
});

test('playmat and square markers have bundled assets and survive setup reset',()=>{
  const s=createIronHelmSession(),board=s.objects.find(o=>o.type==='board');
  assert.equal(board.assetId,'ih-playmat');assert.equal(board.locked,true);
  assert.ok(Math.abs(board.width/board.height-780/320)<.001);
  for(const a of ironHelmTableAssets)assert.ok(existsSync(new URL('../public'+a.front,import.meta.url)),a.front);
  for(const o of s.objects.filter(o=>o.type==='token')){
    const {w,h}=dimensions(s,o);assert.equal(w,h);assert.ok(w<=48);assert.ok(s.assets.some(a=>a.id===o.assetId));
  }
  const deck=pile(s,'enemy'),drawn=drawFromDeck(s,deck);assert.deepEqual(dimensions(s,drawn),dimensions(s,deck));
  assert.deepEqual(cards(applySetup(s)),all);assert.deepEqual(validateSession(s),s);
});

test('moving a marker to a printed value updates its counter, with hero caps and transformed boards',()=>{
  const s=createIronHelmSession(),health=s.objects.find(o=>o.kind==='ih-health');
  Object.assign(health,matPoint(s,625,245));ironHelm.onTokenDrop(s,health);
  assert.equal(health.value,8);
  changeValue(s,'health',1);assert.deepEqual({x:health.x,y:health.y},matPoint(s,649,245));
  Object.assign(health,matPoint(s,697,272));ironHelm.onTokenDrop(s,health);assert.equal(health.value,14);
  const board=s.objects.find(o=>o.type==='board');board.rotation=90;board.width=1000;board.height=1000*320/780;
  Object.assign(health,matPoint(s,673,218));ironHelm.onTokenDrop(s,health);assert.equal(health.value,3);
  health.x=-1000;health.y=-1000;ironHelm.onTokenDrop(s,health);assert.equal(health.value,3);
});

test('legacy iron helm saves gain the mat once without losing cards, counters or door decisions',()=>{
  const s=createIronHelmSession();explore(s);revealDoor(s,'b');changeValue(s,'health',-4);
  delete s.ironHelmTableVersion;s.assets=s.assets.filter(a=>!ironHelmTableAssets.some(b=>b.id===a.id));
  s.objects=s.objects.filter(o=>o.type!=='board');s.initialSetup.objects=s.initialSetup.objects.filter(o=>o.type!=='board');
  const restored=migrateSession(s);assert.equal(value(restored,'health'),10);assert.deepEqual(cards(restored),all);
  assert.equal(restored.objects.find(o=>o.kind==='ih-turn').phase,'first');
  assert.equal(restored.objects.filter(o=>o.type==='board').length,1);assert.equal(restored.initialSetup.objects.filter(o=>o.type==='board').length,1);
  assert.deepEqual(migrateSession(restored),restored);switchDoor(restored);finishTurn(restored);assert.equal(value(restored,'turn'),1);
});

test('compact header only exposes the manual while all turn actions remain available inside',()=>{
  const s=createIronHelmSession();assert.match(toolbar(s),/铁盔/);assert.match(toolbar(s),/规则手册/);
  assert.equal((toolbar(s).match(/<button/g)||[]).length,1);assert.doesNotMatch(toolbar(s),/抽两张门|ih-vitals|第.*层/);
  assert.match(journal(s),/抽两张门/);explore(s);assert.match(journal(s),/先看左门/);revealDoor(s,'a');assert.match(journal(s),/放弃，换门/);assert.match(journal(s),/结算完毕/);
});

test('fixed dungeon piles align with the printed doors and still deal movable top cards',()=>{
  const s=createIronHelmSession(),dungeon=pile(s,'dungeon'),discard=pile(s,'dungeon-discard');
  assert.deepEqual({x:dungeon.x,y:dungeon.y},matPoint(s,332,518));
  assert.deepEqual({x:discard.x,y:discard.y},matPoint(s,468,518));
  assert.deepEqual(dimensions(s,dungeon),{w:150,h:210});
  for(const deck of s.objects.filter(o=>o.type==='deck')){assert.equal(deck.fixedPosition,true);assert.equal(canMoveObject(deck),false);}
  assert.ok(objectsInRect(s,{left:-10000,right:10000,top:-10000,bottom:10000}).every(o=>o.type!=='deck'));
  const before={x:dungeon.x,y:dungeon.y,rotation:dungeon.rotation},card=drawFromDeck(s,dungeon);
  assert.equal(canMoveObject(card),true);assert.deepEqual(dimensions(s,card),dimensions(s,dungeon));
  assert.deepEqual({x:dungeon.x,y:dungeon.y,rotation:dungeon.rotation},before);assert.deepEqual(cards(s),all);
});

test('returning cards preserves the fixed pile identity and cannot combine two fixed piles',()=>{
  const s=createIronHelmSession(),deck=pile(s,'dungeon'),before=structuredClone(deck),card=drawFromDeck(s,deck);
  assert.equal(mergeCards(s,[deck.id,card.id]),deck);assert.deepEqual(deck,before);assert.deepEqual(cards(s),all);
  const baseline=structuredClone(s);assert.equal(mergeCards(s,[deck.id,pile(s,'enemy').id]),null);assert.deepEqual(s,baseline);
});

test('version-one saves correct only pile placement and keep in-progress cards and setups',()=>{
  const s=createIronHelmSession();explore(s);revealDoor(s,'b');
  s.objects=s.objects.map(o=>{if(!o.ihSlot?.startsWith('door-'))return o;const {cards,ihSlot,fixedPosition,maxCards,snapCards,...rest}=o;return {...rest,type:'card',assetId:cards[0]};});
  s.ironHelmTableVersion=1;const door=s.objects.find(o=>o.ihRole==='door-first');door.x=1777;door.y=888;
  s.setup=structuredClone(s.initialSetup);
  for(const objects of [s.objects,s.initialSetup.objects,s.setup.objects])for(const o of objects.filter(o=>o.type==='deck')){delete o.fixedPosition;o.x+=10;o.y+=16;o.rotation=15;}
  const restored=migrateSession(s);assert.equal(restored.ironHelmTableVersion,5);
  const held=restored.objects.find(o=>o.id===door.id);assert.equal(held.x,1777);assert.equal(held.y,888);assert.equal(held.faceUp,true);
  for(const current of [restored,applySetup(restored),applySetup(restored,restored.initialSetup)]){
    const deck=pile(current,'dungeon');assert.deepEqual({x:deck.x,y:deck.y},matPoint(current,332,518));
    assert.equal(deck.rotation,0);assert.ok(current.objects.filter(o=>o.type==='deck').every(o=>o.fixedPosition));assert.deepEqual(cards(current),all);
  }
  assert.deepEqual(migrateSession(restored),restored);
});
