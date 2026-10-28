import {ironHelmDlcAssets} from './iron-helm-dlc-assets.js';

// Adventure decks are selected separately from the modules mixed into a game.
export const EXPANSIONS=[
  ...[['ap1','绝望巢穴',2,25,5],['ap2','焦黑深窟',3,29,6],['ap3','加尔诺克的迷宫',2,33,7],['ap4','水晶洞窟',3,37,8],['ap5','余烬王座',2,41,9],['ap6','玛莉西亚的藏身处',3,47,1],['ap7','佐加尔之塔',4,51,2]].map(([id,name,level,page,cell])=>({id,name,kind:'adventure',note:`等级 ${level} · 可选为本局冒险，其他冒险保留在备用区`,cover:`/assets/iron-helm/dlc/${id}-p${page}c${cell}.webp`})),
  {id:'loot-lore',name:'战利品与传说',note:'角色、装备、技能、药剂与剧情补充'},
  {id:'beasts',name:'野兽与重担',note:'敌人、迷你首领与独立灾厄牌堆'},
  {id:'realms',name:'领域与遗迹',note:'独立环境与神器牌堆'},
  {id:'fanny',name:'腰包扩展',note:'角色、敌人、装备与剧情；神器需搭配「领域与遗迹」'},
  {id:'henchmen',name:'孤独巨魔酒馆',note:'随从、角色与初始装备'},
  {id:'dungeon2',name:'哀嚎深渊',note:'18 张替代地城牌，可选择替换基础地城'},
  {id:'iron-chest',name:'铁窖',note:'双面角色、首领、轨道与星宿'},
  {id:'random-events',name:'随机事件',note:'6 张大尺寸事件卡，独立牌堆'},
  {id:'anemic',name:'贫血之地',note:'民间扩展 · 角色、首领、剧情、技能等补充'}
].map(p=>({...p,kind:p.kind||'module',cover:p.cover||ironHelmDlcAssets.find(a=>a.expansion===p.id&&a.group==='reference')?.front||ironHelmDlcAssets.find(a=>a.expansion===p.id)?.front}));

export function expansionOptions(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('扩展配置无效');
  const packs=raw.packs??[];
  if(!Array.isArray(packs)||packs.length>EXPANSIONS.length||packs.some(id=>!EXPANSIONS.some(p=>p.id===id))||new Set(packs).size!==packs.length)throw new Error('扩展选择无效');
  const adventure=raw.adventure??'base',dungeon=raw.dungeon??'base';
  if(adventure!=='base'&&(!packs.includes(adventure)||!EXPANSIONS.some(p=>p.id===adventure&&p.kind==='adventure')))throw new Error('请先勾选本局使用的冒险包');
  if(dungeon!=='base'&&(dungeon!=='dungeon2'||!packs.includes('dungeon2')))throw new Error('请先勾选哀嚎深渊扩展');
  return {packs:EXPANSIONS.filter(p=>packs.includes(p.id)).map(p=>p.id),adventure,dungeon};
}
export const selectedAssets=options=>ironHelmDlcAssets.filter(a=>options.packs.includes(a.expansion));
export const dlcAsset=(pack,page,cell)=>`ih-dlc-${pack}-p${page}c${cell}`;
export const expansionSummary=raw=>{const o=expansionOptions(raw);return o.packs.length?o.packs.map(id=>EXPANSIONS.find(p=>p.id===id).name).join('、'):'仅基础版';};
export function activePool(assets,group,options){
  return assets.filter(a=>a.group===group&&(
    group==='dungeon'?options.dungeon==='dungeon2'?a.expansion==='dungeon2':!a.expansion:
    ['enemy','plot','boss'].includes(group)?a.expansion?EXPANSIONS.find(p=>p.id===a.expansion)?.kind!=='adventure'||a.expansion===options.adventure:options.adventure==='base':true
  )).map(a=>a.id);
}
