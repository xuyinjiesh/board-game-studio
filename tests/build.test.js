import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('static builds support root and project Pages paths and remove stale output', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tablecraft-build-'));
  const script = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));
  try {
    await mkdir(join(cwd, 'src'), { recursive: true });
    await mkdir(join(cwd, 'public/assets'), { recursive: true });
    await writeFile(join(cwd, 'index.html'), '<a href="/"><script src="/src/app.js"></script>');
    await writeFile(join(cwd, 'src/app.js'), 'const a="/assets/card.webp"; const b=`/assets/hero-${id}.webp`;');
    await writeFile(join(cwd, 'src/style.css'), 'a{background:url(/assets/card.webp)}');
    await writeFile(join(cwd, 'public/assets/card.webp'), 'fixture');
    for (const base of ['/', '/board-game-studio/']) {
      const build = spawnSync(process.execPath, [script], { cwd, env: { ...process.env, BASE_PATH: base }, encoding: 'utf8' });
      assert.equal(build.status, 0, build.stderr);
      assert.equal(await readFile(join(cwd, 'dist/index.html'), 'utf8'), `<a href="${base}"><script src="${base}src/app.js"></script>`);
      assert.equal(await readFile(join(cwd, 'dist/src/app.js'), 'utf8'), `const a="${base}assets/card.webp"; const b=\`${base}assets/hero-\${id}.webp\`;`);
      assert.equal(await readFile(join(cwd, 'dist/src/style.css'), 'utf8'), `a{background:url(${base}assets/card.webp)}`);
      await access(join(cwd, 'dist/.nojekyll'));
      await access(join(cwd, 'dist/assets/card.webp'));
      await assert.rejects(access(join(cwd, 'dist/stale.txt')));
      await writeFile(join(cwd, 'dist/stale.txt'), 'stale');
    }
    const invalid = spawnSync(process.execPath, [script], { cwd, env: { ...process.env, BASE_PATH: '/../../' }, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
