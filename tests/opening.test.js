import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,baseObject,captureSetup,applySetup,validateSession,validateSetup,createDealSlot} from '../src/model.js';
import {builtinAssets} from '../src/games/grove.js';
import {createProject,saveEditorDraft,openEditor,addSetupProfile,switchSetupProfile,renameSetupProfile,removeSetupProfile,startOpening,makeExhibit,copyProject,migrateSession} from '../src/projects.js';

function fixture(){
  const s=createSession('发牌测试');s.assets=structuredClone(builtinAssets.slice(0,10));
  s.objects=[{...baseObject('deck',100,200),setupKey:'a',name:'装备牌',cards:s.assets.slice(0,6).map(a=>a.id),setupOrder:'fixed',faceUp:false},{...baseObject('deck',700,200),setupKey:'b',name:'事件牌',cards:s.assets.slice(6).map(a=>a.id),setupOrder:'shuffle',faceUp:false},{...baseObject('token',300,500),kind:'disc',value:10}];
  return s;
}
const inventory=s=>s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]).sort();
function addSlot(s,deck,options={}){const slot={...createDealSlot(s,deck),...options};s.objects.push(slot);return slot;}

test('opening deals consume each source once, after independent shuffles, conserving every card',()=>{
  const s=fixture(),a=s.objects[0],b=s.objects[1];
  addSlot(s,a,{count:2,x:200,y:450,rotation:90,spacing:50,locked:true});
  addSlot(s,a,{count:2,layout:'deck',name:'初始装备',faceUp:false});
  addSlot(s,b,{count:3,setupFace:'random'});
  const before=structuredClone(s),setup=captureSetup(s),played=applySetup(s,setup,()=>0);
  assert.deepEqual(s,before);assert.deepEqual(inventory(played),inventory(s));assert.ok(!played.objects.some(o=>o.type==='deal'));
  const remaining=played.objects.filter(o=>o.type==='deck');
  assert.deepEqual(remaining[0].cards,['grove-1','grove-2']);assert.equal(remaining[1].cards.length,1);
  const dealt=played.objects.filter(o=>o.type==='card');assert.deepEqual(dealt.slice(0,2).map(o=>o.assetId),['grove-6','grove-5']);
  assert.equal(dealt[0].x,200);assert.equal(dealt[1].y,500);assert.equal(dealt[1].rotation,90);assert.equal(dealt[1].locked,true);
  const equipment=remaining.find(o=>o.name==='初始装备');assert.deepEqual(equipment.cards,['grove-3','grove-4']);assert.equal(equipment.faceUp,false);
  assert.ok(dealt.slice(2).every(o=>o.faceUp===false));
  const again=applySetup(s,setup,()=>.99);assert.deepEqual(inventory(again),inventory(s));assert.notEqual(played.objects[0].id,again.objects[0].id);
});

test('missing sources, cumulative overdraw, invalid fields and duplicate source keys fail without mutation',()=>{
  for(const corrupt of [s=>s.objects.at(-1).sourceKey='missing',s=>s.objects.at(-1).count=7,s=>s.objects.at(-1).count=1.5,s=>s.objects.at(-1).spacing=Infinity,s=>s.objects[1].setupKey='a']){
    const s=fixture();addSlot(s,s.objects[0]);corrupt(s);const before=structuredClone(s);
    assert.throws(()=>applySetup(s,captureSetup(s)));assert.deepEqual(s,before);
    assert.throws(()=>validateSession(s));
  }
  const s=fixture();addSlot(s,s.objects[0],{count:4});addSlot(s,s.objects[0],{count:3});
  assert.throws(()=>validateSetup(captureSetup(s),s),/需要发 7 张/);
  s.objects.pop();s.objects.at(-1).count=6;assert.throws(()=>createDealSlot(s,s.objects[0]),/没有可分配/);
});

test('fixed sources deal in explicit priority order and reject out-of-bounds spreads',()=>{
  const s=fixture();addSlot(s,s.objects[0],{name:'后发',order:2,x:2000});addSlot(s,s.objects[0],{name:'先发',order:1,x:1000});
  const played=applySetup(s,captureSetup(s),()=>0),cards=played.objects.filter(o=>o.type==='card');
  assert.equal(cards[0].name,'先发');assert.equal(cards[0].assetId,'grove-6');assert.equal(cards[0].x,1000);
  assert.equal(cards[1].assetId,'grove-5');assert.equal(cards[1].x,2000);
  s.objects.at(-1).count=2;s.objects.at(-1).x=9999;s.objects.at(-1).spacing=200;
  assert.throws(()=>applySetup(s,captureSetup(s)),/超出桌面范围/);
});

