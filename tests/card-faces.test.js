import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,baseObject,createFixedPile,deckEntries,replaceDeckEntries,appendDeckEntries,drawFromDeck,mergeCards,shuffleDeck,flipDeck,validateSession} from '../src/model.js';
import {saveEditorDraft,startOpening,openEditor,migrateSession} from '../src/projects.js';
import {snapCardOnto} from '../src/interactions.js';
import {flipTopCard} from '../src/model.js';
function fixture(){
  const s=createSession();s.assets=['a','b','c'].map(id=>({id,type:'card',name:id,width:160,height:240,front:'/assets/card-01-front.webp',back:'/assets/card-01-back.webp'}));
  const pile={...createFixedPile(500,400),faceUp:false,setupFace:'fixed',maxCards:5};s.objects=[pile];return {s,pile};
}
function addCard(s,assetId,faceUp){const card={...baseObject('card',500,400,s.objects.length+10),assetId,faceUp};s.objects.push(card);return card;}

test('flipping a pile top changes only the uppermost card and survives drawing and saving',()=>{
  const {s,pile}=fixture();s.mode='play';
  replaceDeckEntries(pile,[{assetId:'a',faceUp:false},{assetId:'b',faceUp:true},{assetId:'c',faceUp:false}]);
  const before=structuredClone(deckEntries(pile));assert.equal(flipTopCard(pile),true);
  assert.deepEqual(deckEntries(pile),[...before.slice(0,-1),{assetId:'c',faceUp:true}]);
  assert.equal(drawFromDeck(s,pile).faceUp,true);assert.equal(pile.faceUp,true);
  const saved=validateSession(JSON.parse(JSON.stringify(s)));assert.deepEqual(deckEntries(saved.objects[0]),before.slice(0,-1));
  pile.locked=true;const snapshot=structuredClone(pile);assert.equal(flipTopCard(pile),false);assert.deepEqual(pile,snapshot);
  pile.locked=false;replaceDeckEntries(pile,[]);assert.equal(flipTopCard(pile),false);
});

test('fixed opening faces do not flip cards dropped onto a pile during play',()=>{
  for(const initialFace of [false,true])for(const incomingFace of [false,true]){
    const {s,pile}=fixture();pile.faceUp=initialFace;const saved=saveEditorDraft(s),play=startOpening(saved),target=play.objects[0];
    const card=addCard(play,'a',incomingFace);assert.equal(snapCardOnto(play,card,target),true);
    assert.equal(target.faceUp,incomingFace);assert.equal(drawFromDeck(play,target).faceUp,incomingFace);
    assert.equal(saved.setup.objects[0].faceUp,initialFace);
    assert.equal(startOpening(play).objects[0].faceUp,initialFace);
  }
});

test('mixed stacks preserve every buried face through imports, draws and transfers between piles',()=>{
  const {s,pile}=fixture();s.mode='play';
  for(const [id,face] of [['a',false],['b',true],['c',false]]){const card=addCard(s,id,face);mergeCards(s,[pile.id,card.id]);}
  assert.deepEqual(deckEntries(pile),[{assetId:'a',faceUp:false},{assetId:'b',faceUp:true},{assetId:'c',faceUp:false}]);
  const imported=migrateSession(JSON.parse(JSON.stringify(s))),source=imported.objects[0],target={...createFixedPile(800,400),drawKey:'destination',maxCards:5};
  imported.objects.push(target);source.drawTarget={mode:'deck',deckKey:'destination'};
  for(const [id,face] of [['c',false],['b',true],['a',false]]){
    assert.equal(drawFromDeck(imported,source),target);assert.deepEqual(deckEntries(target).at(-1),{assetId:id,faceUp:face});
  }
  assert.equal(drawFromDeck(imported,target).faceUp,false);
  assert.equal(drawFromDeck(imported,target).faceUp,true);
  assert.equal(drawFromDeck(imported,target).faceUp,false);
  assert.deepEqual(validateSession(imported),imported);
});

test('ordinary merges, shuffles and explicit flips retain the card and face pairing',()=>{
  const {s,pile}=fixture();s.objects=[];
  const a=addCard(s,'a',true),b=addCard(s,'b',false);const combined=mergeCards(s,[a.id,b.id]);
  assert.deepEqual(deckEntries(combined),[{assetId:'a',faceUp:true},{assetId:'b',faceUp:false}]);
  appendDeckEntries(combined,[{assetId:'c',faceUp:true}]);
  shuffleDeck(combined,()=>0);
  const expected={a:true,b:false,c:true};for(const entry of deckEntries(combined))assert.equal(entry.faceUp,expected[entry.assetId]);
  flipDeck(combined);for(const entry of deckEntries(combined))assert.equal(entry.faceUp,!expected[entry.assetId]);
  assert.equal(combined.faceUp,deckEntries(combined).at(-1).faceUp);
  s.objects.push(pile);pile.locked=true;const before=structuredClone(s);
  assert.throws(()=>drawFromDeck(s,combined,undefined,{deck:pile}));assert.deepEqual(s,before);
});

test('restarting applies authored fixed faces and leaves play progress and the opening independent',()=>{
  const {s,pile}=fixture();replaceDeckEntries(pile,[{assetId:'a',faceUp:false},{assetId:'b',faceUp:true}]);pile.faceUp=false;delete pile.cardFaces;
  const saved=saveEditorDraft(s),play=startOpening(saved),target=play.objects[0];
  const card=drawFromDeck(play,target);card.faceUp=true;mergeCards(play,[target.id,card.id]);
  assert.equal(target.faceUp,true);
  assert.deepEqual(deckEntries(openEditor(play).objects[0]),[{assetId:'a',faceUp:false},{assetId:'b',faceUp:false}]);
  assert.deepEqual(deckEntries(startOpening(play).objects[0]),[{assetId:'a',faceUp:false},{assetId:'b',faceUp:false}]);
});

test('malformed per-card faces cannot enter saved sessions',()=>{
  for(const corrupt of [[true],['false',false],[false,true]]){
    const {s,pile}=fixture();pile.cards=['a','b'];pile.faceUp=false;pile.cardFaces=corrupt;assert.throws(()=>validateSession(s),/朝向/);
  }
});
