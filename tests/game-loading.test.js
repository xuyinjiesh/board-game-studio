import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadGame,gameFor} from '../src/game-registry.js';
import {prepareSession,createProject,startOpening} from '../src/project-session.js';
import {createSession,baseObject} from '../src/model.js';

test('loading one game shares its in-flight request and does not load unrelated providers',async()=>{
  assert.equal(gameFor('iron-helm'),undefined);assert.equal(gameFor('grove'),undefined);
  const pending=loadGame('iron-helm');assert.equal(loadGame('iron-helm'),pending);
  const provider=await pending;assert.equal(provider.id,'iron-helm');
  assert.equal(gameFor('grove'),undefined);assert.equal(gameFor('clever'),undefined);
  const session=createProject('iron-helm');assert.equal(startOpening(session).gameId,'iron-helm');
  assert.equal(await loadGame('custom'),undefined);assert.equal(await loadGame('__proto__'),undefined);
});

test('legacy custom tables still recover references to the old shared Grove assets',async()=>{
  const raw=createSession('旧自制桌面');delete raw.gameId;raw.blank=true;
  raw.objects=[{...baseObject('card',50,70),assetId:'grove-1',faceUp:true}];
  const restored=await prepareSession(raw);
  assert.equal(restored.gameId,'custom');assert.equal(restored.assets.length,1);
  assert.equal(restored.assets[0].id,'grove-1');assert.equal(restored.objects[0].x,50);
});

test('saved games load their own provider before migrating opening profiles',async()=>{
  const provider=await loadGame('for-northwood'),raw=provider.create(()=>.5);
  const restored=await prepareSession(JSON.parse(JSON.stringify(raw)));
  assert.equal(restored.gameId,'for-northwood');assert.ok(restored.setupProfiles.length>1);
  assert.equal(startOpening(restored).gameId,'for-northwood');
});

test('the workspace static graph never imports the eager tools entry or concrete games',async()=>{
  const visited=new Set();
  async function visit(url){
    if(visited.has(url.href))return;visited.add(url.href);
    const source=await readFile(url,'utf8');
    for(const match of source.matchAll(/^(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm))await visit(new URL(match[1],url));
  }
  await visit(new URL('../src/app.js',import.meta.url));
  assert.ok([...visited].every(url=>!url.includes('/games/')&&!url.endsWith('/projects.js')));
});
