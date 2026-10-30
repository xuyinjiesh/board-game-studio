const games=new Map(),pending=new Map(),legacyAssets=new Map();
const loaders={
  grove:()=>import('./games/grove.js').then(module=>({game:module.grove,assets:module.builtinAssets})),
  'iron-helm':()=>import('./games/iron-helm.js').then(module=>({game:module.ironHelm})),
  'pocket-paladin':()=>import('./games/pocket-paladin.js').then(module=>({game:module.pocketPaladin})),
  'for-northwood':()=>import('./games/for-northwood.js').then(module=>({game:module.northwood})),
  '52-realms':()=>import('./games/52-realms.js').then(module=>({game:module.realms})),
  'mini-rogue':()=>import('./games/mini-rogue.js').then(module=>({game:module.miniRogue})),
  clever:()=>import('./games/clever.js').then(module=>({game:module.clever}))
};
export const gameFor=id=>games.get(id);
export const legacyAssetsFor=id=>legacyAssets.get(id)||[];
export function registerGame(game,assets){games.set(game.id,game);if(assets)legacyAssets.set(game.id,assets);return game;}
export function loadGame(id){
  if(games.has(id)||!Object.hasOwn(loaders,id))return Promise.resolve(games.get(id));
  if(!pending.has(id))pending.set(id,loaders[id]().then(({game,assets})=>registerGame(game,assets)).catch(error=>{pending.delete(id);throw error;}));
  return pending.get(id);
}
