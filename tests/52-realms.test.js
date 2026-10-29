import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject,startOpening,openEditor,saveEditorDraft,migrateSession,makeExhibit,copyProject} from '../src/projects.js';
import {validateSession,assetFor,mergeCards,baseObject} from '../src/model.js';
import {realms,REALMS_HEROES,createRealmsSession,revealRealmsCard,realmsStatus,realmsMarkerPlacement} from '../src/games/52-realms.js';

const rng=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.realmsRole===role);
const cards=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]).filter(id=>assetFor(s,id)?.group==='poker');
const points=(s,ids)=>ids.reduce((n,id)=>n+assetFor(s,id).number,0);

test('all supplied maps, six heroes, references and a complete poker deck have local assets',()=>{
  const s=createProject('52-realms');validateSession(s);
  for(const [group,count] of [['poker',52],['map',3],['hero',6],['reference',6]])assert.equal(s.assets.filter(a=>a.group===group).length,count);
  for(const a of s.assets)for(const url of [a.front,a.back].filter(Boolean))assert.ok(existsSync('public'+url),url);
  for(const file of ['rules-zh.pdf','rules-map-1.pdf','rules-map-2.pdf','rules-map-3.pdf'])assert.ok(existsSync('public/assets/52-realms/'+file));
  assert.equal(s.setupProfiles.length,18);assert.equal(new Set(s.setupProfiles.map(p=>p.id)).size,18);
  assert.equal(new Set(cards(s)).size,52);
});

test('18 openings conserve 52 cards, allocate items by suit and stop equipment at the first total >=20',()=>{
  const project=createProject('52-realms');
  const expected=project.assets.filter(a=>a.group==='poker').map(a=>a.id).sort();
  for(const profile of project.setupProfiles)for(let seed=0;seed<20;seed++){
    const s=startOpening(project,profile.id,rng(seed)),hero=REALMS_HEROES.find(h=>profile.id.endsWith(h.id));
    assert.deepEqual(cards(s).sort(),expected);validateSession(s);
    const equipment=s.objects.filter(o=>o.realmsRole==='equipment');
    const total=points(s,equipment.map(o=>o.assetId));
    assert.ok(total>=20);assert.ok(total-assetFor(s,equipment.at(-1).assetId).number<20);
    assert.ok(equipment.every(o=>o.faceUp&&o.rotation===0&&assetFor(s,o.assetId).number!==1));
    let items=0;
    for(const suit of ['clubs','spades','hearts','diamonds']){
      const p=pile(s,'item-'+suit);items+=p.cards.length;
      assert.ok(p.cards.every(id=>assetFor(s,id).suit===suit&&assetFor(s,id).number!==1));assert.equal(p.faceUp,true);
    }
    assert.equal(items,2);assert.equal(pile(s,'draw').faceUp,false);
    assert.equal(pile(s,'draw').cards.filter(id=>assetFor(s,id).number===1).length,4);
    assert.equal(pile(s,'wounds').cards.length,hero.id==='fallen-knight'?1:0);
    assert.equal(realmsStatus(s).limit,hero.limit);
    const map=Number(profile.id.split('-')[1]);
    assert.equal(!!pile(s,'torch'),map===2);assert.equal(!!pile(s,'bounty'),map===2);
    assert.equal(!!pile(s,'windup'),map===3);assert.equal(!!pile(s,'collection'),hero.id==='hunter');
    assert.equal(s.objects.some(o=>o.kind==='realms-form'),hero.id==='druid');
    assert.equal(s.objects.some(o=>o.kind==='realms-clock'),map===3);
  }
});

test('fixed edited sources skip setup aces, retain exact order, moved destinations and equipment anchors',()=>{
  const editor=openEditor(createProject('52-realms')),draw=pile(editor,'draw');
  draw.setupOrder='fixed';
  const aces=draw.cards.filter(id=>assetFor(editor,id).number===1),others=draw.cards.filter(id=>!aces.includes(id));
  draw.cards=[...others,...aces];draw.realmsEquipment={x:250,y:1500,spacing:130};
  pile(editor,'item-diamonds').x=1350;
  const saved=saveEditorDraft(editor),before=structuredClone(saved);
  const a=startOpening(saved,undefined,rng(1)),b=startOpening(saved,undefined,rng(9));
  assert.deepEqual(cards(a),cards(b));assert.deepEqual(saved,before);
  const equip=a.objects.filter(o=>o.realmsRole==='equipment');
  assert.ok(equip.every((o,i)=>o.x===250+i*130&&o.y===1500));
  assert.equal(pile(a,'item-diamonds').x,1350);
  assert.deepEqual(pile(a,'draw').cards.slice(0,4),aces.toReversed());
  assert.equal(new Set(cards(a)).size,52);
  // A manually authored allocation does not receive automatic preparation again.
  const manual=openEditor(saved),id=pile(manual,'draw').cards.pop();
  manual.objects.push({...baseObject('card',123,456),assetId:id,faceUp:true});
  const played=startOpening(saveEditorDraft(manual));
  assert.equal(played.objects.find(o=>o.assetId===id).x,123);
  assert.equal(played.objects.filter(o=>o.realmsRole==='equipment').length,0);
});

