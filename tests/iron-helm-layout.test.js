import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,migrateSession,startOpening} from '../src/projects.js';
import {openingChoicesHTML} from '../src/opening-editor.js';
import {matPoint,equipmentSlot} from '../src/games/iron-helm-table.js';
import {takeFromCatalog,HEROES,value,changeValue,ironHelm} from '../src/games/iron-helm.js';
import {baseObject,deckEntries} from '../src/model.js';

test('blessing is centered and one functional d12 is added to existing tables and all openings',()=>{
  const s=createProject('iron-helm');s.ironHelmTableVersion=11;s.setup=structuredClone(s.initialSetup);
  for(const layout of [s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)]){
    layout.objects=layout.objects.filter(o=>o.ihRole!=='divine-die');
    Object.assign(layout.objects.find(o=>o.kind==='ih-blessing'),matPoint({...s,objects:layout.objects},846,462));
  }
  const restored=migrateSession(s);
  for(const layout of [restored,restored.initialSetup,restored.setup,...restored.setupProfiles.map(p=>p.setup)]){
    const table={...restored,objects:layout.objects},blessing=layout.objects.find(o=>o.kind==='ih-blessing');
    assert.deepEqual({x:blessing.x,y:blessing.y},matPoint(table,865,465));
    const dice=layout.objects.filter(o=>o.type==='die'),d12=dice.find(o=>o.ihRole==='divine-die');
    assert.equal(dice.length,4);assert.deepEqual(d12.faces,[1,2,3,4,5,6,7,8,9,10,11,12]);
    assert.deepEqual({x:d12.x,y:d12.y},matPoint(table,1065,492));
    assert.equal(d12.skin,'d12-sand');
  }
  assert.deepEqual(migrateSession(restored),restored);
  assert.equal(startOpening(restored,restored.setupProfiles[0].id).objects.filter(o=>o.ihRole==='divine-die').length,1);
});

test('compact openings remove redundant tracks, counters and spent piles across every saved layout',()=>{
  const s=createProject('iron-helm');s.setup=structuredClone(s.initialSetup);s.ironHelmTableVersion=9;
  for(const layout of [s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)]){
    const enemy=layout.objects.find(o=>o.ihRole==='enemy'),grave=layout.objects.find(o=>o.ihRole==='enemy-discard');
    layout.objects.push(
      {...baseObject('token',100,100),kind:'ih-turn',value:3,phase:'ready',potionChoices:0},
      {...baseObject('token',200,100),kind:'ih-eyes',value:5},
      {...baseObject('card',300,100),assetId:'ih-track-level',ihRole:'level-track',faceUp:true},
      {...baseObject('card',400,100),assetId:'ih-track-morality',ihRole:'morality-track',faceUp:true},
      {...structuredClone(grave),id:'spent-layout',ihRole:'spent',cards:enemy.cards.splice(-2),faceUp:false}
    );
  }
  const restored=migrateSession(s);
  for(const layout of [restored,restored.initialSetup,restored.setup,...restored.setupProfiles.map(p=>p.setup)]){
    assert.ok(!layout.objects.some(o=>['ih-turn','ih-eyes'].includes(o.kind)||['spent','level-track','morality-track'].includes(o.ihRole)));
    assert.equal(value(layout,'turn'),3);assert.equal(value(layout,'eyes'),5);
    const grave=layout.objects.find(o=>o.ihRole==='enemy-discard');
    assert.equal(grave.cards.length,2);assert.ok(deckEntries(grave).every(card=>!card.faceUp));
    assert.equal(layout.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:o.ihBlessingSupply||[]).length,116);
  }
  assert.ok(!ironHelm.tokens.some(o=>['ih-turn','ih-eyes'].includes(o.kind)));
  assert.deepEqual(migrateSession(restored),restored);
});

