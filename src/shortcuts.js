export const SHORTCUT_STORAGE='tablecraft.shortcuts.v1';
export const shortcutDefinitions=[
  ['mode','切换游玩 / 编辑桌面','Ctrl+E'],['save','保存本地草稿','Ctrl+S'],
  ['undo','撤销','Ctrl+Z'],['redo','重做','Ctrl+Shift+Z'],['duplicate','复制物件','Ctrl+D'],
  ['searchDeck','搜寻牌堆（牌堆菜单）','S'],
  ['flip','翻转正反面','F'],['rotate','顺时针旋转 / 整堆洗牌','R'],['rotateBack','逆时针旋转 90°','Shift+R'],
  ['roll','投掷骰子 / 整堆发牌','D'],['stack','合成牌堆','G'],['remove','移除物件','Delete'],
  ['zoomIn','放大桌面','+'],['zoomOut','缩小桌面','-'],['fit','适应桌面','0'],['help','操作与快捷键','?']
].map(([id,label,key])=>({id,label,key}));
export const defaultShortcuts=()=>Object.fromEntries(shortcutDefinitions.map(d=>[d.id,d.key]));
export function deckShortcutAction(command,scope){
  if(scope!=='pile')return command==='searchDeck'?null:command;
  return ({roll:'deckDraw',rotate:'deckShuffle',searchDeck:'searchDeck'})[command]||command;
}
export function eventShortcut(e){
  if(['Control','Meta','Shift','Alt','Dead','Unidentified'].includes(e.key))return null;
  const key=e.key.length===1?e.key.toUpperCase():e.key;
  return [(e.ctrlKey||e.metaKey)&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&!['+','?'].includes(key)&&'Shift',key].filter(Boolean).join('+');
}
export function bindingError(bindings,id,key){
  if(!shortcutDefinitions.some(d=>d.id===id)||!key)return '请按下一个按键或组合键';
  const base=key.split('+').at(-1);
  if(['Escape','Tab','Enter',' ','Alt','Control','Meta','Shift'].includes(base)||/^[1-9]$/.test(key))return '此按键用于基础操作，请选择其他组合';
  const conflict=shortcutDefinitions.find(d=>d.id!==id&&bindings[d.id]===key);
  return conflict?`此快捷键已用于「${conflict.label}」`:null;
}
export function loadShortcuts(storage){
  const bindings=defaultShortcuts();
  try{
    const saved=JSON.parse(storage.getItem(SHORTCUT_STORAGE)||'null');
    if(saved&&typeof saved==='object'){
      const candidate={...bindings,...Object.fromEntries(shortcutDefinitions.filter(d=>typeof saved[d.id]==='string'&&saved[d.id].length<60).map(d=>[d.id,saved[d.id]]))};
      if(shortcutDefinitions.every(d=>!bindingError(candidate,d.id,candidate[d.id])))return candidate;
    }
  }catch{}
  return bindings;
}
export function shortcutAction(bindings,e){
  const key=eventShortcut(e);
  const direct=shortcutDefinitions.find(d=>bindings[d.id]===key)?.id;
  if(direct)return direct;
  const aliases={'Ctrl+Y':'redo',Backspace:'remove','=':'zoomIn'};
  const id=aliases[key];
  return id&&bindings[id]===defaultShortcuts()[id]?id:null;
}
