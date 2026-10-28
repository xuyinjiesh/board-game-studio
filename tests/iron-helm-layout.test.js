import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,migrateSession,startOpening} from '../src/projects.js';
import {openingChoicesHTML} from '../src/opening-editor.js';
import {matPoint,equipmentSlot} from '../src/games/iron-helm-table.js';
import {takeFromCatalog} from '../src/games/iron-helm.js';

test('opening previews use each saved hero and resources while retaining profile selection',()=>{
  const s=createProject('iron-helm');
  s.setupProfiles[0].name='<自定义角色>';
  const html=openingChoicesHTML(s);
  for(const [i,p] of s.setupProfiles.entries()){
    assert.ok(html.includes(`data-start-profile="${p.id}"`));
    assert.ok(html.includes(`/assets/iron-helm/hero-${i+1}.webp`));
    assert.doesNotMatch(html,/生命 |能量 /);
  }
  assert.ok(html.includes('&lt;自定义角色&gt;'));
  const custom=createProject('custom');custom.setupProfiles=[{id:'custom',name:'自定义',setup:custom.initialSetup}];
  assert.doesNotMatch(openingChoicesHTML(custom),/<img|profile-cards/);
});

test('new openings and purchased skills align with the right printed column',()=>{
  const s=createProject('iron-helm');
  for(const p of s.setupProfiles){
    const played=startOpening(s,p.id,()=>.5);
    for(const o of played.objects.filter(o=>o.ihRole==='inventory'||o.ihRole==='learned')){
      const point=matPoint(played,...(o.ihRole==='learned'?[1470,150]:equipmentSlot((o.assetId||o.cards?.at(-1)).split('-').at(-1))));
      assert.deepEqual({x:o.x,y:o.y},point);
    }
  }
  s.objects.find(o=>o.ihRole==='enemy-discard').cards.push(...s.objects.find(o=>o.ihRole==='enemy').cards.splice(-3));
  takeFromCatalog(s,'ih-skill-5');
  const learned=s.objects.find(o=>o.type==='deck'&&o.cards.includes('ih-skill-5'));
  assert.deepEqual({x:learned.x,y:learned.y},matPoint(s,1470,150));
});

test('old defaults are repaired in live tables and all profiles without moving custom placements',()=>{
  const s=createProject('iron-helm');s.ironHelmTableVersion=2;s.setup=structuredClone(s.initialSetup);
  for(const setup of [s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)]){
    const table={...s,objects:setup.objects};
    for(const o of setup.objects){
      if(o.ihRole==='learned')Object.assign(o,matPoint(table,1450,150));
      if(o.ihRole==='inventory'&&['3','8','11'].includes((o.assetId||o.cards?.at(-1)).split('-').at(-1)))Object.assign(o,matPoint(table,1450,330));
    }
  }
  const custom=s.setupProfiles[2].setup.objects.find(o=>o.ihRole==='learned');custom.x=1777;custom.y=888;
  const restored=migrateSession(s);
  for(const setup of [restored,restored.initialSetup,restored.setup,...restored.setupProfiles.slice(0,2).map(p=>p.setup)]){
    const o=setup.objects.find(o=>o.ihRole==='learned');
    assert.deepEqual({x:o.x,y:o.y},matPoint({...restored,objects:setup.objects},1470,150));
  }
  const held=restored.setupProfiles[2].setup.objects.find(o=>o.ihRole==='learned');
  assert.equal(held.x,1777);assert.equal(held.y,888);
  assert.deepEqual(migrateSession(restored),restored);
});
