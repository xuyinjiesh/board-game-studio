import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,startOpening} from '../src/projects.js';
import {dimensions} from '../src/model.js';
import {cardEdgePlacement,cardDropPlan} from '../src/interactions.js';
import {northwoodCardPlacement} from '../src/games/for-northwood.js';

function table(){
  const s=startOpening(createProject('for-northwood'),'nw-intro',()=>.4);
  const base=s.objects.find(o=>o.assetId==='nw-fief-0'),card=s.objects.find(o=>o.nwRole==='ruler');
  s.objects=[base,card];Object.assign(base,{x:400,y:400,rotation:0});
  Object.assign(card,{x:413,y:447,rotation:0});return {s,base,card};
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} != ${expected}`);

test('edge alignment keeps the staggered fief/ruler offset and never merges cards',()=>{
  const {s,base,card}=table(),original=structuredClone(s);
  const p=northwoodCardPlacement(s,card,{zoom:.5});
  near(p.x,base.x);near(p.y,447);assert.equal(p.kind,'edge');assert.equal(p.guides.length,1);
  assert.deepEqual(s,original,'preview does not change live objects');
  const plan=cardDropPlan(s,card,[card.id],{placementFor:(s,o)=>northwoodCardPlacement(s,o,{zoom:.5})});
  assert.equal(plan.target,null);near(plan.placement.x,400);near(plan.placement.y,447);
});

test('left/right/top/bottom and touching edges align using actual card dimensions',()=>{
  for(const [x,y,w,h,expectedX,expectedY] of [
    [389,454,100,150,380,454], // same left edge
    [431,454,100,150,420,454], // same right edge
    [450,435,100,150,450,422.78], // same bottom edge
    [450,367,100,150,450,377.22], // same top edge
    [530,403,100,150,520,403], // touching to the right, preserving vertical offset
    [450,585,100,150,450,572.78] // touching below
  ]){
    const {s,card}=table();Object.assign(card,{x,y,width:w,height:h});
    const p=cardEdgePlacement(s,card);assert.ok(p);near(p.x,expectedX);near(p.y,expectedY);
  }
});

test('rotated and scaled cards align in the stationary card coordinate system',()=>{
  for(const angle of [0,90,180,270,35]){
    const {s,base,card}=table(),a=angle*Math.PI/180;
    Object.assign(base,{rotation:angle,width:210,height:293.34});
    Object.assign(card,{rotation:angle,width:210,height:293.34,x:400+12*Math.cos(a)-60*Math.sin(a),y:400+12*Math.sin(a)+60*Math.cos(a)});
    const p=cardEdgePlacement(s,card);near(p.x,400-60*Math.sin(a));near(p.y,400+60*Math.cos(a));near(p.rotation,angle);
    near(Math.hypot(p.guides[0].to.x-p.guides[0].from.x,p.guides[0].to.y-p.guides[0].from.y),293.34+60+36);
  }
  const {s,card}=table();Object.assign(card,{x:430,y:450,rotation:90});
  const p=cardEdgePlacement(s,card);near(p.x,427.78);near(p.y,450);near(p.rotation,90);
});

test('alignment stays local, honors snap/locks and excludes screen-space hand cards',()=>{
  for(const modify of [s=>s.settings.snap=false,(s,c)=>c.locked=true,(s,c)=>c.handId='nw-hand',(s,c,b)=>b.handId='nw-hand',(s,c)=>c.rotation=30,(s,c)=>c.x=1200]){
    const {s,base,card}=table();modify(s,card,base);assert.equal(cardEdgePlacement(s,card),null);
  }
  const {s,base,card}=table();base.locked=true;assert.ok(cardEdgePlacement(s,card),'locked cards can act as alignment anchors');
});

test('screen-space attraction is consistent across zoom and piles retain drop priority',()=>{
  const {s,base,card}=table();card.x=base.x+22;
  assert.equal(northwoodCardPlacement(s,card,{zoom:1}),null);
  assert.ok(northwoodCardPlacement(s,card,{zoom:.4}));
  const pile={...base,id:'pile',type:'deck',cards:[],fixedPosition:true,snapCards:true,maxCards:65,x:card.x,y:card.y};
  s.objects.push(pile);
  const plan=cardDropPlan(s,card,[card.id],{placementFor:northwoodCardPlacement});
  assert.equal(plan.target.id,'pile');assert.equal(plan.placement,null);
  assert.equal(dimensions(s,card).w,140);
});
