import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,captureSetup,validateSession,baseObject,applySetup} from '../src/model.js';
import {createGroveSession,builtinAssets} from '../src/games/grove.js';
import {createProject,copyProject,migrateSession,makeExhibit,gameFor,saveEditorDraft,openEditor,createPlaySession,startOpening} from '../src/projects.js';

test('saving the editor captures positions and individual opening policies directly',()=>{
  const s={...createProject('grove'),mode:'edit'},decks=s.objects.filter(o=>o.type==='deck');
  decks[0].x=321;decks[0].setupOrder='fixed';decks[1].setupOrder='shuffle';
  const token=s.objects.find(o=>o.type==='token');token.faceUp=false;token.setupFace='fixed';token.value=7;
  const baseline=structuredClone(s),saved=saveEditorDraft(s),exhibit=makeExhibit(saved);
  assert.deepEqual(s,baseline);assert.equal(saved.setup.randomizeCards,false);
  assert.equal(saved.setup.objects.find(o=>o.type==='deck').x,321);
  assert.deepEqual(saved.setup.objects.filter(o=>o.type==='deck').map(o=>o.setupOrder),['fixed','shuffle']);
  const opening=applySetup(exhibit.session,exhibit.session.setup,()=>0);
  assert.deepEqual(opening.objects.filter(o=>o.type==='deck')[0].cards,decks[0].cards);
  assert.notDeepEqual(opening.objects.filter(o=>o.type==='deck')[1].cards,decks[1].cards);
  assert.equal(opening.objects.find(o=>o.type==='token').faceUp,false);
  assert.equal(opening.objects.find(o=>o.type==='token').value,7);
  const imported=migrateSession(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(imported.setup,saved.setup);
});

test('play autosaves keep the authored opening; editing restores its unshuffled layout',()=>{
  const authored=saveEditorDraft(openEditor(createProject('grove')));
  const playing={...applySetup(authored,authored.setup,()=>0),mode:'play'};
  playing.objects[0].x=987;playing.objects.find(o=>o.type==='deck').cards.pop();
  const saved=saveEditorDraft(playing);
  assert.deepEqual(saved.setup,authored.setup);assert.equal(saved.objects[0].x,987);
  const editor=openEditor(saved);
  assert.equal(editor.mode,'edit');assert.deepEqual(captureSetup(editor).objects,authored.setup.objects);
  assert.equal(editor.projectId,authored.projectId);
  const published=makeExhibit(saved);const original=structuredClone(published);
  editor.objects[0].x=123;saveEditorDraft(editor);
  assert.deepEqual(published,original);
});

test('a blank workshop has its own assets and opening, with no game-specific behavior',()=>{
  const blank=createProject('custom','桌游 A'),grove=createProject('grove');
  assert.equal(blank.gameId,'custom');assert.equal(gameFor(blank.gameId),undefined);
  assert.deepEqual(blank.assets,[]);assert.deepEqual(blank.objects,[]);
  assert.deepEqual(applySetup(blank,blank.initialSetup).objects,[]);
  assert.equal(grove.assets.length,18);assert.equal(grove.objects.length,22);
  assert.equal(gameFor(grove.gameId).id,'grove');
  blank.assets.push({id:'private'});assert.equal(grove.assets.length,18);
});

test('legacy workspaces migrate without moving pieces or changing authored setup',()=>{
  const old=createGroveSession(()=>.4);old.setup=captureSetup(old);old.objects[0].x=527;
  delete old.projectId;delete old.gameId;delete old.meta;delete old.initialSetup;old.assets=[];
  const migrated=migrateSession(old);
  assert.deepEqual(migrated.objects,old.objects);assert.deepEqual(migrated.setup,old.setup);
  assert.equal(migrated.assets.length,18);assert.equal(migrated.gameId,'grove');
  assert.ok(migrated.projectId);assert.deepEqual(validateSession(migrated),migrated);
  assert.deepEqual(migrateSession(migrated),migrated);
});

test('legacy custom table receives only referenced Grove images and remains generic',()=>{
  const old=createGroveSession();old.objects=old.objects.filter(o=>o.type==='card').slice(0,1);
  delete old.projectId;delete old.gameId;delete old.meta;delete old.initialSetup;old.blank=true;old.assets=[];
  const migrated=migrateSession(old);
  assert.equal(migrated.gameId,'custom');assert.equal(migrated.assets.length,1);
  assert.equal(migrated.assets[0].id,old.objects[0].assetId);
});

test('exhibition saves authored opening independently of live progress; copies are isolated',()=>{
  const s=createGroveSession();s.setup=captureSetup(s);s.objects[0].x=999;s.setupDraft='{unfinished';
  const exhibit=makeExhibit(s),copy=copyProject(exhibit.session,{fromSetup:true});
  assert.notEqual(exhibit.session.objects[0].x,999);
  assert.equal(exhibit.session.setupDraft,undefined);
  assert.equal(s.setupDraft,'{unfinished');
  assert.notEqual(copy.projectId,s.projectId);assert.match(copy.name,/副本/);
  copy.objects[0].x=123;copy.assets[0].name='changed';
  assert.notEqual(exhibit.session.objects[0].x,123);
  assert.notEqual(exhibit.session.assets[0].name,'changed');
  assert.equal(s.objects[0].x,999);
});

test('custom assets, rule notes, arbitrary token kinds and die faces travel with a project',()=>{
  const s=createSession('自定义桌游');s.meta.rules='轮流掷骰。';
  s.assets=[{id:'card-a',type:'card',name:'A',width:160,height:240,front:builtinAssets[0].front}];
  s.objects=[{...baseObject('card',200,200),assetId:'card-a',faceUp:true},{...baseObject('token',400,200),kind:'victory-counter'},{...baseObject('die',500,200),color:'ivory',faces:[1,3,5,7,9,11],value:11}];
  s.setup=captureSetup(s);
  const imported=migrateSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(imported,s);assert.equal(imported.assets.length,1);
  assert.throws(()=>makeExhibit(createSession()));
});

test('invalid project rules, opening and asset references are rejected',()=>{
  for(const corrupt of [s=>s.meta.rules=3,s=>s.name='',s=>s.projectId={},s=>s.initialSetup.objects.push({...baseObject('card',0,0),assetId:'absent'})]){
    const s=createSession();corrupt(s);assert.throws(()=>validateSession(s));
  }
});

test('gallery play starts from the published opening with an independent progress identity',()=>{
  const source=createProject('grove','果丛'),before=structuredClone(source);
  source.objects[0].x=999;
  const first=createPlaySession(source,'example:grove'),second=createPlaySession(source,'example:grove');
  assert.equal(first.mode,'play');assert.equal(first.playOriginKey,'example:grove');
  assert.notEqual(first.projectId,source.projectId);assert.notEqual(first.projectId,second.projectId);
  const positions=session=>session.objects.map(o=>JSON.stringify([o.type,o.x,o.y])).sort();
  assert.deepEqual(positions(first),positions(startOpening(before)));
  assert.equal(source.objects[0].x,999);assert.equal(source.playOriginKey,undefined);
  first.objects[0].x=111;assert.notEqual(second.objects[0].x,111);
  assert.equal(migrateSession(JSON.parse(JSON.stringify(first))).playOriginKey,'example:grove');
});

test('opening choices and editing a played gallery game preserve separate progress and draft identities',()=>{
  const source=createProject('iron-helm'),play=createPlaySession(source,'example:iron-helm');
  assert.equal(play.awaitingOpening,true);assert.deepEqual(play.objects,[]);
  const started=startOpening(play,play.setupProfiles[0].id,()=>.5);
  assert.equal(started.awaitingOpening,undefined);assert.equal(started.playOriginKey,'example:iron-helm');
  const editor=openEditor(started);
  assert.equal(editor.mode,'edit');assert.equal(editor.playOriginKey,undefined);
  assert.equal(editor.originKey,started.originKey);assert.notEqual(editor.projectId,started.projectId);
  assert.equal(makeExhibit(started).session.playOriginKey,undefined);
  assert.equal(started.playOriginKey,'example:iron-helm');
  for(const invalid of ['',3,{},'x'.repeat(201)])assert.throws(()=>validateSession({...started,playOriginKey:invalid}));
});
