import test from 'node:test';
import assert from 'node:assert/strict';
import {deckControlsHTML,deckSearchHTML} from '../src/deck-controls.js';
import {defaultShortcuts,shortcutAction,deckShortcutAction} from '../src/shortcuts.js';
import {createSession,baseObject,deckEntries,replaceDeckEntries,drawDeckCard,moveDeckContents,validateSession} from '../src/model.js';
function fixture(){const s=createSession();s.assets=['a','b','c'].map(id=>({id,type:'card',name:`牌 ${id}`,width:160,height:240,front:'/assets/card-01-front.webp'}));const deck={...baseObject('deck',300,300),name:'测试牌堆',cards:[]};replaceDeckEntries(deck,[{assetId:'a',faceUp:false},{assetId:'b',faceUp:true},{assetId:'c',faceUp:false}]);s.objects=[deck];return {s,deck};}
test('pile shortcuts are scoped without overriding normal rotation or dice shortcuts',()=>{
  const keys=defaultShortcuts(),command=key=>shortcutAction(keys,{key});
  assert.equal(command('q'),null);assert.equal(deckShortcutAction(command('d'),'pile'),'deckDraw');
  assert.equal(deckShortcutAction(command('r'),'pile'),'deckShuffle');assert.equal(deckShortcutAction(command('s'),'pile'),'searchDeck');
  assert.equal(deckShortcutAction(command('d'),'top'),'roll');assert.equal(deckShortcutAction(command('r'),'top'),'rotate');
  assert.equal(deckShortcutAction(command('s'),'top'),null);
});
test('top and pile menus expose their own actions and the search window lists cards top first',()=>{
  const {s,deck}=fixture(),keys=defaultShortcuts();
  const pile=deckControlsHTML(deck,keys);assert.doesNotMatch(pile,/data-deck-scope|flip-top|查看顶牌|顶牌<|整堆/);assert.match(pile,/search-deck/);assert.match(pile,/洗牌/);assert.match(pile,/发牌/);
  assert.match(pile,/data-action="move-all"[^>]*>移动全部/);
  assert.match(deckControlsHTML({...deck,cards:[]},keys),/data-action="move-all" disabled/);
  assert.match(deckControlsHTML({...deck,locked:true},keys),/data-action="move-all" disabled/);
  const html=deckSearchHTML(s,deck);assert.ok(html.indexOf('牌 c')<html.indexOf('牌 b'));assert.ok(html.indexOf('牌 b')<html.indexOf('牌 a'));
  assert.match(html,/data-search-draw="2"/);assert.match(html,/顶牌/);
});

test('moving all cards keeps fixed source settings and transfers the complete ordered faces to another pile',()=>{
  const {s,deck}=fixture();s.mode='play';Object.assign(deck,{fixedPosition:true,drawKey:'source',setupKey:'opening',drawTarget:{mode:'right'},rotation:90});
  const target={...baseObject('deck',700,300),cards:['b'],faceUp:true,fixedPosition:true,maxCards:4,drawKey:'destination'};
  s.objects.push(target);
  const sourceBefore=structuredClone(deck),before=deckEntries(deck),targetBefore=structuredClone(target);
  assert.equal(moveDeckContents(s,deck,{deck:target}),target);
  assert.deepEqual(deckEntries(target),[{assetId:'b',faceUp:true},...before]);
  const expected=structuredClone(sourceBefore);replaceDeckEntries(expected,[]);assert.deepEqual(deck,expected);
  const targetExpected=structuredClone(targetBefore);replaceDeckEntries(targetExpected,[{assetId:'b',faceUp:true},...before]);assert.deepEqual(target,targetExpected);
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(s))),s);
});

test('moving to an empty position creates a movable pile without copying slot or opening identities',()=>{
  const {s,deck}=fixture();Object.assign(deck,{fixedPosition:true,setupKey:'source',drawKey:'source',width:140,height:196,rotation:90,maxCards:3,ihRole:'dungeon'});
  const before=deckEntries(deck),pile=moveDeckContents(s,deck,{x:800,y:600});
  assert.deepEqual(deckEntries(pile),before);assert.deepEqual(deck.cards,[]);
  assert.deepEqual([pile.x,pile.y,pile.rotation,pile.width,pile.height],[800,600,90,140,196]);
  for(const key of ['fixedPosition','setupKey','drawKey','ihRole','drawTarget'])assert.equal(pile[key],undefined);
  assert.deepEqual(validateSession(s),s);
});

test('invalid bulk transfers leave both piles intact',()=>{
  const {s,deck}=fixture(),target={...baseObject('deck',700,300),cards:['a'],maxCards:3};s.objects.push(target);
  const unchanged=destination=>{const before=structuredClone(s);assert.throws(()=>moveDeckContents(s,deck,destination));assert.deepEqual(s,before);};
  unchanged({deck});unchanged({deck:target});target.maxCards=10;target.locked=true;unchanged({deck:target});
  unchanged({x:Infinity,y:0});unchanged({x:10001,y:0});deck.locked=true;unchanged({x:700,y:300});deck.locked=false;
  deck.setupKey='opening';s.objects.push({...baseObject('deal',0,0),sourceKey:'opening'});unchanged({x:700,y:300});
  s.objects.pop();replaceDeckEntries(deck,[]);unchanged({x:700,y:300});
});
test('searching can extract a middle card without changing the remaining order or faces',()=>{
  const {s,deck}=fixture(),before=deckEntries(deck);
  const card=drawDeckCard(s,deck,1,undefined,{x:700,y:300,rotation:15});
  assert.equal(card.assetId,'b');assert.equal(card.faceUp,true);assert.equal(card.rotation,15);
  assert.deepEqual(deckEntries(deck),[before[0],before[2]]);assert.deepEqual(validateSession(s),s);
  const snapshot=structuredClone(s);assert.equal(drawDeckCard(s,deck,99),null);assert.deepEqual(s,snapshot);
  deck.locked=true;assert.equal(drawDeckCard(s,deck,0),null);
});
