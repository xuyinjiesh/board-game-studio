import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject,startOpening,openEditor,saveEditorDraft,migrateSession,copyProject,addSetupProfile} from '../src/projects.js';
import {validateSession,dimensions,baseObject,mergeCards,takeDeckCard,appendDeckEntries} from '../src/model.js';
import {miniRogueAssets} from '../src/games/mini-rogue-assets.js';
import {miniRogue,MINI_ROGUE_PACKS,miniRogueOptions,miniRogueHeroes,createMiniRogueSession,configureMiniRogueOpening,dealMiniRogueArea,drawMiniRogueLore,miniRogueAnchors,adjustMiniRogueToken,dropMiniRogueToken,miniRogueDieImage} from '../src/games/mini-rogue.js';
const pile=(s,role)=>s.objects.find(o=>o.type==='deck'&&o.mrRole===role);
const token=(s,key)=>s.objects.find(o=>o.kind==='mr-'+key);
const ids=s=>s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]);
const roomIds=s=>ids(s).filter(id=>s.assets.find(a=>a.id===id)?.group==='room').sort();
const all={packs:MINI_ROGUE_PACKS.map(p=>p.id),map:'tower'};

test('Mini Rogue bundles the supplied cards once, pairs reference faces and identifies every DLC',()=>{
  assert.equal(miniRogueAssets.length,82);assert.equal(new Set(miniRogueAssets.map(a=>a.id)).size,82);
  const counts=pack=>Object.fromEntries(['hero','boss','room','lore'].map(group=>[group,miniRogueAssets.filter(a=>a.group===group&&(a.expansion||'base')===pack).length]));
  assert.deepEqual(counts('base'),{hero:4,boss:5,room:20,lore:0});
  assert.deepEqual(counts('depths'),{hero:3,boss:2,room:7,lore:26});
  assert.deepEqual(counts('old-gods'),{hero:1,boss:1,room:3,lore:0});
  for(const pack of ['death-bat','wolf-forge'])assert.deepEqual(counts(pack),{hero:0,boss:0,room:2,lore:0});
  for(const a of miniRogueAssets)for(const path of [a.front,a.back].filter(Boolean))assert.ok(existsSync(new URL('../public'+path,import.meta.url)),path);
  for(const type of ['character','dungeon','poison','curse'])for(let i=1;i<=6;i++)assert.ok(existsSync(new URL(`../public/assets/mini-rogue/die-${type}-${i}.webp`,import.meta.url)));
  assert.ok(existsSync(new URL('../public/assets/mini-rogue/rules-zh.pdf',import.meta.url)));
  assert.match(miniRogueAssets.find(a=>a.id==='mr-rewards').back,/ghost.webp$/);
});

test('entry defaults to the base set; each independently enabled DLC affects only its own decks',()=>{
  const base=createProject('mini-rogue');assert.deepEqual(base.miniRogueOptions,{packs:[],map:'dungeon'});
  assert.equal(base.setupProfiles.length,4);assert.equal(base.assets.some(a=>a.expansion),false);
  assert.equal(pile(base,'lore'),undefined);assert.equal(roomIds(base).length,20);
  assert.equal((miniRogue.expansionChoiceHTML(base).match(/data-mr-expansion=/g)||[]).length,4);
  assert.doesNotMatch(miniRogue.expansionChoiceHTML(base),/checked/);
  for(const p of MINI_ROGUE_PACKS){
    const s=configureMiniRogueOpening(base,{packs:[p.id]});validateSession(s);
    assert.ok(s.assets.every(a=>!a.expansion||a.expansion===p.id));
    assert.equal(roomIds(s).length,20+miniRogueAssets.filter(a=>a.expansion===p.id&&a.group==='room').length);
    assert.equal(s.setupProfiles.length,miniRogueHeroes({packs:[p.id]}).length);
    assert.equal(!!pile(s,'lore'),p.id==='depths');
  }
  assert.equal(base.assets.some(a=>a.expansion),false);
  for(const options of [null,[],{packs:['bad']},{packs:['depths','depths']},{map:'bad'},{packs:'depths'}])assert.throws(()=>miniRogueOptions(options));
  assert.throws(()=>createMiniRogueSession(()=>.5,'skeleton'));
  const bad=structuredClone(base);bad.miniRogueOptions={packs:['bad']};assert.throws(()=>migrateSession(bad));
});

