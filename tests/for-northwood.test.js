import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject,startOpening,openEditor,saveEditorDraft,migrateSession,copyProject,makeExhibit} from '../src/projects.js';
import {validateSession,baseObject,drawFromDeck,mergeCards,dimensions} from '../src/model.js';
import {northwood,redealNorthwood,northwoodStatement} from '../src/games/for-northwood.js';

const ids=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]);
const role=(s,key)=>s.objects.filter(o=>o.nwRole===key);
const rng=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);

test('Northwood includes 65 unique double-sided components and bundled rules',()=>{
  const s=createProject('for-northwood');
  assert.equal(s.assets.length,65);assert.equal(new Set(s.assets.map(a=>a.id)).size,65);
  for(const [group,count] of [['dialogue',32],['character',24],['fief',8],['visit',1]])assert.equal(s.assets.filter(a=>a.group===group).length,count);
  for(const a of s.assets)for(const url of [a.front,a.back])assert.ok(existsSync('public'+url),url);
  assert.ok(existsSync('public/assets/for-northwood/rules-en.pdf'));
  assert.equal(s.assets.filter(a=>a.advanced).length,12);
  assert.deepEqual(s.assets.filter(a=>a.group==='fief').map(a=>a.stars),[4,3,2,1,1,2,3,4]);
  validateSession(s);
});

test('reserve decks sit directly below their heading in a compact grid in both openings',()=>{
  const project=createProject('for-northwood'),zone=northwood.zones.find(z=>z.className.includes('nw-reserve'));
  assert.equal(northwood.toolbar,undefined);
  for(const profile of project.setupProfiles){
    const s=startOpening(project,profile.id,rng(1)),decks=role(s,'unused');
    assert.equal(decks.length,profile.id==='nw-full'?4:1);
    for(const o of decks){
      const {w,h}=dimensions(s,o);
      assert.ok(o.x-w/2>=zone.box[0]&&o.x+w/2<=zone.box[0]+zone.box[2]);
      if(o.y===330)assert.ok(o.y-h/2-(zone.box[1]+zone.box[3])>=20&&o.y-h/2-(zone.box[1]+zone.box[3])<=40);
      assert.ok([330,560].includes(o.y));
    }
    assert.equal(decks.reduce((n,o)=>n+o.cards.length,0),12);
  }
});

test('reserve layout upgrades progress and all openings once, preserving manually moved or rotated decks',()=>{
  for(const profileId of ['nw-intro','nw-full'])for(const legacy of [0,1]){
    const s=startOpening(createProject('for-northwood'),profileId,rng(2));delete s.northwoodReserveVersion;
    const tables=[s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)].filter(Boolean);
    for(const table of tables)for(const o of table.objects.filter(o=>o.nwRole==='unused')){
      const suit=['claws','flowers','eyes','leaves'].indexOf(o.setupKey?.replace('nw-characters-',''));
      o.x=1460;o.y=suit<0?650:legacy?320+suit*225:270+suit*170;
    }
    const custom=tables.at(-1).objects.find(o=>o.nwRole==='unused');custom.x=1800;custom.y=800;
    const rotated=tables.at(-2).objects.find(o=>o.nwRole==='unused');rotated.rotation=15;
    const before=structuredClone(s),migrated=migrateSession(s);
    const after=[migrated,migrated.initialSetup,migrated.setup,...migrated.setupProfiles.map(p=>p.setup)].filter(Boolean);
    for(const [i,table] of after.entries()){
      const prev=[before,before.initialSetup,before.setup,...before.setupProfiles.map(p=>p.setup)].filter(Boolean)[i];
      for(const [j,o] of table.objects.entries()){
        const old=prev.objects[j],{x,y,...rest}=o,{x:oldX,y:oldY,...oldRest}=old;
        assert.deepEqual(rest,oldRest);
        if(o.nwRole!=='unused'||oldX!==1460||o.rotation!==0){assert.equal(x,oldX);assert.equal(y,oldY);}
        else{assert.ok([1460,1595].includes(x));assert.ok([330,560].includes(y));}
      }
    }
    assert.deepEqual(migrateSession(migrated),migrated);validateSession(migrated);
  }
});

