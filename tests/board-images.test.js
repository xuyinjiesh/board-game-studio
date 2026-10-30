import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {boardPreviews} from '../src/board-previews.js';
import {boardImageSource,updateBoardImage} from '../src/board-images.js';

const front='/assets/iron-helm/playmat-cn.webp',preview=boardPreviews[front].src;
const small={width:1000,height:410,zoom:1,pixelRatio:1},large={...small,zoom:2};
test('board resolution follows displayed size, zoom and pixel density without altering imported art',()=>{
  assert.equal(boardImageSource(front,small),preview);assert.equal(boardImageSource(front,large),front);
  assert.equal(boardImageSource(front,{...small,pixelRatio:2}),front);
  assert.equal(boardImageSource(front,{...small,zoom:.5,pixelRatio:2}),preview);
  for(const custom of ['data:image/png;base64,abcd','https://example.com/custom.webp','/assets/custom.webp'])assert.equal(boardImageSource(custom,large),custom);
});
test('all board previews are bundled, retain aspect ratio and reduce download size',async()=>{
  for(const [original,entry] of Object.entries(boardPreviews)){
    assert.ok(entry.src.startsWith('/assets/previews/boards/'));
    assert.ok(Math.max(entry.width,entry.height)<=1600);
    assert.ok(Math.abs(entry.width/entry.height-entry.originalWidth/entry.originalHeight)<.005);
    assert.ok((await stat(new URL('../public'+entry.src,import.meta.url))).size<(await stat(new URL('../public'+original,import.meta.url))).size*.5);
  }
});
test('zoom upgrades keep the preview until decoding completes, then retain the loaded full image',async()=>{
  const previous=globalThis.Image;let resolveDecode;
  globalThis.Image=class{decode(){return new Promise(resolve=>resolveDecode=resolve);}};
  const image={dataset:{},isConnected:true,getAttribute(){return this.src||null;}};
  try{
    updateBoardImage(image,front,small);assert.equal(image.src,preview);
    updateBoardImage(image,front,large);assert.equal(image.src,preview);
    resolveDecode();await Promise.resolve();assert.equal(image.src,front);
    updateBoardImage(image,front,small);assert.equal(image.src,front);
  }finally{if(previous===undefined)delete globalThis.Image;else globalThis.Image=previous;}
});
test('missing preview images fall back to the original asset once',()=>{
  const image={dataset:{},getAttribute(){return this.src||null;}};
  updateBoardImage(image,front,small);assert.equal(image.src,preview);
  image.onerror();assert.equal(image.src,front);assert.equal(image.onerror,null);
});
