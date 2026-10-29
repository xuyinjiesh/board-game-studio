import { mkdir, cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Project Pages serves at /repository/, while local and custom-domain sites use /.
const input = process.env.BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(input)) {
  throw new Error('BASE_PATH must be / or a path such as /board-game-studio/ (with a trailing slash).');
}
const dist = resolve('dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp('index.html', join(dist, 'index.html')),
  cp('src', join(dist, 'src'), { recursive: true }),
  cp('public/assets', join(dist, 'assets'), { recursive: true })
]);
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (/\.(html|css)$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      const result = source
        .replace(/(["'`(=])\/(assets|src)\//g, (_, quote, folder) => `${quote}${input}${folder}/`)
        .replace(/href="\/"/g, `href="${input}"`);
      await writeFile(file, result);
    }
  }
}
await rewrite(dist);
await writeFile(join(dist, '.nojekyll'), '');
console.log(`Static build ready in dist/ (base path: ${input})`);