test('intro and full openings conserve every card and obey per-suit setup across random seeds',()=>{
  const project=createProject('for-northwood'),expected=project.assets.map(a=>a.id).sort();
  for(const profile of project.setupProfiles)for(let seed=0;seed<25;seed++){
    const s=startOpening(project,profile.id,rng(seed)),allies=role(s,'ally'),rulers=role(s,'ruler');
    const asset=id=>s.assets.find(a=>a.id===id);
    assert.deepEqual(ids(s).sort(),expected);
    assert.equal(allies.length,4);assert.equal(rulers.length,8);
    assert.equal(role(s,'hand').length,8);assert.equal(role(s,'dialogue-draw')[0].cards.length,24);
    assert.equal(role(s,'dialogue-draw')[0].faceUp,false);
    assert.ok(role(s,'hand').every(o=>o.faceUp));
    assert.equal(role(s,'discard')[0].cards.length,0);assert.equal(role(s,'score')[0].cards.length,0);
    for(const suit of ['claws','flowers','eyes','leaves']){
      assert.equal(allies.filter(o=>asset(o.assetId).suit===suit).length,1);
      assert.equal(rulers.filter(o=>asset(o.assetId).suit===suit).length,2);
    }
    if(profile.id==='nw-intro'){
      assert.ok(allies.every(o=>asset(o.assetId).rank==='jack'));
      assert.ok(rulers.every(o=>['queen','king'].includes(asset(o.assetId).rank)));
    }else assert.equal(role(s,'unused').reduce((n,o)=>n+o.cards.length,0),12);
    assert.equal(s.objects.some(o=>o.kind?.startsWith('nw-fief-')),false);
    validateSession(s);
  }
  const a=startOpening(project,'nw-full',rng(1)),b=startOpening(project,'nw-full',rng(2));
  assert.notDeepEqual(role(a,'ruler').map(o=>o.assetId),role(b,'ruler').map(o=>o.assetId));
  assert.notDeepEqual(role(a,'ally').map(o=>o.assetId),role(b,'ally').map(o=>o.assetId));
});

test('full openings mix rulers among fiefs but respect edited fixed-order sources and placements',()=>{
  const project=createProject('for-northwood');
  const shuffled=startOpening(project,'nw-full',rng(8));
  assert.ok(role(shuffled,'ruler').some((o,i)=>!o.assetId.startsWith('nw-'+['claws','flowers','eyes','leaves'][Math.floor(i/2)])));
  project.activeSetupProfileId='nw-full';
  const editor=openEditor(project);
  for(const o of editor.objects)if(o.type==='deck')o.setupOrder='fixed';
  const allySlot=editor.objects.find(o=>o.type==='deal'&&o.nwRole==='ally');allySlot.x=345;
  const authored=saveEditorDraft(editor),snapshot=structuredClone(authored);
  const a=startOpening(authored,'nw-full',rng(1)),b=startOpening(authored,'nw-full',rng(2));
  assert.deepEqual(ids(a),ids(b));assert.equal(role(a,'ally')[0].x,345);
  assert.deepEqual(authored,snapshot);
  validateSession(a);
});

test('the statement action puts a face-up card in discard; responses stay separate',()=>{
  const s=startOpening(createProject('for-northwood'),'nw-intro',rng(1));
  const draw=role(s,'dialogue-draw')[0],discard=role(s,'discard')[0],top=draw.cards.at(-1);
  northwood.act(s,'nw-statement');
  assert.deepEqual(discard.cards,[top]);assert.equal(discard.faceUp,true);
  assert.equal(draw.cards.length,23);assert.equal(role(s,'score')[0].cards.length,0);
  assert.equal(new Set(ids(s)).size,65);validateSession(s);
});

test('statement rejects locked, empty, missing or invalid destinations before consuming cards',()=>{
  for(const corrupt of [
    s=>role(s,'discard')[0].locked=true,
    s=>role(s,'dialogue-draw')[0].locked=true,
    s=>role(s,'dialogue-draw')[0].cards=[],
    s=>s.objects=s.objects.filter(o=>o.nwRole!=='discard'),
    s=>delete role(s,'dialogue-draw')[0].drawTarget,
    s=>role(s,'dialogue-draw')[0].cards.push('nw-visit'),
    s=>s.mode='edit'
  ]){
    const s=startOpening(createProject('for-northwood'),'nw-intro');corrupt(s);
    const before=structuredClone(s);assert.throws(()=>northwoodStatement(s));assert.deepEqual(s,before);
  }
});