test('role switching captures current edits and restores independent layouts and rules',()=>{
  let s=fixture();addSlot(s,s.objects[0],{count:2});
  s=addSetupProfile(s,'战士');const warrior=s.activeSetupProfileId,base=s.setupProfiles[0].id;
  s.objects.find(o=>o.type==='token').value=16;s.objects.find(o=>o.type==='deal').count=3;
  s=addSetupProfile(s,'法师');const mage=s.activeSetupProfileId;
  s.objects.find(o=>o.type==='token').value=8;s.objects[0].x=900;s.objects.find(o=>o.type==='deal').faceUp=false;
  s=switchSetupProfile(s,warrior);assert.equal(s.objects.find(o=>o.type==='token').value,16);assert.equal(s.objects.find(o=>o.type==='deal').count,3);assert.equal(s.objects[0].x,100);
  s=switchSetupProfile(s,mage);assert.equal(s.objects.find(o=>o.type==='token').value,8);assert.equal(s.objects[0].x,900);assert.equal(s.objects.find(o=>o.type==='deal').faceUp,false);
  const initial=startOpening(s,warrior,()=>0);assert.equal(initial.objects.find(o=>o.type==='token').value,16);assert.equal(initial.objects.filter(o=>o.type==='card').length,3);
  initial.objects.find(o=>o.type==='token').value=1;
  const reopened=openEditor(saveEditorDraft(initial));assert.equal(reopened.objects.find(o=>o.type==='token').value,16);assert.ok(reopened.objects.some(o=>o.type==='deal'));
  s=switchSetupProfile(s,base);assert.equal(s.objects.find(o=>o.type==='token').value,10);
});

test('all role plans and source references survive JSON, plaza copies, rename, removal and validation',()=>{
  let s=fixture();addSlot(s,s.objects[0],{count:2});s=addSetupProfile(s,'战士');s=renameSetupProfile(s,'骑士');
  const saved=saveEditorDraft(s),imported=migrateSession(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(imported.setupProfiles,saved.setupProfiles);
  const exhibit=makeExhibit(saved),copy=copyProject(exhibit.session,{fromSetup:true});
  assert.notEqual(copy.projectId,saved.projectId);assert.equal(copy.awaitingOpening,true);assert.deepEqual(copy.objects,[]);
  const started=startOpening(copy,copy.activeSetupProfileId,()=>0);assert.equal(started.objects.filter(o=>o.type==='card').length,2);assert.equal(started.awaitingOpening,undefined);
  assert.equal(openEditor(copy).awaitingOpening,undefined);
  assert.deepEqual(copy.setupProfiles,saved.setupProfiles);
  copy.setupProfiles[0].setup.objects[0].x=999;assert.notEqual(exhibit.session.setupProfiles[0].setup.objects[0].x,999);
  assert.throws(()=>addSetupProfile(s,'骑士'),/已存在/);assert.throws(()=>switchSetupProfile(s,'missing'));
  assert.throws(()=>validateSession({...s,activeSetupProfileId:'missing'}));
  const corrupt=structuredClone(s);corrupt.setupProfiles[0].setup.objects.find(o=>o.type==='deal').sourceKey='absent';assert.throws(()=>validateSession(corrupt));
  const reduced=removeSetupProfile(s);assert.equal(reduced.setupProfiles.length,1);assert.throws(()=>removeSetupProfile(reduced));
});

test('Grove edited openings retain random initial singles and random 6/9 piles on every new game',()=>{
  const editor=openEditor(createProject('grove'));assert.equal(editor.objects.filter(o=>o.type==='deal').length,5);
  const saved=saveEditorDraft(editor),first=startOpening(saved,undefined,()=>0),second=startOpening(saved,undefined,()=>.99);
  for(const game of [first,second]){assert.equal(game.objects.length,22);assert.deepEqual(game.objects.filter(o=>o.type==='deck').map(o=>o.cards.length),[6,9]);assert.equal(new Set(inventory(game)).size,18);assert.ok(!game.objects.some(o=>o.type==='deal'||o.setupHideEmpty));}
  assert.notDeepEqual(first.objects.filter(o=>o.type==='card').map(o=>o.assetId),second.objects.filter(o=>o.type==='card').map(o=>o.assetId));
  const reopened=openEditor(first);assert.deepEqual(captureSetup(reopened).objects,saved.setup.objects);
  const legacy=fixture();legacy.initialSetup={...captureSetup(legacy),randomizeCards:true};delete legacy.objects[0].setupOrder;delete legacy.objects[1].setupOrder;
  const legacySaved=saveEditorDraft(legacy);assert.equal(legacySaved.setup.randomizeCards,true);assert.ok(legacySaved.setup.objects.filter(o=>o.type==='deck').every(o=>o.setupOrder===undefined));
});

test('Iron Helm exposes four editable role openings with their own starting resources',()=>{
  const s=createProject('iron-helm');assert.equal(s.setupProfiles.length,4);
  for(const [index,health] of [14,12,14,16].entries()){
    const profile=s.setupProfiles[index],played=startOpening(s,profile.id,()=>0);
    assert.equal(played.objects.find(o=>o.kind==='ih-health').value,health);
    assert.equal(played.objects.find(o=>o.ihRole==='hero').assetId,`ih-hero-${index+1}`);
    assert.equal(played.activeSetupProfileId,profile.id);
  }
});
