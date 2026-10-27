import { mkdir, cp } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await Promise.all([cp('index.html','dist/index.html'),cp('src','dist/src',{recursive:true}),cp('public/assets','dist/assets',{recursive:true})]);
console.log('Static build ready in dist/');
