import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelIntent,isPanGesture} from '../src/interactions.js';
import {adjustTokenValue} from '../src/model.js';
import {createIronHelmSession,ironHelm,value} from '../src/games/iron-helm.js';

test('wheel gestures separate idle scrolling, counter adjustment, and Ctrl zoom',()=>{
  const token={type:'token',value:3},scroll={deltaY:-100,deltaMode:0,ctrlKey:false};
  for(const object of [undefined,{type:'card'},{type:'die',value:3},{type:'token'}, {...token,locked:true}])assert.deepEqual(wheelIntent(scroll,object),{kind:'none'});
  assert.deepEqual(wheelIntent(scroll,token),{kind:'counter',delta:1});
  assert.deepEqual(wheelIntent({...scroll,deltaY:100},token),{kind:'counter',delta:-1});
  assert.deepEqual(wheelIntent({...scroll,deltaY:0},token),{kind:'none'});
  const zoom=wheelIntent({...scroll,ctrlKey:true},token);
  assert.equal(zoom.kind,'zoom');assert.ok(zoom.factor>1);
  assert.ok(wheelIntent({...scroll,ctrlKey:true,deltaY:100}).factor<1);
  assert.deepEqual(wheelIntent(scroll,token,{handTool:true}),{kind:'none'});
  assert.deepEqual(wheelIntent({...scroll,ctrlKey:true},token,{dragging:true}),{kind:'none'});
});
test('hand tool takes priority on both objects and empty canvas',()=>{
  assert.equal(isPanGesture(0,false),false);
  assert.equal(isPanGesture(0,true),true);
  assert.equal(isPanGesture(1,false),true);
  assert.equal(isPanGesture(1,true),true);
  assert.equal(isPanGesture(2,true),false);
});
test('counter scrolling respects game limits and adjusts the hovered duplicate only',()=>{
  const s=createIronHelmSession(),health=s.objects.find(o=>o.kind==='ih-health');
  assert.equal(adjustTokenValue(s,health,1,ironHelm.adjustToken),false);
  assert.equal(adjustTokenValue(s,health,-1,ironHelm.adjustToken),true);assert.equal(value(s,'health'),13);
  const duplicate={...health,id:'duplicate',value:7};s.objects.push(duplicate);
  adjustTokenValue(s,duplicate,1,ironHelm.adjustToken);assert.equal(duplicate.value,8);assert.equal(health.value,13);
  const poison=s.objects.find(o=>o.kind==='ih-poison');assert.equal(adjustTokenValue(s,poison,-1,ironHelm.adjustToken),false);
  const morality=s.objects.find(o=>o.kind==='ih-morality');morality.value=-5;assert.equal(adjustTokenValue(s,morality,-1,ironHelm.adjustToken),false);
  health.locked=true;assert.equal(adjustTokenValue(s,health,-1,ironHelm.adjustToken),false);
  const generic={type:'token',value:999};assert.equal(adjustTokenValue(s,generic,1),false);assert.equal(adjustTokenValue(s,generic,-1),true);
});
