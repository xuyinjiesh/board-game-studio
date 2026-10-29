import test from 'node:test';
import assert from 'node:assert/strict';
import {examples} from '../src/projects.js';
import {gameCatalog,classificationFor,difficultyLevel} from '../src/game-catalog.js';

test('every built-in has gameplay tags, dated research sources and valid complexity data',()=>{
  assert.deepEqual(Object.keys(gameCatalog).sort(),examples.map(game=>game.id).sort());
  for(const game of examples){
    const info=classificationFor(game.id);
    assert.ok(info.tags.length>=2);
    assert.ok(info.level>=1&&info.level<=5);
    for(const rating of info.ratings){
      assert.ok(rating.weight>=1&&rating.weight<=5);
      assert.equal(new URL(rating.url).protocol,'https:');
    }
  }
});
test('complexity bands use documented midpoint boundaries and reject missing or invalid weights',()=>{
  for(const [weight,level] of [[1,1],[1.49,1],[1.5,2],[2.49,2],[2.5,3],[3.5,4],[4.5,5],[5,5]])assert.equal(difficultyLevel(weight),level);
  for(const weight of [undefined,null,0,5.1,NaN,Infinity,'2'])assert.equal(difficultyLevel(weight),null);
});
test('unknown custom projects stay unrated rather than inheriting a default game rating',()=>{
  for(const id of [undefined,'custom','unknown','__proto__','constructor']){
    const info=classificationFor(id);
    assert.equal(info.level,null);assert.equal(info.score,'');assert.deepEqual(info.ratings,[]);
    assert.deepEqual(info.tags,['自制游戏']);
  }
});
test('Clever preserves four distinct base-game ratings and Mini Rogue references the correct edition',()=>{
  const clever=classificationFor('clever');
  assert.equal(clever.ratings.length,4);assert.equal(clever.score,'1.85–2.37');assert.equal(clever.label,'轻策');
  assert.ok(classificationFor('mini-rogue').ratings[0].url.endsWith('/311715'));
  assert.equal(classificationFor('pocket-paladin').label,'重策');
});