test('every hero starts with printed resources, potions and the selected map across restarts',()=>{
  const configured=configureMiniRogueOpening(createProject('mini-rogue'),all);
  assert.equal(configured.setupProfiles.length,8);
  for(const hero of miniRogueHeroes(all)){
    const s=startOpening(configured,hero.id,()=>.2);validateSession(s);
    for(const key of ['hp','armor','food','gold','xp'])assert.equal(token(s,key).value,hero[key],hero.name+' '+key);
    assert.equal(s.objects.find(o=>o.assetId==='mr-dungeon').faceUp,false);
    if(hero.potion){const p=miniRogueAnchors(s,'potion').find(p=>p.value===hero.potion);assert.ok(s.objects.some(o=>o.kind==='mr-potion'&&o.x===p.x&&o.y===p.y));}
    assert.equal(s.objects.filter(o=>o.type==='die'&&o.name==='角色骰').length,3);
    assert.ok(ids(s).includes(hero.id));
    const restored=migrateSession(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.miniRogueOptions,all);
    assert.deepEqual(roomIds(copyProject(restored)),roomIds(s));
  }
});

test('openings deal eight unique rooms, reveal only the entrance and put Og below three random bosses',()=>{
  const source=configureMiniRogueOpening(createProject('mini-rogue'),all);
  const a=startOpening(source,source.activeSetupProfileId,()=>.1),b=startOpening(source,source.activeSetupProfileId,()=>.9);
  for(const s of [a,b]){
    const rooms=s.objects.filter(o=>o.mrRole==='room');assert.equal(rooms.length,8);
    assert.equal(rooms.filter(o=>o.faceUp).length,1);assert.equal(rooms.find(o=>o.faceUp).x,455);
    assert.equal(new Set(roomIds(s)).size,34);assert.equal(pile(s,'rooms').cards.length,26);
    assert.equal(pile(s,'bosses').cards.length,4);assert.equal(pile(s,'bosses').cards[0],'mr-boss-og');
    assert.equal(pile(s,'boss-reserve').cards.length,4);
    const bosses=ids(s).filter(id=>s.assets.find(a=>a.id===id)?.group==='boss');assert.equal(bosses.length,8);assert.equal(new Set(bosses).size,8);
  }
  assert.notDeepEqual(pile(a,'bosses').cards,pile(b,'bosses').cards);
  assert.notDeepEqual(pile(a,'rooms').cards,pile(b,'rooms').cards);
});

test('area rebuilding collects loose and stacked rooms, preserves held items and reveals bosses only on floor exits',()=>{
  const s=createMiniRogueSession(()=>.4),before=roomIds(s),rooms=s.objects.filter(o=>o.mrRole==='room');
  const held=rooms[0].assetId;mergeCards(s,[pile(s,'inventory').id,rooms[0].id],{targetId:pile(s,'inventory').id});
  mergeCards(s,[rooms[1].id,rooms[2].id]);
  token(s,'area').value=2;
  const hp=token(s,'hp').value,food=token(s,'food').value;
  dealMiniRogueArea(s,()=>.7);validateSession(s);
  assert.equal(token(s,'hp').value,hp);assert.equal(token(s,'food').value,food);assert.equal(token(s,'area').value,2);
  assert.deepEqual(roomIds(s),before);assert.deepEqual(pile(s,'inventory').cards,[held]);assert.equal(pile(s,'bosses').faceUp,true);
  assert.equal(s.objects.filter(o=>o.mrRole==='room').length,8);
  assert.ok(s.objects.filter(o=>o.mrRole==='room').every(o=>o.assetId!==held));
  token(s,'area').value=3;dealMiniRogueArea(s);assert.equal(pile(s,'bosses').faceUp,false);
  s.objects.find(o=>o.assetId==='mr-dungeon').faceUp=false;dealMiniRogueArea(s);assert.equal(pile(s,'bosses').faceUp,true);
  const top=takeDeckCard(pile(s,'bosses'));assert.equal(pile(s,'bosses').faceUp,false);appendDeckEntries(pile(s,'defeated'),[top]);dealMiniRogueArea(s);assert.ok(pile(s,'defeated').cards.includes(top.assetId));
});