test('reveal preserves an ace for manual curse resolution and rejects invalid operations without consuming a card',()=>{
  const s=createRealmsSession(rng(1)),draw=pile(s,'draw'),reveal=pile(s,'reveal');
  const index=draw.cards.findIndex(id=>assetFor(s,id).number===1),[ace]=draw.cards.splice(index,1);draw.cards.push(ace);
  assert.match(revealRealmsCard(s),/诅咒/);assert.deepEqual(reveal.cards,[ace]);assert.equal(reveal.faceUp,true);
  assert.equal(cards(s).length,52);validateSession(s);
  const before=structuredClone(s);assert.throws(()=>revealRealmsCard(s),/先处理/);assert.deepEqual(s,before);
  mergeCards(s,[pile(s,'discard').id,reveal.id],{targetId:pile(s,'discard').id});
  for(const corrupt of [
    s=>s.mode='edit',s=>pile(s,'draw').locked=true,s=>pile(s,'reveal').locked=true,
    s=>pile(s,'draw').cards=[],s=>s.objects=s.objects.filter(o=>o.realmsRole!=='reveal'),
    s=>pile(s,'draw').cards.push('realms-hero-barbarian')
  ]){
    const invalid=structuredClone(s);corrupt(invalid);const snapshot=structuredClone(invalid);
    assert.throws(()=>revealRealmsCard(invalid));assert.deepEqual(invalid,snapshot);
  }
});

test('score counts stacked items, loot, forest bounty and hunter collection with the correct multipliers',()=>{
  const s=createRealmsSession(rng(2),2,'hunter');
  for(const o of s.objects)if(o.type==='deck')o.cards=[];
  pile(s,'item-clubs').cards=['realms-clubs-2','realms-clubs-3'];
  pile(s,'loot').cards=['realms-hearts-9','realms-hearts-13'];
  pile(s,'bounty').cards=['realms-spades-5','realms-spades-6','realms-spades-7'];
  pile(s,'collection').cards=['realms-diamonds-10'];
  pile(s,'wounds').cards=['realms-hearts-2','realms-diamonds-13'];
  const v=realmsStatus(s);
  assert.equal(v.total,4+22+18*3+20);assert.equal(v.wounds,15);assert.equal(v.limit,25);
  assert.equal(v.bounty,54);assert.equal(v.collection,20);
});

test('track snap follows translated, scaled and rotated maps and ignores unrelated tokens',()=>{
  const s=createRealmsSession(rng(1),3),map=s.objects.find(o=>o.assetId==='realms-map-3');
  Object.assign(map,{x:1000,y:700,width:350,height:495,rotation:90});
  for(const [kind,x,y] of [['realms-clock',265+7*39,923],['realms-hp',188,928-15*(883/30)]]){
    const dx=(x/700-.5)*350,dy=(y/990-.5)*495;
    const expected={x:map.x-dy,y:map.y+dx};
    const o={kind,x:expected.x+2,y:expected.y-2};
    const p=realmsMarkerPlacement(s,o);assert.ok(p);assert.ok(Math.hypot(p.x-expected.x,p.y-expected.y)<.001);
  }
  assert.equal(realmsMarkerPlacement(s,{kind:'realms-pawn',x:1000,y:700}),null);
  assert.equal(realmsMarkerPlacement(s,{kind:'realms-hp',x:1000,y:700}),null);
  assert.equal(realmsMarkerPlacement({...s,mode:'edit'},{kind:'realms-hp',x:1000,y:700}),null);
  assert.equal(realmsMarkerPlacement({...s,settings:{...s.settings,snap:false}},{kind:'realms-hp',x:1000,y:700}),null);
});

test('untrusted extra asset metadata cannot inject markup into the toolbar',()=>{
  const s=createRealmsSession(rng(1));
  assetFor(s,'realms-hero-barbarian').woundLimit='<img src=x onerror=alert(1)>';
  assetFor(s,'realms-clubs-2').number='<img src=x onerror=alert(1)>';
  pile(s,'wounds').cards=['realms-clubs-2'];
  assert.equal(realmsStatus(s).wounds,0);assert.equal(realmsStatus(s).limit,undefined);
  assert.doesNotMatch(realms.toolbar(s),/onerror/);
});

test('progress, all openings and exhibition copies survive a JSON round trip and restart cleanly',()=>{
  const s=startOpening(createProject('52-realms'),'realms-3-fallen-knight',rng(2));
  s.objects.find(o=>o.realmsRole==='equipment').rotation=90;
  revealRealmsCard(s);s.objects.find(o=>o.kind==='realms-pawn').x=777;
  const imported=migrateSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(imported,s);validateSession(imported);
  const restarted=startOpening(imported,undefined,rng(4));
  assert.equal(pile(restarted,'reveal').cards.length,0);assert.equal(pile(restarted,'wounds').cards.length,1);
  assert.ok(restarted.objects.filter(o=>o.realmsRole==='equipment').every(o=>o.rotation===0));
  const copy=copyProject(makeExhibit(imported).session,{fromSetup:true});
  assert.equal(copy.awaitingOpening,true);assert.equal(copy.setupProfiles.length,18);
  validateSession(startOpening(copy,'realms-2-druid',rng(3)));
  assert.match(realms.journal(),/上发条/);assert.match(realms.toolbar(imported),/候选得分/);
});
