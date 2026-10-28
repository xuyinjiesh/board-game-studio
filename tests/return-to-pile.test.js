import test from 'node:test';
import assert from 'node:assert/strict';
import {baseObject,createSession,deckEntries,replaceDeckEntries,drawFromDeck,shuffleDeck,validateSession} from '../src/model.js';
import {findCardSnapTarget,snapCardOnto} from '../src/interactions.js';
import {deckSearchHTML} from '../src/deck-controls.js';
function fixture(){
  const s=createSession();s.mode='play';s.assets=['a','b','c'].map(id=>({id,type:'card',name:`卡牌 ${id}`,width:160,height:240,front:'/assets/card-01-front.webp'}));
  const deck={...baseObject('deck',300,300,1),name:'我的牌堆',cards:['a','b'],faceUp:false,width:125,height:175,rotation:30,drawKey:'source',drawTarget:{mode:'right',gap:40},ihRole:'dungeon',setupOrder:'shuffle'};
  const card={...baseObject('card',302,304,5),assetId:'c',faceUp:true};s.objects=[deck,card];return {s,deck,card};
}
test('returning a card joins an ordinary pile and preserves its identity, settings and card faces',()=>{
  const {s,deck,card}=fixture(),before=structuredClone(deck);
  assert.equal(findCardSnapTarget(s,card),deck);assert.equal(snapCardOnto(s,card,deck),true);
  assert.equal(s.objects.length,1);assert.equal(s.objects[0],deck);
  for(const key of ['id','name','width','height','rotation','drawKey','drawTarget','ihRole','setupOrder','x','y'])assert.deepEqual(deck[key],before[key]);
  assert.deepEqual(deckEntries(deck),[{assetId:'a',faceUp:false},{assetId:'b',faceUp:false},{assetId:'c',faceUp:true}]);
  assert.match(deckSearchHTML(s,deck),/卡牌 c/);assert.equal(drawFromDeck(s,deck).assetId,'c');
  shuffleDeck(deck,()=>0);assert.deepEqual([...deck.cards].sort(),['a','b']);assert.deepEqual(validateSession(s),s);
});
test('returning the last drawn card to an empty pile leaves one real pile with one card',()=>{
  const {s,deck}=fixture();s.objects=[deck];replaceDeckEntries(deck,[{assetId:'a',faceUp:true}]);
  const card=drawFromDeck(s,deck,undefined,deck);assert.equal(deck.cards.length,0);
  assert.equal(snapCardOnto(s,card,deck),true);assert.deepEqual(deck.cards,['a']);assert.equal(s.objects.length,1);assert.equal(s.objects[0].id,deck.id);
});
test('a pile behind an old loose overlay remains the drop target and full piles reject new cards',()=>{
  const {s,deck,card}=fixture();s.objects.push({...card,id:'overlay',z:4});
  assert.equal(findCardSnapTarget(s,card),deck);
  s.objects.pop();deck.maxCards=2;const before=structuredClone(s);
  assert.equal(findCardSnapTarget(s,card),null);assert.equal(snapCardOnto(s,card,deck),false);assert.deepEqual(s,before);
});
test('dropping a movable pile onto another pile appends its cards in order without changing the destination',()=>{
  const {s,deck,card}=fixture();s.objects.pop();
  const moving={...baseObject('deck',300,300,10),cards:['c','a'],faceUp:true,drawKey:'incoming'};s.objects.push(moving);
  const reference={...baseObject('deck',700,300),cards:[],drawTarget:{mode:'deck',deckKey:'incoming'}};s.objects.push(reference);
  assert.equal(snapCardOnto(s,moving,deck),true);assert.deepEqual(deck.cards,['a','b','c','a']);
  assert.equal(s.objects.includes(moving),false);assert.equal(reference.drawTarget.deckKey,'source');
  assert.equal(s.objects.find(o=>o.id===deck.id),deck);assert.deepEqual(validateSession(s),s);
});
