import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,captureSetup,validateSession,baseObject,applySetup} from '../src/model.js';
import {createGroveSession,builtinAssets} from '../src/games/grove.js';
import {createProject,copyProject,migrateSession,makeExhibit,gameFor} from '../src/projects.js';

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
