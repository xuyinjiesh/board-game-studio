import test from 'node:test';
import assert from 'node:assert/strict';
import {stat,readFile} from 'node:fs/promises';
import {examples} from '../src/projects.js';
import {exampleCatalog} from '../src/example-catalog.js';

test('the lightweight catalog matches the live games without needing game factories on the homepage',()=>{
  assert.deepEqual(exampleCatalog.map(game=>game.id),examples.map(game=>game.id));
  for(const game of examples){
    const entry=exampleCatalog.find(entry=>entry.id===game.id),session=game.create(()=>.5);
    const cards=session.assets.filter(asset=>asset.type==='card');
    const covers=(game.coverAssetIds||[]).map(id=>cards.find(asset=>asset.id===id)).filter(Boolean);
    const selected=(covers.length?covers:cards).slice(0,3);
    const expected=selected.length?selected:session.assets.filter(asset=>asset.type==='board'||asset.type==='token').slice(0,1);
    assert.equal(entry.title,game.title);assert.equal(entry.legacyName,session.name);
    assert.equal(entry.preview.name,game.title);assert.equal(entry.preview.gameId,game.id);
    assert.deepEqual(entry.preview.meta,session.meta);
    assert.deepEqual(entry.coverAssetIds,game.coverAssetIds);
    assert.deepEqual(entry.preview.assets.map(asset=>asset.front),expected.map(asset=>asset.front));
    assert.deepEqual(entry.preview.assets.map(asset=>asset.id),expected.map(asset=>asset.id));
  }
});

test('every cover has a bundled retina thumbnail and the full catalog is under 300 KiB',async()=>{
  let total=0,originals=0;
  for(const asset of exampleCatalog.flatMap(game=>game.preview.assets)){
    assert.ok(asset.thumbnail.startsWith('/assets/previews/'));
    assert.ok(asset.thumbnailWidth>0&&asset.thumbnailWidth<=256);
    assert.ok(asset.thumbnailHeight>0&&asset.thumbnailHeight<=384);
    total+=(await stat(new URL('../public'+asset.thumbnail,import.meta.url))).size;
    originals+=(await stat(new URL('../public'+asset.front,import.meta.url))).size;
  }
  assert.ok(total<300*1024);assert.ok(total<originals*.12);
});

test('the homepage static module graph excludes the workspace and all game implementations',async()=>{
  const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const entry=index.match(/<script type="module" src="\/([^" ]+)"/)[1];
  const visited=new Set();
  async function visit(url){
    if(visited.has(url.href))return;visited.add(url.href);
    const source=await readFile(url,'utf8');
    for(const match of source.matchAll(/^import\s+(?:[^'"\n]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm))await visit(new URL(match[1],url));
  }
  await visit(new URL('../'+entry,import.meta.url));
  assert.ok([...visited].every(path=>!path.includes('/games/')&&!path.endsWith('/app.js')&&!path.endsWith('/projects.js')));
  assert.ok(visited.size<=10);
});