test('supplies open face down, accessories stack, and blessing is an adjustable square token',()=>{
  const s=createProject('iron-helm');
  for(const objects of [s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)]){
    for(const role of ['trapping','skill']){
      const pile=objects.find(o=>o.ihRole===role);
      assert.ok(deckEntries(pile).every(card=>!card.faceUp));assert.equal(pile.setupFace,'fixed');
    }
    const token=objects.find(o=>o.kind==='ih-blessing');
    assert.equal(token.type,'token');assert.equal(token.value,0);
    assert.deepEqual([token.width,token.height],[28,28]);
    assert.ok(!objects.some(o=>o.type==='deck'&&o.ihRole==='blessing'));
  }
  takeFromCatalog(s,'ih-trapping-5');takeFromCatalog(s,'ih-trapping-2');
  const accessories=s.objects.find(o=>o.ihSlot==='accessory');
  assert.deepEqual(accessories.cards,['ih-trapping-5','ih-trapping-2']);
  const token=s.objects.find(o=>o.kind==='ih-blessing');
  ironHelm.adjustToken(s,token,1);assert.equal(token.value,1);
  Object.assign(token,matPoint(s,927,476));ironHelm.onTokenDrop(s,token);assert.equal(token.value,9);
});

test('existing supply faces, accessory limits and blessing piles are corrected in every opening',()=>{
  const s=createProject('iron-helm');s.ironHelmTableVersion=10;s.setup=structuredClone(s.initialSetup);
  for(const layout of [s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)]){
    for(const o of layout.objects){
      if(['trapping','skill'].includes(o.ihRole)){o.faceUp=true;o.setupFace='random';}
      if(o.ihSlot==='accessory')o.maxCards=1;
    }
    const index=layout.objects.findIndex(o=>o.kind==='ih-blessing'),token=layout.objects[index];
    const {ihBlessingSupply,...rest}=token;
    layout.objects[index]={...rest,type:'deck',kind:undefined,ihRole:'blessing',cards:ihBlessingSupply,faceUp:false,width:58,height:58};
  }
  const restored=migrateSession(s);
  for(const layout of [restored,restored.initialSetup,restored.setup,...restored.setupProfiles.map(p=>p.setup)]){
    assert.ok(layout.objects.filter(o=>['trapping','skill'].includes(o.ihRole)).every(o=>!o.faceUp&&o.setupFace==='fixed'));
    assert.equal(layout.objects.find(o=>o.ihSlot==='accessory').maxCards,500);
    assert.equal(layout.objects.find(o=>o.kind==='ih-blessing').type,'token');
  }
  assert.deepEqual(migrateSession(restored),restored);
});

test('each hero starts with carried equipment weight on the white track and poison outside it',()=>{
  const s=createProject('iron-helm');
  for(const [i,profile] of s.setupProfiles.entries()){
    const table=startOpening(s,profile.id,()=>.5),weight=table.objects.find(o=>o.kind==='ih-weight');
    assert.equal(value(table,'weight'),[2,2,3,3][i]);
    assert.deepEqual({x:weight.x,y:weight.y},matPoint(table,625+(weight.value-1)*24,38));
    const poison=table.objects.find(o=>o.kind==='ih-poison');
    assert.equal(poison.value,0);assert.deepEqual({x:poison.x,y:poison.y},matPoint(table,600,262));
    Object.assign(weight,matPoint(table,649,38));ironHelm.onTokenDrop(table,weight);
    assert.equal(value(table,'weight'),2);
    changeValue(table,'weight',1);assert.equal(value(table,'weight'),3);
  }
});

test('version-five saves gain carried equipment weight across openings without resetting progress',()=>{
  const s=createProject('iron-helm');s.ironHelmTableVersion=5;s.setup=structuredClone(s.initialSetup);
  changeValue(s,'health',-3);changeValue(s,'poison',4);
  const layouts=[s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)];
  for(const layout of layouts){
    layout.objects=layout.objects.filter(o=>o.kind!=='ih-weight');
    const poison=layout.objects.find(o=>o.kind==='ih-poison');
    Object.assign(poison,matPoint({...s,objects:layout.objects},poison.value?697:582,poison.value?38:49),{width:28,height:28});
  }
  const restored=migrateSession(s);
  assert.equal(value(restored,'health'),11);assert.equal(value(restored,'poison'),4);
  for(const [i,profile] of restored.setupProfiles.entries())assert.equal(value(profile.setup,'weight'),[2,2,3,3][i]);
  assert.equal(value(restored.initialSetup,'weight'),2);assert.equal(value(restored.setup,'weight'),2);
  const poison=restored.objects.find(o=>o.kind==='ih-poison');
  assert.deepEqual({x:poison.x,y:poison.y},matPoint(restored,697,218));
  changeValue(restored,'weight',-2);
  assert.deepEqual(migrateSession(restored),restored);
});