test('redealing gathers mixed dialogue piles, conserves all cards and preserves the rest of the table',()=>{
  const s=startOpening(createProject('for-northwood'),'nw-full',rng(7));
  const expected=ids(s).sort(),draw=role(s,'dialogue-draw')[0],discard=role(s,'discard')[0],score=role(s,'score')[0];
  drawFromDeck(s,draw,true);
  const hand=role(s,'hand'),winner=hand[0];
  mergeCards(s,[score.id,winner.id],{targetId:score.id});
  // A loose stack may contain both a character and dialogue cards.
  const ally=role(s,'ally')[0],mixed=mergeCards(s,[ally.id,hand[1].id]);
  s.objects.find(o=>o.assetId==='nw-visit').x=333;
  const others=s.objects.filter(o=>o.type==='token'||o.assetId==='nw-visit').map(o=>structuredClone(o));
  redealNorthwood(s,rng(10));
  assert.deepEqual(ids(s).sort(),expected);
  assert.equal(draw.cards.length,24);assert.equal(draw.faceUp,false);
  assert.equal(role(s,'hand').length,8);assert.equal(discard.cards.length,0);assert.equal(score.cards.length,0);
  assert.deepEqual(mixed.cards,[ally.assetId]);
  assert.deepEqual(s.objects.filter(o=>others.some(a=>a.id===o.id)),others);
  validateSession(s);
});

test('incomplete, duplicate or locked dialogue collections reject redealing without mutation',()=>{
  for(const corrupt of [
    s=>role(s,'dialogue-draw')[0].cards.pop(),
    s=>s.objects.push({...baseObject('card',0,0),assetId:role(s,'hand')[0].assetId,faceUp:true}),
    s=>role(s,'hand')[0].locked=true,
    s=>role(s,'dialogue-draw')[0].locked=true,
    s=>role(s,'dialogue-draw')[0].cards.push('nw-visit'),
    s=>s.objects=s.objects.filter(o=>o.nwRole!=='dialogue-draw'),
    s=>s.mode='edit'
  ]){
    const s=startOpening(createProject('for-northwood'),'nw-intro');corrupt(s);
    const before=structuredClone(s);assert.throws(()=>redealNorthwood(s));assert.deepEqual(s,before);
  }
});

test('legacy status markers are removed from progress and every opening without moving any cards',()=>{
  const s=startOpening(createProject('for-northwood'),'nw-intro');
  const tables=[s,s.initialSetup,s.setup,...s.setupProfiles.map(p=>p.setup)].filter(Boolean);
  const before=tables.map(t=>structuredClone(t.objects));
  for(const table of tables)for(let i=0;i<8;i++)table.objects.push({...baseObject('token',110+i*166,495,20),kind:'nw-fief-'+i,value:i%2?1:0});
  const migrated=migrateSession(s),after=[migrated,migrated.initialSetup,migrated.setup,...migrated.setupProfiles.map(p=>p.setup)].filter(Boolean);
  after.forEach((t,i)=>assert.deepEqual(t.objects,before[i]));
  assert.equal(northwood.toolbar,undefined);
  assert.deepEqual(migrateSession(migrated),migrated);validateSession(migrated);
});

test('Northwood profiles, progress, edited hand anchors and exhibition snapshots survive JSON round trips',()=>{
  const project=createProject('for-northwood');project.activeSetupProfileId='nw-full';
  const editor=openEditor(project),slot=editor.objects.find(o=>o.nwRole==='hand');
  Object.assign(slot,{x:200,y:1100,spacing:120});
  const saved=saveEditorDraft(editor),s=startOpening(saved,'nw-full',rng(1));
  role(s,'ally')[0].rotation=90;
  const imported=migrateSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(imported,s);assert.equal(imported.setupProfiles.length,2);
  redealNorthwood(imported,rng(2));
  assert.deepEqual(role(imported,'hand').map(o=>o.x),Array.from({length:8},(_,i)=>200+i*120));
  assert.ok(role(imported,'hand').every(o=>o.y===1100));
  assert.equal(role(imported,'ally')[0].rotation,90);
  const snapshot=makeExhibit(imported),copy=copyProject(snapshot.session,{fromSetup:true});
  assert.equal(copy.awaitingOpening,true);assert.notEqual(copy.projectId,s.projectId);
  const restarted=startOpening(imported,'nw-full',rng(3));
  assert.ok(role(restarted,'ally').every(o=>o.rotation===0));
  assert.equal(restarted.objects.some(o=>o.kind?.startsWith('nw-fief-')),false);validateSession(restarted);
});
