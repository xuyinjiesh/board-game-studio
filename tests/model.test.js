import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {builtinAssets,newGame,assetFor,scoreTable,treeAt,snapCard,drawFromDeck,mergeCards,validateSession,shuffled,baseObject,captureSetup,validateSetup,applySetup} from '../src/model.js';

test('setup restores a captured layout with fresh IDs and survives session export/import',()=>{
  const s=newGame();s.setup=captureSetup(s);const before=structuredClone(s);
  s.objects[0].x=999;s.objects.find(o=>o.type==='die').value=10;
  const restored=applySetup(validateSession(JSON.parse(JSON.stringify(s))));
  assert.deepEqual(captureSetup(restored),before.setup);
  assert.notEqual(restored.objects[0].id,before.objects[0].id);
  assert.equal(s.objects[0].x,999);assert.deepEqual(restored.setup,before.setup);
});
test('setup randomness conserves every card and pile size, and uses valid die faces',()=>{
  const s=newGame(()=>.5),setup=captureSetup(s);setup.randomizeCards=true;setup.rollDice=true;setup.shuffleDecks=true;
  const result=applySetup(s,setup,()=>0);
  const inventory=objects=>objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:[]).sort();
  assert.deepEqual(inventory(result.objects),inventory(s.objects));
  assert.deepEqual(result.objects.filter(o=>o.type==='deck').map(o=>o.cards.length),[6,9]);
  assert.notEqual(result.objects[0].assetId,s.objects[0].assetId);
  assert.ok(result.objects.filter(o=>o.type==='die').every(o=>o.faces.includes(o.value)));
  assert.deepEqual(captureSetup(s).objects,setup.objects);
});
test('invalid setup cannot enter a saved session or overwrite the live table',()=>{
  const s=newGame(),baseline=structuredClone(s);
  for(const corrupt of [p=>p.objects[0].x=Infinity,p=>p.objects[0].assetId='missing',p=>p.rollDice='yes',p=>p.objects.find(o=>o.type==='die').value=99]){
    const setup=captureSetup(s);corrupt(setup);
    assert.throws(()=>validateSetup(setup,s));assert.throws(()=>validateSession({...s,setup}));
    assert.throws(()=>applySetup(s,setup));assert.deepEqual(s,baseline);
  }
});

test('Grove opens with all 18 unique cards split into 9 playable and 9 reserve, 15 dice and two tokens',()=>{
  const s=newGame(()=>.42),cards=s.objects.filter(o=>o.type==='card'),decks=s.objects.filter(o=>o.type==='deck');
  assert.equal(cards.length,3);assert.equal(decks.find(o=>!o.reserve).cards.length,6);assert.equal(decks.find(o=>o.reserve).cards.length,9);
  assert.equal(new Set([...cards.map(c=>c.assetId),...decks.flatMap(d=>d.cards)]).size,18);
  for(const color of ['orange','lemon','lime'])assert.equal(s.objects.filter(o=>o.type==='die'&&o.color===color).length,5);
  assert.equal(s.objects.filter(o=>o.type==='token').length,2);
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(s))),s);
});
test('each source card has five fruit trees, one clearing, and two actual texture files',async()=>{
  for(const a of builtinAssets){assert.equal(a.cells.length,6);assert.equal(a.cells.filter(Boolean).length,5);await access(`public${a.front}`);await access(`public${a.back}`);}
});
test('draw consumes exactly the top card, and stack conserves every card',()=>{
  const s=newGame(),d=s.objects.find(o=>o.type==='deck'&&!o.reserve),last=d.cards.at(-1);
  const c=drawFromDeck(s,d);assert.equal(c.assetId,last);assert.equal(d.cards.length,5);
  const d2=mergeCards(s,[c.id,d.id]);assert.equal(d2.cards.length,6);assert.equal(d2.cards.at(-1),last);
  while(d2.cards.length)drawFromDeck(s,d2);assert.equal(drawFromDeck(s,d2),null);
});
test('shuffle is a permutation and does not mutate the input',()=>{const source=[1,2,3,4,5,6];const shuffledCards=shuffled(source,()=>0);assert.deepEqual(source,[1,2,3,4,5,6]);assert.deepEqual([...shuffledCards].sort(),source);assert.notDeepEqual(shuffledCards,source);});
function simple(){const s=newGame();s.objects=[{...baseObject('card',680,380,1),assetId:'grove-1',faceUp:true}];return s;}
test('score counts matching fruit, ignores reserves, wrong fruit and clearings',()=>{
  const s=simple();for(const [x,y,color,value]of [[640,300,'lime',3],[720,300,'lemon',4],[640,380,'orange',5],[720,380,'orange',10],[1300,500,'lime',6],[640,460,'lime',6]])s.objects.push({...baseObject('die',x,y,10),color,value});
  assert.deepEqual(scoreTable(s).groups,{orange:5,lemon:4,lime:3});assert.equal(scoreTable(s).total,12);
});
test('upper cards determine exposed fruit; face-down cards hide underlying fruit',()=>{
  const s=simple();s.objects.push({...baseObject('die',640,300,20),color:'lime',value:5});assert.equal(scoreTable(s).total,5);
  s.objects.push({...baseObject('card',680,380,2),assetId:'grove-3',faceUp:true});assert.equal(scoreTable(s).total,0);
  s.objects.at(-1).assetId='grove-1';s.objects.at(-1).faceUp=false;assert.equal(scoreTable(s).total,0);
});
test('rotated card coordinates retain correct tree colors',()=>{
  const s=simple();s.objects[0].rotation=90;assert.equal(treeAt(s,760,340).tree.fruit,'lime');assert.equal(treeAt(s,760,420).tree.fruit,'lemon');assert.equal(treeAt(s,680,420).tree,null);
});
test('snap handles quarter turns and preserves square tree centers',()=>{
  for(const angle of [-90,0,90,180,270,360]){const o={x:673,y:371,rotation:angle};snapCard(o);const s=simple();Object.assign(s.objects[0],o);const a=o.rotation*Math.PI/180;for(const dx of [-40,40])for(const dy of [-80,0,80]){const x=o.x+dx*Math.cos(a)-dy*Math.sin(a),y=o.y+dx*Math.sin(a)+dy*Math.cos(a);assert.ok(Math.abs(x/80-Math.round(x/80))<1e-8);assert.ok(Math.abs((y-60)/80-Math.round((y-60)/80))<1e-8);}}
});
test('wheelbarrow adds 15 and squirrel penalizes only orthogonally adjacent scoring dice',()=>{
  const s=simple();s.objects.push({...baseObject('token',640,300,10),kind:'squirrel'},{...baseObject('die',720,300,11),color:'lemon',value:4},{...baseObject('die',640,380,12),color:'orange',value:5},{...baseObject('token',720,460,13),kind:'wheelbarrow'});
  const score=scoreTable(s);assert.equal(score.wheel,15);assert.equal(score.penalty,3);assert.equal(score.total,21);
});
test('untrusted sessions reject invalid coordinates, dice, image URLs, IDs and missing assets',()=>{
  for(const corrupt of [s=>s.objects[0].x=Infinity,s=>s.objects[0].assetId='missing',s=>s.objects.push({...s.objects[0]}),s=>s.objects.find(o=>o.type==='die').faces=[1,2],s=>s.assets.push({id:'x',type:'card',name:'Bad',width:160,height:240,front:'javascript:alert(1)'}),s=>s.settings.scatter=999,s=>s.version=99]){const s=newGame();corrupt(s);assert.throws(()=>validateSession(s));}
});
