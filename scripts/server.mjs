import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.pdf':'application/pdf','.json':'application/json','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg' };
const port = Number(process.env.PORT || 5173);
http.createServer(async (req,res) => {
  try {
    let url = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(url === '/') url='/index.html';
    const path = resolve(root, '.' + (url.startsWith('/assets/') ? '/public' + url : url));
    if(!path.startsWith(root+sep) || url.split('/').some(p=>p.startsWith('.')) || !['/index.html','/src/','/assets/'].some(p=>url.startsWith(p))) {res.writeHead(403).end();return;}
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'}).end(data);
  } catch {res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Board Game Studio: http://127.0.0.1:${port}`));