test('rejected area and lore actions never consume cards; used lore remains separate',()=>{
  const s=createMiniRogueSession(()=>.5,'witch',{packs:['depths']});
  drawMiniRogueLore(s);assert.equal(pile(s,'lore').cards.length,25);assert.equal(pile(s,'lore-reveal').cards.length,1);
  let before=structuredClone(s);assert.throws(()=>drawMiniRogueLore(s));assert.deepEqual(s,before);
  const used=takeDeckCard(pile(s,'lore-reveal'));appendDeckEntries(pile(s,'lore-discard'),[used]);drawMiniRogueLore(s);
  dealMiniRogueArea(s);assert.deepEqual(pile(s,'lore-discard').cards,[used.assetId]);assert.equal(pile(s,'lore').cards.length,24);
  for(const alter of [s=>pile(s,'rooms').locked=true,s=>pile(s,'rooms').cards.push(pile(s,'rooms').cards[0]),s=>s.objects.find(o=>o.mrRole==='room').locked=true]){
    const bad=structuredClone(s);alter(bad);before=structuredClone(bad);assert.throws(()=>dealMiniRogueArea(bad));assert.deepEqual(bad,before);
  }
  const base=createMiniRogueSession();before=structuredClone(base);assert.throws(()=>drawMiniRogueLore(base));assert.deepEqual(base,before);
});

test('authored openings and custom profiles survive DLC cancellation, copy and changed selections',()=>{
  let s=openEditor(createProject('mini-rogue'));
  s.objects.find(o=>o.kind==='mr-hp').value=7;s=saveEditorDraft(s);
  assert.deepEqual(configureMiniRogueOpening(s,{}),s);
  const played=startOpening(s);assert.equal(token(played,'hp').value,7);
  let custom=addSetupProfile(s,'自定义开局');const profile=structuredClone(custom.setupProfiles.at(-1));
  const before=structuredClone(custom),next=configureMiniRogueOpening(custom,all);assert.deepEqual(custom,before);
  assert.deepEqual(next.setupProfiles.find(p=>p.id===profile.id),profile);
  assert.deepEqual(configureMiniRogueOpening(next,{}).setupProfiles.find(p=>p.id===profile.id),profile);
  const fixed=openEditor(createProject('mini-rogue'));pile(fixed,'bosses').setupOrder='fixed';pile(fixed,'rooms').setupOrder='fixed';
  const a=startOpening(saveEditorDraft(fixed),fixed.activeSetupProfileId,()=>.1),b=startOpening(saveEditorDraft(fixed),fixed.activeSetupProfileId,()=>.9);
  assert.deepEqual(pile(a,'bosses').cards,pile(b,'bosses').cards);assert.deepEqual(roomIds(a),roomIds(b));
});

test('track markers follow moved, scaled and rotated panels, obey caps and synchronize drop values',()=>{
  const s=createMiniRogueSession();
  for(const key of ['hp','xp','armor','food','gold','area','monster']){
    const panel=s.objects.find(o=>o.assetId===(['area','monster'].includes(key)?'mr-dungeon':'mr-player'));
    panel.x+=30;panel.y+=20;panel.rotation=90;const size=dimensions(s,panel);panel.width=size.w*.9;panel.height=size.h*.9;
    const t=token(s,key),p=miniRogueAnchors(s,key).at(-1);Object.assign(t,{x:p.x+1,y:p.y+1});dropMiniRogueToken(s,t);
    assert.equal(t.value,p.value);assert.equal(t.x,p.x);assert.equal(t.y,p.y);
  }
  token(s,'hp').value=10;token(s,'xp').value=23;adjustMiniRogueToken(s,token(s,'xp'),3);assert.equal(token(s,'hp').value,13);assert.equal(token(s,'xp').value,23);
  adjustMiniRogueToken(s,token(s,'hp'),99);assert.equal(token(s,'hp').value,20);
  const t=token(s,'food');t.value=0;adjustMiniRogueToken(s,t,-1);assert.equal(t.value,0);
  const old=structuredClone(t);s.settings.snap=false;t.x+=100;const x=t.x;dropMiniRogueToken(s,t);assert.equal(t.x,x);assert.equal(t.value,old.value);
});

test('custom dice use original critical and affliction faces while ordinary dice keep their own artwork',()=>{
  const s=createMiniRogueSession();
  for(const die of s.objects.filter(o=>o.type==='die'))for(let i=1;i<=6;i++)assert.match(miniRogueDieImage({...die,value:i}),new RegExp(`-${i}\\.webp$`));
  assert.equal(miniRogueDieImage({...baseObject('die',0,0),name:'普通骰',faces:[1,2,3,4,5,6],value:5}),undefined);
});
