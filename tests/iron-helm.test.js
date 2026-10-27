import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {ironHelmAssets} from '../src/games/iron-helm-assets.js';
import {createIronHelmSession,HEROES,value,changeValue,explore,revealDoor,switchDoor,finishTurn,nextLevel,takeFromCatalog,act} from '../src/games/iron-helm.js';
import {validateSession,applySetup,dimensions} from '../src/model.js';
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
    assert.equal(s.objects.find(o=>o.ihRole==='hero').assetId,`ih-hero-${h.id}`);
    assert.deepEqual(s.objects.filter(o=>o.ihRole==='inventory').map(o=>o.assetId),h.items.map(n=>`ih-trapping-${n}`));
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
