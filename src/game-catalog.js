// Research snapshot, not a live feed. See docs/game-classification.md for sources.
export const CATALOG_CHECKED='2026-10-29';
const bgg=(id,name,weight)=>({name,weight,url:`https://boardgamegeek.com/boardgame/${id}`});
export const gameCatalog={
  grove:{name:'果丛',tags:['空间拼放','图案构建'],ratings:[{...bgg(329873,'果丛',1.31),url:'https://boardgameoftheyear.org/game/329873?summary=alltime',indirect:true}]},
  'iron-helm':{name:'铁盔',tags:['地牢探险','风险抉择','资源管理'],ratings:[bgg(273264,'铁盔',2.05)]},
  'pocket-paladin':{name:'口袋骑士',tags:['地图探索','角色成长','资源规划'],ratings:[bgg(444915,'口袋骑士',4.00)],note:'社区评价较少，分数仅供参考。'},
  'for-northwood':{name:'为了北境森林',tags:['单人吃墩','手牌管理'],ratings:[bgg(334590,'为了北境森林',1.85)]},
  '52-realms':{name:'52王国',tags:['地牢探险','手牌管理'],ratings:[bgg(432250,'52王国',1.92)]},
  'mini-rogue':{name:'迷你游侠',tags:['地牢探险','骰子战斗','资源管理'],ratings:[bgg(311715,'迷你游侠 · 正式版',2.02)],note:'参考 2020 正式版；2016 九卡 PnP 版为另一条目。'},
  clever:{name:'聪明系列',tags:['掷骰书写','骰子选择','连锁计分'],ratings:[bgg(244522,'绝顶聪明',1.85),bgg(269210,'双倍聪明',2.27),bgg(316546,'三倍聪明',2.36),bgg(366162,'四倍聪明',2.37)],note:'范围覆盖四代基础版；挑战计分纸与扩展可能改变实际体验。'}
};
export const difficultyLabels=['入门','轻策','中策','重策','硬核'];
export function difficultyLevel(weight){
  return Number.isFinite(weight)&&weight>=1&&weight<=5?Math.round(weight):null;
}
export function classificationFor(gameId){
  const entry=Object.hasOwn(gameCatalog,gameId)?gameCatalog[gameId]:null;
  if(!entry)return {tags:['自制游戏'],level:null,label:'待评',score:'',ratings:[]};
  const weights=entry.ratings.map(rating=>rating.weight),min=Math.min(...weights),max=Math.max(...weights);
  const low=difficultyLevel(min),high=difficultyLevel(max);
  return {...entry,level:high,label:low===high?difficultyLabels[high-1]:`${difficultyLabels[low-1]}–${difficultyLabels[high-1]}`,score:min===max?min.toFixed(2):`${min.toFixed(2)}–${max.toFixed(2)}`};
}
