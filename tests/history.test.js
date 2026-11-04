import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryCodec} from '../src/history.js';
import {createSession,validateSession} from '../src/model.js';
import {loadGame} from '../src/game-registry.js';
import {startOpening} from '../src/project-session.js';

test('sixty movement snapshots share image resources without serializing them',()=>{
  const codec=createHistoryCodec(),state=createSession('图片桌面');
  state.assets=[{id:'art',type:'card',name:'图片',front:'data:image/webp;base64,'+'A'.repeat(1024*1024),width:160,height:240}];
  const snapshots=[];
  for(let i=0;i<60;i++){state.name=`桌面 ${i}`;snapshots.push(codec.capture(state));}
  assert.equal(new Set(snapshots.map(s=>s.assets[0])).size,1);
  assert.ok(snapshots.every(s=>!s.data.includes('data:image')));
  assert.ok(snapshots.reduce((n,s)=>n+s.data.length+s.assets[0].data.length,0)<100000);
  assert.deepEqual(codec.restore(snapshots[59]),state);
});

test('asset import, replacement, removal and metadata edits restore independent versions',()=>{
  const codec=createHistoryCodec(),state=createSession(),empty=codec.capture(state);
  state.assets.push({id:'art',type:'card',name:'初稿',front:'data:image/png;base64,AAAA',width:160,height:240,extra:{tags:['原版']}});
  const imported=codec.capture(state);
  state.assets[0].back='data:image/webp;base64,BBBB';state.assets[0].name='修改';state.assets[0].extra.tags.push('新');
  const edited=codec.capture(state);
  state.assets=[];const removed=codec.capture(state);
  assert.equal(codec.restore(imported).assets[0].back,undefined);
  assert.equal(codec.restore(edited).assets[0].back,'data:image/webp;base64,BBBB');
  assert.deepEqual(codec.restore(imported).assets[0].extra.tags,['原版']);
  assert.deepEqual(codec.restore(empty).assets,[]);assert.deepEqual(codec.restore(removed).assets,[]);
  const restored=codec.restore(edited);restored.assets[0].extra.tags.push('污染');restored.assets[0].front='changed';
  assert.deepEqual(codec.restore(edited).assets[0].extra.tags,['原版','新']);
  assert.equal(codec.restore(edited).assets[0].front,'data:image/png;base64,AAAA');
  codec.clear();assert.deepEqual(codec.restore(edited).assets[0].extra.tags,['原版','新']);
});

test('undo, redo and canceled changes preserve hands, pile faces and authored openings',async()=>{
  const codec=createHistoryCodec(),game=await loadGame('for-northwood');
  let state=startOpening(game.create(()=>.5),'nw-full');
  const before=structuredClone(state),undo=codec.capture(state);
  const card=state.objects.find(o=>o.handId);card.faceUp=!card.faceUp;card.handOrder+=100;card.rotation=90;
  const after=structuredClone(state),redo=codec.capture(state);
  state=codec.restore(undo);assert.deepEqual(state,before);validateSession(state);
  state=codec.restore(redo);assert.deepEqual(state,after);validateSession(state);
  const canceled=codec.capture(state);state.objects.pop();state=codec.restore(canceled);
  assert.deepEqual(state,after);
});
