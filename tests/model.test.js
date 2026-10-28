import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {assetFor,drawFromDeck,mergeCards,validateSession,shuffled,baseObject,captureSetup,validateSetup,applySetup,objectsInRect} from '../src/model.js';
import {builtinAssets,createGroveSession as newGame,scoreTable,treeAt,snapCard} from '../src/games/grove.js';

test('marquee intersects rotated pieces, excludes locked objects and the underlying board',()=>{
  const s=newGame();s.objects=[
    {...baseObject('die',100,100),color:'orange',rotation:45},
    {...baseObject('die',180,100),locked:true},
    {...baseObject('board',100,100),assetId:'grove-1'},
    {...baseObject('token',300,100),kind:'disc'}
  ];
  assert.deepEqual(objectsInRect(s,{left:65,right:135,top:65,bottom:135}).map(o=>o.id),[s.objects[0].id]);
  // These corners overlap the rotated die's bounding box, but not the die itself.
  assert.equal(objectsInRect(s,{left:65,right:70,top:65,bottom:70}).length,0);
  assert.equal(objectsInRect(s,{left:0,right:400,top:0,bottom:200}).length,2);
});

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

test('recapturing an opening keeps its options while replacing every placed object',()=>{
  const s=newGame(()=>.5),options={...s.initialSetup,name:'双人开局',shuffleDecks:true,rollDice:true};
  const original=structuredClone(options);
  s.objects[0].x=42;s.objects[0].rotation=90;s.objects[0].faceUp=false;s.objects[0].locked=true;
  s.objects.find(o=>o.type==='die').value=10;
  s.objects.find(o=>o.type==='token').value=7;
  const setup=captureSetup(s,options);
  assert.equal(setup.name,'双人开局');
  for(const key of ['randomizeCards','shuffleDecks','rollDice'])assert.equal(setup[key],options[key]);
  assert.deepEqual(options,original);
  assert.equal(setup.objects[0].x,42);assert.equal(setup.objects[0].rotation,90);assert.equal(setup.objects[0].faceUp,false);assert.equal(setup.objects[0].locked,true);
  assert.equal(setup.objects.find(o=>o.type==='die').value,10);assert.equal(setup.objects.find(o=>o.type==='token').value,7);
  assert.ok(setup.objects.every(o=>!Object.hasOwn(o,'id')));
  const imported=validateSession(JSON.parse(JSON.stringify({...s,setup})));
  assert.deepEqual(imported.setup,setup);
  setup.objects.find(o=>o.type==='deck').cards.pop();
  assert.notDeepEqual(setup.objects,captureSetup(s).objects);
});
test('invalid setup cannot enter a saved session or overwrite the live table',()=>{
  const s=newGame(),baseline=structuredClone(s);
  for(const corrupt of [p=>p.objects[0].x=Infinity,p=>p.objects[0].assetId='missing',p=>p.rollDice='yes',p=>p.objects.find(o=>o.type==='die').value=99]){
    const setup=captureSetup(s);corrupt(setup);
    assert.throws(()=>validateSetup(setup,s));assert.throws(()=>validateSession({...s,setup}));
    assert.throws(()=>applySetup(s,setup));assert.deepEqual(s,baseline);
  }
});

test('each deck and piece applies its own fixed or random policy, including locked tokens',()=>{
  const s=newGame(()=>.5),decks=s.objects.filter(o=>o.type==='deck'),dice=s.objects.filter(o=>o.type==='die'),tokens=s.objects.filter(o=>o.type==='token');
  decks[0].setupOrder='fixed';decks[1].setupOrder='shuffle';decks[0].faceUp=false;decks[0].setupFace='fixed';
  dice[0].setupFace='fixed';dice[0].value=10;dice[1].setupFace='random';
  tokens[0].faceUp=true;tokens[0].setupFace='random';tokens[0].locked=true;
  tokens[1].faceUp=false;tokens[1].setupFace='fixed';
  const setup=captureSetup(s);setup.shuffleDecks=true;setup.rollDice=true;
  const result=applySetup(s,setup,()=>0),high=applySetup(s,setup,()=>.99);
  assert.deepEqual(result.objects.find(o=>o.id===decks[0].id),undefined);
  assert.deepEqual(result.objects.filter(o=>o.type==='deck')[0].cards,decks[0].cards);
  assert.notDeepEqual(result.objects.filter(o=>o.type==='deck')[1].cards,decks[1].cards);
  assert.equal(result.objects.filter(o=>o.type==='die')[0].value,10);assert.equal(result.objects.filter(o=>o.type==='die')[1].value,2);
  assert.equal(result.objects.filter(o=>o.type==='token')[0].faceUp,false);
  assert.equal(high.objects.filter(o=>o.type==='token')[0].faceUp,true);
  assert.equal(high.objects.filter(o=>o.type==='token')[1].faceUp,false);
  for(const patch of [{setupOrder:'random'},{setupFace:'invalid'},{faceUp:'false'}]){
    const invalid=structuredClone(s);Object.assign(invalid.objects.find(o=>o.type==='deck'),patch);assert.throws(()=>validateSession(invalid));
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
  const c=drawFromDeck(s,d);assert.equal(c.assetId,last);assert.equal(d.cards.length,5);assert.equal(c.faceUp,false);
  d.setupOrder='shuffle';d.setupFace='fixed';
  const d2=mergeCards(s,[c.id,d.id]);assert.equal(d2.cards.length,6);assert.equal(d2.cards.at(-1),last);
  assert.equal(d2.setupOrder,'shuffle');assert.equal(d2.setupFace,'fixed');
  while(d2.cards.length)drawFromDeck(s,d2);assert.equal(drawFromDeck(s,d2),null);
  const up=newGame(),faceUpDeck=up.objects.find(o=>o.type==='deck');faceUpDeck.faceUp=true;
  assert.equal(drawFromDeck(up,faceUpDeck).faceUp,true);
  assert.equal(drawFromDeck(up,faceUpDeck,false).faceUp,false);
  faceUpDeck.faceUp=false;assert.equal(drawFromDeck(up,faceUpDeck,true).faceUp,true);
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