test('version-six capacity markers are replaced with carried weight without rearranging the table',()=>{
  const s=createProject('iron-helm');
  takeFromCatalog(s,'ih-trapping-5');
  assert.equal(value(s,'weight'),3);
  s.ironHelmTableVersion=6;
  for(const layout of [s,s.initialSetup,...s.setupProfiles.map(p=>p.setup)]){
    const o=layout.objects.find(o=>o.kind==='ih-weight');
    Object.assign(o,{kind:'ih-capacity',name:'负重上限',assetId:'ih-marker-capacity',value:10});
  }
  const card=s.objects.find(o=>o.ihRole==='learned');card.x=1777;card.y=888;
  changeValue(s,'health',-3);
  const restored=migrateSession(s);
  assert.equal(value(restored,'weight'),3);
  assert.equal(value(restored,'health'),11);
  assert.ok(!restored.objects.some(o=>o.kind==='ih-capacity'));
  assert.deepEqual({x:restored.objects.find(o=>o.id===card.id).x,y:restored.objects.find(o=>o.id===card.id).y},{x:1777,y:888});
  assert.deepEqual(restored.setupProfiles.map(p=>value(p.setup,'weight')),[2,2,3,3]);
  assert.deepEqual(migrateSession(restored),restored);
});

test('poison follows the health scale and blessings sit on the divine intervention emblem',()=>{
  const s=createProject('iron-helm'),poison=s.objects.find(o=>o.kind==='ih-poison');
  const blessing=s.objects.find(o=>o.kind==='ih-blessing');
  assert.deepEqual({x:blessing.x,y:blessing.y},matPoint(s,865,465));
  assert.equal(blessing.ihBlessingSupply.length,12);assert.equal(blessing.value,0);
  assert.equal(poison.width,28);assert.equal(poison.height,28);
  Object.assign(poison,matPoint(s,649,245));ironHelm.onTokenDrop(s,poison);
  assert.equal(value(s,'poison'),9);assert.equal(value(s,'health'),14);
  changeValue(s,'poison',-5);
  assert.deepEqual({x:poison.x,y:poison.y},matPoint(s,697,218));
  const board=s.objects.find(o=>o.assetId==='ih-playmat');
  board.rotation=90;board.width=1000;board.height=1000*320/780;
  Object.assign(poison,matPoint(s,673,272));ironHelm.onTokenDrop(s,poison);
  assert.equal(value(s,'poison'),17);
});

test('resource positions are corrected in every saved opening even after the previous layout update',()=>{
  const s=createProject('iron-helm');s.ironHelmTableVersion=8;s.setup=structuredClone(s.initialSetup);
  changeValue(s,'poison',4);changeValue(s,'health',-2);
  for(const layout of [s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)]){
    const table={...s,objects:layout.objects},poison=layout.objects.find(o=>o.kind==='ih-poison'),blessing=layout.objects.find(o=>o.kind==='ih-blessing');
    Object.assign(poison,matPoint(table,970,705),{width:48,height:48});
    Object.assign(blessing,matPoint(table,400,765));
  }
  const custom=s.setupProfiles[3].setup.objects;
  Object.assign(custom.find(o=>o.kind==='ih-poison'),{x:1800,y:900});
  Object.assign(custom.find(o=>o.kind==='ih-blessing'),{x:1700,y:950});
  const restored=migrateSession(s);
  assert.equal(value(restored,'poison'),4);assert.equal(value(restored,'health'),12);
  for(const layout of [restored,restored.initialSetup,restored.setup,...restored.setupProfiles.map(p=>p.setup)]){
    const table={...restored,objects:layout.objects},poison=layout.objects.find(o=>o.kind==='ih-poison'),blessing=layout.objects.find(o=>o.kind==='ih-blessing');
    assert.deepEqual({x:poison.x,y:poison.y},matPoint(table,...(poison.value?[697,218]:[600,262])));
    assert.deepEqual({x:blessing.x,y:blessing.y},matPoint(table,865,465));
    assert.equal(blessing.ihBlessingSupply.length,12);assert.equal(blessing.value,0);
  }
  const held=restored.setupProfiles[3].setup.objects;
  assert.deepEqual({x:held.find(o=>o.kind==='ih-poison').x,y:held.find(o=>o.kind==='ih-poison').y},matPoint(restored,600,262));
  assert.equal(restored.ironHelmTableVersion,12);
  assert.deepEqual(migrateSession(restored),restored);
});

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
