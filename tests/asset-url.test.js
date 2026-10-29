import test from 'node:test';
import assert from 'node:assert/strict';
import {assetUrl,assetHTML} from '../src/asset-url.js';

test('canonical asset URLs resolve under a project path without changing imported images', () => {
  for (const base of ['/', '/board-game-studio/']) {
    assert.equal(assetUrl('/assets/cards/1.webp', base), `${base}assets/cards/1.webp`);
    assert.equal(assetUrl('data:image/png;base64,AA==', base), 'data:image/png;base64,AA==');
    assert.equal(assetUrl(undefined, base), undefined);
    assert.equal(assetUrl(`${base}assets/cards/1.webp`, base), `${base}assets/cards/1.webp`);
    assert.equal(assetHTML('<img src="/assets/card.webp"><a href=\'/assets/rules.pdf\'>/assets/text</a>', base),
      `<img src="${base}assets/card.webp"><a href='${base}assets/rules.pdf'>/assets/text</a>`);
  }
});
