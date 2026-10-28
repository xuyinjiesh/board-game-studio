import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,baseObject,drawDestination,drawFromDeck,validateSession,captureSetup,applySetup,createDealSlot,mergeCards} from '../src/model.js';
import {saveEditorDraft,openEditor,startOpening,makeExhibit,copyProject} from '../src/projects.js';
function table(){
  const s=createSession('发牌测试');
  s.assets=[{id:'a',type:'card',name:'牌',width:160,height:240,front:'/assets/card-01-front.webp'}];
  s.objects=[{...baseObject('deck',100,200),cards:['a','a','a'],name:'来源',faceUp:false,width:120,height:180,drawTarget:{x:-340,y:760,rotation:90}}];
  return s;
}
test('click draws use authored position and angle, while dragging uses the source position',()=>{
  const s=table(),d=s.objects[0],target=structuredClone(d.drawTarget);
  for(let i=0;i<2;i++){
    const c=drawFromDeck(s,d);
    assert.equal(c.x,target.x);assert.equal(c.y,target.y);assert.equal(c.rotation,90);
    assert.equal(c.faceUp,false);assert.equal(c.width,120);assert.equal(c.height,180);
  }
  const drag=drawFromDeck(s,d,true,d);assert.equal(drag.x,100);assert.equal(drag.y,200);assert.equal(drag.faceUp,true);
  assert.deepEqual(d.drawTarget,target);assert.equal(d.cards.length,0);assert.equal(drawFromDeck(s,d),null);
});
test('targets persist through editing, opening, export, copy and JSON import',()=>{
  const s=saveEditorDraft(table()),expected=s.objects[0].drawTarget;
  const play=startOpening(s);drawFromDeck(play,play.objects[0]);
  for(const state of [openEditor(play),copyProject(s),makeExhibit(s).session,validateSession(JSON.parse(JSON.stringify(s)))])assert.deepEqual(state.objects[0].drawTarget,expected);
  assert.equal(openEditor(play).objects[0].cards.length,3);
});
test('an opening deal can assign the target of its generated deck',()=>{
  const s=table(),d=s.objects[0];delete d.drawTarget;
  const slot=createDealSlot(s,d);slot.layout='deck';slot.count=2;slot.drawTarget={x:800,y:900,rotation:-90};s.objects.push(slot);
  const play=applySetup(s,captureSetup(s)),pile=play.objects.find(o=>o.type==='deck'&&o.name===slot.name);
  assert.deepEqual(pile.drawTarget,slot.drawTarget);
  const card=drawFromDeck(play,pile);assert.equal(card.x,800);assert.equal(card.y,900);assert.equal(card.rotation,-90);
});
test('invalid target coordinates and targets attached to single cards are rejected',()=>{
  for(const bad of [null,{x:Infinity,y:0,rotation:0},{x:0,y:10001,rotation:0},{x:0,y:0,rotation:361}]){
    const s=table();s.objects[0].drawTarget=bad;assert.throws(()=>validateSession(s),/点击发牌/);
    assert.throws(()=>applySetup(s,captureSetup(s)),/点击发牌/);
  }
  const s=table();s.objects.push({...baseObject('card',0,0),assetId:'a',drawTarget:{x:0,y:0,rotation:0}});assert.throws(()=>validateSession(s),/点击发牌/);
});
test('merging back into a pile retains its target independently',()=>{
  const s=table(),d=s.objects[0],card=drawFromDeck(s,d),target=structuredClone(d.drawTarget);
  const merged=mergeCards(s,[card.id,d.id]);assert.deepEqual(merged.drawTarget,target);
  merged.drawTarget.x=500;assert.equal(d.drawTarget.x,target.x);
});
test('relative positions follow the source pile and honor gap and orientation',()=>{
  const s=table(),d=s.objects[0];
  for(const [mode,x,y] of [['right',250,200],['left', -50,200],['below',100,410],['above',100,-10],['center',100,200]]){
    d.drawTarget={mode,gap:30};assert.deepEqual(drawDestination(s,d),{x,y,rotation:0});
  }
  d.x=600;d.y=700;d.rotation=90;d.drawTarget={mode:'right',gap:20};
  const p=drawDestination(s,d);assert.equal(p.x,800);assert.equal(p.y,700);assert.equal(p.rotation,90);
  d.drawTarget={mode:'below',gap:0};assert.equal(drawDestination(s,d).y,820);
});
test('dealing to another deck preserves every card and its persistent identity after restart',()=>{
  const s=table(),source=s.objects[0],target={...baseObject('deck',500,600),name:'弃牌堆',cards:[],drawKey:'discard',faceUp:true,fixedPosition:true};
  s.objects.push(target);source.drawTarget={mode:'deck',deckKey:'discard'};
  const saved=saveEditorDraft(s),play=startOpening(saved),from=play.objects[0],to=play.objects[1];
  assert.notEqual(to.id,target.id);to.x=900;
  assert.equal(drawDestination(play,from).x,900);
  const result=drawFromDeck(play,from,true);
  assert.equal(result,to);assert.equal(play.objects.length,2);assert.deepEqual(to.cards,['a']);assert.equal(to.faceUp,true);assert.equal(from.cards.length,2);
  assert.deepEqual(openEditor(play).objects[1].cards,[]);
  assert.equal(copyProject(saved).objects[0].drawTarget.deckKey,'discard');
});
test('a generated opening pile can be a destination across fresh runtime IDs',()=>{
  const s=table(),source=s.objects[0],slot=createDealSlot(s,source);slot.layout='deck';slot.count=1;slot.drawKey='generated';s.objects.push(slot);
  source.drawTarget={mode:'deck',deckKey:'generated'};
  const play=applySetup(s,captureSetup(s));
  const result=drawFromDeck(play,play.objects.find(o=>o.type==='deck'&&o.name==='来源'));
  assert.equal(result.drawKey,'generated');assert.equal(result.cards.length,2);
});
test('missing, locked, full or self destinations cannot consume the source top card',()=>{
  for(const condition of ['missing','locked','full','self']){
    const s=table(),d=s.objects[0];d.drawKey='source';d.drawTarget={mode:'deck',deckKey:condition==='self'?'source':'target'};
    if(condition!=='missing')s.objects.push({...baseObject('deck',0,0),cards:condition==='full'?Array(500).fill('a'):[],drawKey:'target',locked:condition==='locked'});
    const before=structuredClone(s);assert.throws(()=>drawFromDeck(s,d));assert.deepEqual(s,before);
  }
});
test('invalid modes, gaps and duplicated persistent pile IDs are rejected',()=>{
  for(const drawTarget of [{mode:'unknown'},{mode:'below',gap:-1},{mode:'right',gap:Infinity},{mode:'deck',deckKey:42}]){
    const s=table();s.objects[0].drawTarget=drawTarget;assert.throws(()=>validateSession(s),/点击发牌/);
  }
  const s=table();s.objects[0].drawKey='same';s.objects.push({...baseObject('deck',0,0),cards:[],drawKey:'same'});assert.throws(()=>validateSession(s),/目标编号/);
});
