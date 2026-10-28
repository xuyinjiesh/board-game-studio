import test from 'node:test';
import assert from 'node:assert/strict';
import {deckControlsHTML,deckSearchHTML} from '../src/deck-controls.js';
import {defaultShortcuts,shortcutAction,deckShortcutAction} from '../src/shortcuts.js';
import {createSession,baseObject,deckEntries,replaceDeckEntries,drawDeckCard,validateSession} from '../src/model.js';
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
  const html=deckSearchHTML(s,deck);assert.ok(html.indexOf('牌 c')<html.indexOf('牌 b'));assert.ok(html.indexOf('牌 b')<html.indexOf('牌 a'));
  assert.match(html,/data-search-draw="2"/);assert.match(html,/顶牌/);
});
test('searching can extract a middle card without changing the remaining order or faces',()=>{
  const {s,deck}=fixture(),before=deckEntries(deck);
  const card=drawDeckCard(s,deck,1,undefined,{x:700,y:300,rotation:15});
  assert.equal(card.assetId,'b');assert.equal(card.faceUp,true);assert.equal(card.rotation,15);
  assert.deepEqual(deckEntries(deck),[before[0],before[2]]);assert.deepEqual(validateSession(s),s);
  const snapshot=structuredClone(s);assert.equal(drawDeckCard(s,deck,99),null);assert.deepEqual(s,snapshot);
  deck.locked=true;assert.equal(drawDeckCard(s,deck,0),null);
});
