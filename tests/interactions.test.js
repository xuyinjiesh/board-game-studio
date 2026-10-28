import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelIntent,isPanGesture,findCardSnapTarget,snapCardOnto,startDeckPress,DECK_HOLD_MS} from '../src/interactions.js';
import {drawFromDeck,adjustTokenValue} from '../src/model.js';
import {createIronHelmSession,ironHelm,value} from '../src/games/iron-helm.js';
import {scheduleDeckDraw,DECK_CLICK_MS} from '../src/interactions.js';
import {startDeckMenuPress} from '../src/interactions.js';

test('a stationary long press opens the pile menu once; release, movement or cancellation before it prevent opening',()=>{
  let callback,delay,opened=0,canceled=0;
  const options={schedule:(fn,ms)=>{callback=fn;delay=ms;return 1;},cancel:()=>canceled++};
  const hold=startDeckMenuPress(()=>opened++,options);assert.equal(delay,DECK_HOLD_MS);assert.equal(opened,0);
  callback();callback();hold.finish();assert.equal(opened,1);
  for(const action of ['finish','cancel']){const press=startDeckMenuPress(()=>opened++,options);press[action]();callback();}
  assert.equal(opened,1);assert.equal(canceled,2);
});

test('a deck click waits for a double click and canceled draws cannot consume cards',()=>{
  let callback,delay,draws=0,canceled=0;
  const schedule=(fn,ms)=>{callback=fn;delay=ms;return 42;},cancel=id=>{assert.equal(id,42);canceled++;};
  const first=scheduleDeckDraw(()=>draws++,{schedule,cancel});assert.equal(delay,DECK_CLICK_MS);assert.equal(draws,0);
  first.cancel();callback();assert.equal(draws,0);assert.equal(canceled,1);
  const single=scheduleDeckDraw(()=>draws++,{schedule,cancel});callback();single.cancel();assert.equal(draws,1);assert.equal(canceled,1);
});

test('short deck presses and early drags cancel the long-press callback',()=>{
  let callback,delay,held=0,cancelled=0;
  const press=startDeckPress(()=>held++,{schedule:(fn,ms)=>{callback=fn;delay=ms;return 7;},cancel:id=>{assert.equal(id,7);cancelled++;}});
  assert.equal(delay,DECK_HOLD_MS);assert.equal(press.finish(),'card');
  callback();assert.equal(held,0);assert.equal(cancelled,1);
  assert.equal(press.finish(),'card');assert.equal(cancelled,1);
});
test('holding a deck selects the whole stack, while cancellation never triggers pickup',()=>{
  let callback,held=0;
  const options={schedule:fn=>{callback=fn;return 1;},cancel:()=>{}};
  const hold=startDeckPress(()=>held++,options);callback();assert.equal(hold.finish(),'deck');assert.equal(held,1);
  const aborted=startDeckPress(()=>held++,options);aborted.cancel();callback();assert.equal(held,1);
});

test('fixed piles never arm a whole-pile hold and can only drag a top card',()=>{
  let scheduled=0,held=0;
  const press=startDeckPress(()=>held++,{fixedPosition:true,schedule:()=>{scheduled++;return 1;}});
  assert.equal(scheduled,0);assert.equal(press.finish(),'card');press.cancel();assert.equal(held,0);
  const s=createIronHelmSession(),deck=s.objects.find(o=>o.type==='deck'),card=drawFromDeck(s,deck);
  assert.equal(findCardSnapTarget(s,deck),null);assert.equal(snapCardOnto(s,deck,card),false);
  assert.equal(snapCardOnto(s,card,deck),true);
});

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

test('card magnet detects the top destination in its rotated center, leaving edge overlaps free',()=>{
  const lower={id:'lower',type:'card',assetId:'a',x:300,y:300,z:1,rotation:90};
  const upper={...lower,id:'upper',z:2};
  const moving={...lower,id:'moving',x:345,y:320,z:3,rotation:0};
  const s={assets:[{id:'a',width:160,height:224}],objects:[lower,upper,moving]};
  assert.equal(findCardSnapTarget(s,moving).id,'upper');
  upper.locked=true;assert.equal(findCardSnapTarget(s,moving).id,'lower');
  assert.equal(findCardSnapTarget(s,moving,['moving','lower']),null);
  moving.x=380;assert.equal(findCardSnapTarget(s,moving),null);
  moving.x=300;moving.type='token';assert.equal(findCardSnapTarget(s,moving),null);
});

test('magnetic placement preserves both cards, their roles and faces, and puts the moved card on top',()=>{
  const s=createIronHelmSession(),moving=drawFromDeck(s,s.objects.find(o=>o.ihRole==='inventory')),target=drawFromDeck(s,s.objects.find(o=>o.ihRole==='hero'));s.objects=s.objects.filter(o=>o.type!=='deck');
  const original=structuredClone(s),identity={id:moving.id,assetId:moving.assetId,faceUp:moving.faceUp,ihRole:moving.ihRole};
  target.rotation=90;
  assert.equal(snapCardOnto(s,moving,target),true);
  assert.deepEqual([moving.x,moving.y,moving.rotation],[target.x,target.y,90]);
  assert.ok(moving.z>target.z);assert.equal(s.objects.length,original.objects.length);
  assert.deepEqual({id:moving.id,assetId:moving.assetId,faceUp:moving.faceUp,ihRole:moving.ihRole},identity);
  assert.equal(snapCardOnto(s,moving,moving),false);
  target.locked=true;assert.equal(snapCardOnto(s,moving,target),false);
});
