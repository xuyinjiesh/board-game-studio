import {builtinAssets,newGame,captureSetup,validateSetup,applySetup,assetFor,baseObject,uid,nextZ,dimensions,pointOnObject,treeAt,scoreTable,snapCard,snapSmall,drawFromDeck,mergeCards,shuffled,validateSession,COLORS,FRUIT_NAMES,GROVE_FACES} from './model.js';
import {sound} from './audio.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='tablecraft.workspace.v1';
let state,storageFailed=false;
try {const saved=localStorage.getItem(STORAGE);state=saved?validateSession(JSON.parse(saved)):newGame();}catch{state=newGame();storageFailed=true;}
if(state.settings.scatterDefaultVersion!==2){state.settings.scatter=Math.min(state.settings.scatter,1);state.settings.scatterDefaultVersion=2;}
let selected=new Set(),history=[],future=[],tab='cards',zoom=1,pan={x:0,y:0},drag=null,saveTimer,toastTimer,spaceDown=false,spaceUsed=false,importPurpose='new',pendingImages=[],rolling=new Set();
let setupDirty=false;
let activeDrawer=state.mode==='edit'?'assets':null,modeRevealTimer;
const scene=$('#scene'),viewport=$('#viewport'),objects=$('#objects');
const objectNodes=new Map();
const icons={flip:'⤾',rotate:'↻',draw:'↗',shuffle:'⤨',stack:'▱',lock:'⌑',inspect:'⤢',delete:'×'};
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function play(kind){sound(kind,state.settings.sound);}
function checkpoint(){history.push(JSON.stringify(state));if(history.length>60)history.shift();future=[];}
function save(){clearTimeout(saveTimer);$('#save-status').textContent='正在保存…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));$('#save-status').textContent='已自动保存';storageFailed=false;}catch{$('#save-status').textContent='存储空间不足，请导出';if(!storageFailed)notify('浏览器存储空间不足，请导出桌面以保留图片资产');storageFailed=true;}},300);}
function mutate(fn,{audio=null}={}){checkpoint();fn();render();save();if(audio)play(audio);}
function selection(){return state.objects.filter(o=>selected.has(o.id));}
function primary(){return selection().at(-1);}
function select(o,add=false){const prior=primary()?.id;if(!add)selected.clear();if(o){if(add&&selected.has(o.id))selected.delete(o.id);else selected.add(o.id);}renderSelection();renderInspector();if(primary()?.id!==prior)$('#inspector-content').scrollTop=0;}
function objectName(o){if(o.type==='card')return assetFor(state,o.assetId)?.name||'卡牌';if(o.type==='deck')return o.name||'牌堆';if(o.type==='die')return `${FRUIT_NAMES[o.color]}骰子`;if(o.type==='board')return assetFor(state,o.assetId)?.name||'版图';return o.name||'标记';}
function texture(id,face=true){const a=assetFor(state,id);return face?a?.front:a?.back;}
function fallbackBack(){return '<div class="custom-back"><span>✳</span><small>TABLECRAFT</small></div>';}
function cardFace(url,back=false){return url?`<img src="${escape(url)}" alt="${back?'卡牌背面':'卡牌正面'}" draggable="false">`:fallbackBack();}
function pips(value){if(value>6)return `<span class="face-number">${value}</span>`;const patterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};return `<span class="pips">${Array.from({length:9},(_,i)=>`<i class="${patterns[value]?.includes(i)?'pip':''}"></i>`).join('')}</span>`;}
function dieHTML(o){return `<div class="die-face" aria-hidden="true">${pips(o.value)}</div>`;}
function tokenSVG(kind){if(kind==='squirrel')return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M35 50c-5 5-19 4-22-5-3-7 2-14 7-16-12-2-16-16-8-21 11-7 22 7 16 18 6-5 7-10 10-10l2-7 4 8c11 4 14 16 6 18l-5 1 2 10-12 4Z" fill="currentColor"/><circle cx="43" cy="24" r="2" fill="#a75a30"/><path d="M33 32c-6 8-3 14 3 15" stroke="#a75a30" stroke-width="3" fill="none"/></svg>';if(kind==='wheelbarrow')return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m11 22 7 24h32l6-24Z" fill="currentColor"/><path d="m8 16 8 4 5 29M22 48l-2 6" stroke="currentColor" stroke-width="4" fill="none"/><circle cx="45" cy="51" r="7" fill="none" stroke="currentColor" stroke-width="4"/><text x="34" y="40" text-anchor="middle" font-size="19" font-weight="800" fill="#668a45">15</text></svg>';return '<span class="disc-star">✦</span>';}
function nodeSignature(o){return JSON.stringify([o.type,o.assetId,o.cards?.length,o.cards?.at(-1),o.faces,o.kind,o.name]);}
function syncObjects(){
  const present=new Set(state.objects.map(o=>o.id));
  for(const [id,node] of objectNodes)if(!present.has(id)){node.remove();objectNodes.delete(id);}
  for(const o of state.objects){
    let node=objectNodes.get(o.id);if(!node){node=document.createElement('div');node.dataset.id=o.id;node.tabIndex=0;node.setAttribute('role','button');objects.append(node);objectNodes.set(o.id,node);}
    const signature=nodeSignature(o);
    if(node.dataset.signature!==signature){
      if(o.type==='card')node.innerHTML=`<div class="card-shadow"></div><div class="card-lift"><div class="card-flipper"><div class="card-side card-front">${cardFace(texture(o.assetId,true))}</div><div class="card-side card-back">${cardFace(texture(o.assetId,false),true)}</div></div></div>`;
      else if(o.type==='deck')node.innerHTML=`<div class="deck-layers">${Array.from({length:Math.min(6,o.cards.length)},(_,i)=>`<div class="deck-layer" style="--layer:${i};--phase:${((i*7)%5-2)*state.settings.scatter/3}deg"></div>`).join('')}</div><div class="deck-top">${o.cards.length?cardFace(texture(o.cards.at(-1),o.faceUp),!o.faceUp):'<span class="empty-pile">牌堆已空</span>'}</div><span class="deck-count">${o.cards.length}</span><span class="deck-caption">${escape(o.name)}</span>`;
      else if(o.type==='die')node.innerHTML=dieHTML(o);
      else if(o.type==='token')node.innerHTML=`<div class="token-body">${o.kind==='custom'?cardFace(texture(o.assetId)):tokenSVG(o.kind)}</div>`;
      else node.innerHTML=`<img class="board-image" src="${escape(texture(o.assetId))}" draggable="false" alt="${escape(objectName(o))}">`;
      node.dataset.signature=signature;
    }
    const {w,h}=dimensions(state,o);
    node.className=`table-object ${o.type} ${o.faceUp===false?'face-down':''} ${selected.has(o.id)?'selected':''} ${o.locked?'locked':''} ${drag?.ids?.includes(o.id)?'dragging':''} ${rolling.has(o.id)?'rolling':''}`;
    node.style.cssText=`--x:${o.x}px;--y:${o.y}px;--angle:${o.rotation}deg;--w:${w}px;--h:${h}px;--object-color:${COLORS[o.color]||(/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231')};z-index:${objectLayer(o)};`;
    if(o.type==='die')updateDie(node,o);
    node.setAttribute('aria-label',`${objectName(o)}${o.type==='die'?'，点数 '+o.value:''}${o.locked?'，已锁定':''}`);
    if(o.type==='deck'){const img=node.querySelector('.deck-top img');if(img)img.src=texture(o.cards.at(-1),o.faceUp);}
  }
}
function objectLayer(o){return o.type==='board'?-100+o.z/1000000:['die','token'].includes(o.type)?1000000+o.z:o.z;}
function updateDie(node,o){const face=node.querySelector('.die-face');if(face&&face.dataset.value!==String(o.value)){face.innerHTML=pips(o.value);face.dataset.value=String(o.value);}}
function render(){
  $('#app').dataset.mode=state.mode;
  syncObjects();renderSelection();renderInspector();renderLibrary();
  $('#table-settings-content').innerHTML=settingsHTML();
  renderDrawers();renderSetup();
  viewport.dataset.theme=state.settings.theme;$('#grid').classList.toggle('visible',state.settings.grid);$('#grid-button').classList.toggle('active',state.settings.grid);$('#sound-button').classList.toggle('active',state.settings.sound);
  $('#table-mode-label').textContent=state.mode==='edit'?'编辑桌面 · 构建你的游戏':'自由操作桌面';$('#table-item-count').textContent=`${state.objects.length} 件物件`;
  $('.project-name>span:nth-child(2)').textContent=state.name;
  $('.table-toolbar .tiny-label').textContent=state.mode==='edit'?'正在编辑':'正在游玩';
  $('.table-toolbar h2').innerHTML=state.blank?'我的桌面 <span>SANDBOX</span><span class="game-tag">自由创作</span>':'果丛 <span>GROVE</span><span class="game-tag">单人 · 10 分钟</span>';
  $$('[data-action="new-game"]').forEach(button=>button.textContent=state.setup?'↻ 新一局':state.blank?'✳ 载入果丛':'↻ 新一局');
  $('[data-action="blank-table"]').classList.toggle('hidden',state.mode!=='edit');
  scene.classList.toggle('blank-table',!!state.blank);
  $('[data-action="undo"]').disabled=!history.length;$('[data-action="redo"]').disabled=!future.length;
}
function renderDrawers(){
  for(const name of ['assets','settings','setup']){const el=$(`#${name}-drawer`),open=state.mode==='edit'&&activeDrawer===name;el.classList.toggle('open',open);el.inert=!open;el.setAttribute('aria-hidden',String(!open));const trigger=$(`[data-drawer="${name}"]`);trigger.classList.toggle('active',open);trigger.setAttribute('aria-expanded',String(open));}
}
function setDrawer(name){if(name==='setup'&&!setupDirty)writeSetup(state.setup||captureSetup(state));const previous=activeDrawer;activeDrawer=state.mode==='edit'?name:null;renderDrawers();if(previous&&!activeDrawer&&state.mode==='edit')$(`[data-drawer="${previous}"]`)?.focus({preventScroll:true});}
function setMode(mode){if(mode===state.mode)return;state.mode=mode;activeDrawer=mode==='edit'?'assets':null;$('#mode-toggle').classList.remove('revealed');render();save();}
function revealEditor(){clearTimeout(modeRevealTimer);$('#mode-toggle').classList.add('revealed');modeRevealTimer=setTimeout(()=>$('#mode-toggle').classList.remove('revealed'),3500);}
function renderSelection(){
  for(const [id,node]of objectNodes)node.classList.toggle('selected',selected.has(id));
}
function renderLibrary(){
  const el=$('#asset-library');$$('.asset-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',b.dataset.tab===tab);});
  if(tab==='cards'){
    const assets=[...builtinAssets,...state.assets.filter(a=>a.type==='card')];$('#asset-total').textContent=`${assets.length} 张卡牌`;
    el.innerHTML=`<div class="collection-title"><span class="collection-cover">✳</span><div><strong>果丛 · Grove</strong><small>18 张双面卡牌 · PNP 原作</small></div></div><p class="library-hint">点击卡牌，添加到桌面 <span>＋</span></p><div class="card-grid">${assets.map(a=>`<button class="asset-card" data-add-asset="${escape(a.id)}" title="添加 ${escape(a.name)}"><img src="${escape(a.front)}" alt="${escape(a.name)}" loading="lazy" draggable="false"><span>${a.number?String(a.number).padStart(2,'0'):escape(a.name.slice(0,6))}<i>＋</i></span></button>`).join('')}</div>`;
  }else if(tab==='dice'){
    $('#asset-total').textContent='4 种骰子';el.innerHTML='<div class="asset-intro"><h3>让随机，掷地有声。</h3><p>果丛骰面为 2 / 3 / 4 / 5 / 6 / 10。<br>也可以添加标准六面骰。</p></div>'+['orange','lemon','lime','ivory'].map(c=>`<button class="dice-asset" data-add-die="${c}"><span class="dice-sample" style="--swatch:${COLORS[c]}">⚄</span><span><strong>${FRUIT_NAMES[c]}骰子</strong><small>${c==='ivory'?'标准 D6 · 1–6':'果丛 · 收获骰'}</small></span><b>＋</b></button>`).join('');
  }else if(tab==='tokens'){
    $('#asset-total').textContent='3 种标记';el.innerHTML='<div class="asset-intro"><h3>小小标记，大有用处。</h3><p>拖动到果树上记录特殊效果。</p></div>'+[['squirrel','松鼠','偷走水果 · 计分时扣分','#b86231'],['wheelbarrow','独轮车','丰收时刻 · 15 分','#7fa75e'],['disc','圆形标记','自由用途 · 可修改颜色','#c79e62']].map(([k,n,d,c])=>`<button class="token-asset" data-add-token="${k}"><span class="token-sample" style="background:${c}">${tokenSVG(k)}</span><span><strong>${n}</strong><small>${d}</small></span><b>＋</b></button>`).join('')+state.assets.filter(a=>a.type==='token').map(a=>`<button class="custom-asset" data-add-asset="${escape(a.id)}"><img src="${escape(a.front)}" alt=""><span>${escape(a.name)}</span><b>＋</b></button>`).join('');
  }else{
    const assets=state.assets.filter(a=>a.type==='board');$('#asset-total').textContent=`${assets.length} 张版图`;el.innerHTML=`<div class="asset-intro"><h3>铺开一个新世界。</h3><p>导入 PNG、JPG 或 WebP 作为版图。<br>版图支持缩放、旋转与锁定。</p></div>${assets.map(a=>`<button class="board-asset" data-add-asset="${escape(a.id)}"><img src="${escape(a.front)}" alt="${escape(a.name)}"><strong>${escape(a.name)}</strong><span>＋</span></button>`).join('')}<button class="board-placeholder" data-action="import-board"><span>⊞</span>导入你的第一张版图</button>`;
  }
}
function renderInspector(){
  const el=$('#inspector-content'),o=primary(),score=scoreTable(state),items=selection();
  if(!o&&state.blank){el.innerHTML=`<div class="game-summary"><span class="grove-emblem">◇</span><h2>你的游戏，你定义</h2><p>从第一个物件开始。</p><span class="edition-badge">YOUR PERSONAL WORKSHOP</span></div><div class="inspector-section"><h3>桌面概览</h3>${[['card','卡牌'],['deck','牌堆'],['die','骰子'],['token','标记'],['board','版图']].map(([t,n])=>`<div class="stat-line"><span>${n}</span><strong>${state.objects.filter(x=>x.type===t).length}</strong></div>`).join('')}<p class="subtle-note">点击左侧资产添加物件，或导入自己的图片。选择物件可编辑尺寸与背面。</p></div>`;return;}
  if(!o){
    el.innerHTML=`<div class="game-summary"><span class="grove-emblem">✳</span><h2>一方果丛</h2><p>叠一片绿意，收一篮阳光。</p><span class="edition-badge">GROVE · PNP EDITION</span></div><div class="score-panel"><div><span>桌面收获</span><span class="score-help" title="自动统计落在对应颜色果树上的骰子；空地不计分。手动调整骰值。">ⓘ</span></div><strong>${score.total}<small>分</small></strong><div class="fruit-totals">${['orange','lemon','lime'].map(c=>`<span><i style="background:${COLORS[c]}"></i>${score.groups[c]}</span>`).join('')}</div>${score.wheel||score.penalty?`<p class="score-extra">独轮车 +${score.wheel} · 松鼠 −${score.penalty}</p>`:''}</div><div class="inspector-section"><div class="section-title"><h3>这一局</h3><span>9 张牌的果园</span></div><div class="stat-line"><span>本局剩余</span><strong>${state.objects.filter(o=>o.type==='deck'&&!o.reserve).reduce((n,d)=>n+d.cards.length,0)} 张</strong></div><div class="stat-line"><span>有效收获骰</span><strong>${score.count} 颗</strong></div><p class="subtle-note">按实体规则自由操作。叠牌后手动调整骰子，得分随桌面更新。</p></div><div class="tip-card"><span>✦ 桌间小提示</span><p>相同颜色的果树相叠，<br>每一次覆盖，都是新的收获。</p><button data-action="rules">展开游戏规则 ↗</button></div>`;
  }else{
    const a=assetFor(state,o.assetId);
    el.innerHTML=`<div class="selected-heading"><span class="tiny-label">${items.length>1?`已选择 ${items.length} 个物件`:'当前选中'}</span><h2>${escape(objectName(o))}</h2><span class="object-type">${({card:'双面卡牌',deck:`牌堆 · ${o.cards?.length || 0} 张`,die:'六面骰 · 单面显示',token:'桌面标记',board:'自定义版图'})[o.type]}</span></div>`+
    (o.type==='card'?`<button class="inspector-card" data-action="inspect">${cardFace(texture(o.assetId,o.faceUp),!o.faceUp)}</button><div class="two-buttons"><button data-action="flip">⤾ 翻面 <kbd>F</kbd></button><button data-action="rotate">↻ 旋转 <kbd>R</kbd></button></div>`:o.type==='deck'?`<div class="deck-preview">${o.cards.length?cardFace(texture(o.cards.at(-1),o.faceUp)):fallbackBack()}<b>${o.cards.length}</b></div><button class="primary-button" data-action="draw" ${!o.cards.length?'disabled':''}>抽取顶牌 ↗</button><div class="two-buttons"><button data-action="shuffle">⤨ 洗牌</button><button data-action="spread">▱ 展开全部</button></div><p class="subtle-note">双击抽牌。Shift 多选卡牌后按 G，可重新叠成牌堆。</p>`:o.type==='die'?`<div class="die-preview" style="--swatch:${COLORS[o.color]}"><span>${pips(o.value)}</span><small>${FRUIT_NAMES[o.color]} · D6</small></div><button class="primary-button" data-action="roll">⚄ 掷出这一颗 <kbd>D</kbd></button><div class="inspector-section"><h3>手动调整骰面</h3><div class="face-picker">${o.faces.map(v=>`<button data-die-value="${v}" class="${v===o.value?'active':''}">${v}</button>`).join('')}</div><p class="subtle-note">选中后按数字键切换骰面，<kbd>0</kbd> 对应 10 点。<br>果丛中的骰子是计分器；投掷用于自由玩法。</p></div>`:o.type==='token'?`<div class="token-preview" style="background:${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}">${o.kind==='custom'?cardFace(texture(o.assetId)):tokenSVG(o.kind)}</div><p class="subtle-note">${o.kind==='squirrel'?'放在一次不匹配的叠树位置。终局扣 1 分，每颗正交相邻收获骰再扣 1 分。':o.kind==='wheelbarrow'?'当 10 点骰子再次收获时，可用独轮车替换。独轮车代表 15 分。':'自由拖动、复制和摆放，记录你的游戏状态。'}</p>`:`<img class="board-preview" src="${escape(a?.front)}" alt="版图预览">`)+
    `<div class="inspector-section"><div class="section-title"><h3>物件属性</h3><button data-action="lock" class="text-button">${o.locked?'⌑ 已锁定':'⌑ 锁定'}</button></div><div class="property-row"><label>角度 <input type="number" data-property="rotation" value="${Math.round(o.rotation)}" step="15" min="-360" max="360" ${o.locked?'disabled':''}></label><span>°</span></div><div class="two-buttons"><button data-action="rotate-left">↶ −15°</button><button data-action="rotate-small">↻ +15°</button></div>${['card','board'].includes(o.type)&&state.mode==='edit'?`<div class="property-row"><label>宽度 <input type="number" data-property="width" value="${dimensions(state,o).w}" min="40" max="1600"></label><span>px</span></div><div class="property-row"><label>高度 <input type="number" data-property="height" value="${dimensions(state,o).h}" min="40" max="1600"></label><span>px</span></div>`:''}${o.type==='token'&&state.mode==='edit'?`<div class="property-row"><label>标记颜色 <input type="color" data-property="color" value="${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}"></label></div>`:''}<div class="two-buttons"><button data-action="duplicate">⧉ 复制</button><button data-action="bring-front">↑ 置顶</button></div>${o.type==='card'&&state.mode==='edit'?'<button class="full-width quiet" data-action="change-back">更换背面图片 ↗</button>':''}<button class="danger-button" data-action="delete">移除选中物件</button></div>`;
  }
  if($('#modal').open&&$('#modal').dataset.kind==='properties')$('#modal-content').innerHTML=el.innerHTML;
}
function settingsHTML(){return `<div class="inspector-section table-settings"><h3>桌布与交互</h3><label class="toggle-row"><span>操作音效</span><input type="checkbox" data-setting="sound" ${state.settings.sound?'checked':''}><i></i></label><label class="toggle-row"><span>显示网格</span><input type="checkbox" data-setting="grid" ${state.settings.grid?'checked':''}><i></i></label><label class="toggle-row"><span>果树格点吸附</span><input type="checkbox" data-setting="snap" ${state.settings.snap?'checked':''}><i></i></label><label class="range-row"><span>摆放自然错位 <b>${state.settings.scatter}°</b></span><input type="range" min="0" max="12" value="${state.settings.scatter}" data-setting="scatter"></label><div class="theme-picker">${[['forest','苔绿'],['linen','亚麻'],['night','深夜']].map(([v,n])=>`<button data-theme="${v}" class="${state.settings.theme===v?'active':''}" title="${n}"><i class="${v}"></i>${n}</button>`).join('')}</div></div>`;}
function transformScene(){scene.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;}
function fit(){const r=viewport.getBoundingClientRect();zoom=Math.max(.2,Math.min(1.2,(r.width-65)/1240,(r.height-100)/830));pan={x:r.width/2-720*zoom,y:(r.height-100)/2+46-550*zoom};transformScene();}
function toWorld(clientX,clientY){const r=viewport.getBoundingClientRect();return {x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};}
function zoomAt(factor,cx,cy){const r=viewport.getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2;const next=Math.min(2,Math.max(.2,zoom*factor));pan.x=x-(x-pan.x)*next/zoom;pan.y=y-(y-pan.y)*next/zoom;zoom=next;transformScene();}
function viewportCenter(){const r=viewport.getBoundingClientRect();return toWorld(r.left+r.width/2,r.top+r.height/2);}
function addAsset(id){const a=assetFor(state,id);if(!a)return;mutate(()=>{const p=viewportCenter();const o={...baseObject(a.type,p.x+(Math.random()-.5)*70,p.y+(Math.random()-.5)*70,nextZ(state)),assetId:a.id,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};if(a.type==='board'){o.width=a.width;o.height=a.height;o.z=0;}if(a.type==='token'){o.kind='custom';o.name=a.name;o.color='#c79e62';}state.objects.push(o);selected=new Set([o.id]);},{audio:'drop'});}
function addDie(color){mutate(()=>{const p=viewportCenter();const o={...baseObject('die',p.x,p.y,nextZ(state)),color,value:color==='ivory'?1:2,faces:color==='ivory'?[1,2,3,4,5,6]:[...GROVE_FACES]};state.objects.push(o);selected=new Set([o.id]);},{audio:'drop'});}
function addToken(kind){mutate(()=>{const p=viewportCenter();const o={...baseObject('token',p.x,p.y,nextZ(state)),kind,name:{squirrel:'松鼠',wheelbarrow:'独轮车',disc:'圆形标记'}[kind],color:{squirrel:'#b86231',wheelbarrow:'#7fa75e',disc:'#c79e62'}[kind]};state.objects.push(o);selected=new Set([o.id]);},{audio:'drop'});}
function setDiceValue(value){const dice=selection().filter(o=>o.type==='die'&&!o.locked&&!rolling.has(o.id)&&o.faces.includes(value)&&o.value!==value);if(dice.length)mutate(()=>dice.forEach(o=>o.value=value),{audio:'drop'});}
function isMovable(o){return !o.locked;}
function flip(){const cards=selection().filter(o=>['card','deck'].includes(o.type)&&isMovable(o));if(!cards.length)return;mutate(()=>cards.forEach(o=>o.faceUp=!o.faceUp),{audio:'flip'});}
function rotate(amount=90){const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>items.forEach(o=>{o.rotation=Math.round((o.rotation+amount)*10)/10;if(amount%90===0&&state.settings.snap&&o.type==='card'&&assetFor(state,o.assetId)?.cells&&o.x>390&&o.x<1020&&o.y<690)snapCard(o);}),{audio:'drop'});}
function draw(){const deck=primary();if(deck?.type!=='deck'||!deck.cards.length||deck.locked)return;mutate(()=>{const card=drawFromDeck(state,deck);selected=new Set([card.id]);},{audio:'flip'});}
function roll(){
  const dice=selection().filter(o=>o.type==='die'&&!o.locked&&!rolling.has(o.id));if(!dice.length)return;
  checkpoint();for(const d of dice){rolling.add(d.id);d.value=d.faces[Math.floor(Math.random()*6)];d.rotation+=(Math.random()-.5)*state.settings.scatter*2;}render();play('roll');
  for(const [i,die]of dice.entries()){
    const face=objectNodes.get(die.id)?.querySelector('.die-face');if(!face)continue;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?1:650+i*40;
    face.animate([{transform:'translate(0,0) rotate(0deg)'},{transform:'translate(8px,-7px) rotate(25deg)',offset:.2},{transform:'translate(-7px,2px) rotate(-20deg)',offset:.45},{transform:'translate(3px,-2px) rotate(10deg)',offset:.7},{transform:'translate(0,0) rotate(0deg)'}],{duration,easing:'ease-out'});
    setTimeout(()=>{if(rolling.has(die.id))play('roll');},350+i*40);
  }
  setTimeout(()=>{dice.forEach(d=>rolling.delete(d.id));render();save();},700+dice.length*40);
}
function shuffle(){const deck=primary();if(deck?.type!=='deck'||deck.locked||deck.cards.length<2)return;mutate(()=>deck.cards=shuffled(deck.cards),{audio:'shuffle'});const node=objectNodes.get(deck.id);node?.animate([{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`},{transform:`translate(-35%,-50%) rotate(${deck.rotation+8}deg)`,offset:.3},{transform:`translate(-65%,-50%) rotate(${deck.rotation-8}deg)`,offset:.65},{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`}],{duration:450});notify('牌堆已洗匀');}
function stack(){const eligible=selection().filter(o=>['card','deck'].includes(o.type)&&!o.locked);if(eligible.length<2){notify('按住 Shift 选择至少两张卡牌或牌堆，再合并');return;}mutate(()=>{const deck=mergeCards(state,[...selected]);if(deck)selected=new Set([deck.id]);},{audio:'drop'});}
function spread(){const deck=primary();if(deck?.type!=='deck'||deck.locked||!deck.cards.length)return;mutate(()=>{const ids=[];deck.cards.forEach((id,i)=>{const o={...baseObject('card',deck.x+(i%5)*185,deck.y+Math.floor(i/5)*265,nextZ(state)+i),assetId:id,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};state.objects.push(o);ids.push(o.id);});state.objects=state.objects.filter(o=>o.id!==deck.id);selected=new Set(ids);},{audio:'shuffle'});}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());selected.clear();rolling.clear();render();save();notify(redo?'已重做':'已撤销');}
function remove(){const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>{const ids=new Set(items.map(o=>o.id));state.objects=state.objects.filter(o=>!ids.has(o.id));selected.clear();},{audio:'drop'});}
function duplicate(){const items=selection();if(!items.length)return;mutate(()=>{const added=items.map(o=>({...structuredClone(o),id:uid(),x:o.x+45,y:o.y+45,z:nextZ(state)+1,locked:false}));state.objects.push(...added);selected=new Set(added.map(o=>o.id));},{audio:'drop'});}
function openModal(html,wide=false){$('#modal').dataset.kind='';$('#modal-content').innerHTML=html;$('#modal').classList.toggle('wide',wide);if(!$('#modal').open)$('#modal').showModal();}
function rules(){openModal(`<span class="section-eyebrow">GROVE · HOW TO PLAY</span><h2>九张牌，一座果园。</h2><p class="modal-lead">作者 Mark Tuck · 中文汉化 楚洋 · 约 10 分钟</p><div class="rules-layout"><div><ol class="rule-steps"><li><strong>布置果园</strong><p>18 张牌洗匀，取 9 张用于本局，另外 9 张备用。翻开首张作为起始果园，再抽两张放在待打区。</p></li><li><strong>叠放一张牌</strong><p>可旋转 90° 或 180°。至少一个格子与果园重叠；重叠的水果须同色。空地可以盖住任意树，有骰子的空地被树覆盖时须与骰子同色。</p></li><li><strong>记录收获</strong><p>首次同色重叠，放置骰子，点数等于两棵树的水果总数。再次覆盖，增加新树的水果数量。超过 6 变为 10，再次收获可用唯一的独轮车替换，计 15 分。</p></li><li><strong>补牌与结算</strong><p>补一张待打牌，直到用完本局 9 张。空地上的骰子不计分。松鼠允许一次不匹配的覆盖，但不能再被覆盖；结算扣 1 分，每颗正交相邻收获骰再扣 1 分。</p></li></ol><div class="rule-notice"><strong>这是一张自由桌面</strong><p>摆牌合法性、补牌和骰子增值由你操作；右侧自动统计匹配果树上的骰值。食谱挑战请按卡背条件自行加算。此版本没有自动裁判或手牌区。</p></div><a class="primary-button" href="/assets/grove-original.pdf" target="_blank" rel="noopener">打开完整原版规则与 PNP ↗</a></div><a href="/assets/grove-original.pdf" target="_blank" rel="noopener"><img class="rules-sheet" src="/assets/rules.webp" alt="果丛原版中文规则"></a></div>`,true);}
function help(){openModal(`<span class="section-eyebrow">A LITTLE GUIDE</span><h2>把鼠标，当作你的手。</h2><p class="modal-lead">随手摆放，认真游玩。</p><div class="shortcut-list">${[['Ctrl + E','切换游玩 / 编辑模式'],['Esc（游玩时）','显示编辑入口'],['拖动物件','拿起、移动、松手摆放'],['拖动空白 / 空白处中键 / 空格拖动','平移桌面'],['滚轮 / ＋ / −','缩放桌面'],['Shift + 点击','选择多个物件'],['双击卡牌 / F','翻转正反面'],['卡牌中键 / Shift + 中键','旋转 90° / −90°'],['R / Shift + R','旋转 90° / −90°'],['双击牌堆','抽取顶牌'],['G','多选卡牌，合成牌堆'],['Alt + 拖到另一张牌上','合并为牌堆'],['D / 双击骰子','投掷选中骰子'],['选中骰子 + 数字键','切换对应骰面；0 = 10 点'],['右键卡牌 / Space','查看卡牌详情'],['右键其他部件','打开物件属性'],['Ctrl + D / Delete','复制 / 移除'],['Ctrl + Z / Ctrl + Shift + Z','撤销 / 重做'],['Esc','关闭弹窗 / 取消选择']].map(([k,v])=>`<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div><p class="subtle-note">图片与进度保存在当前浏览器。导出桌面可备份或换设备继续。触屏支持单指拖动与缩放按钮。</p>`);}
function inspect(){const o=primary();if(!o)return;if(o.type==='card')openModal(`<span class="section-eyebrow">${escape(objectName(o))}</span><h2>${o.faceUp?'果园正面':'食谱背面'}</h2><div class="large-card">${cardFace(texture(o.assetId,o.faceUp),!o.faceUp)}</div><button class="primary-button" data-action="inspect-flip">⤾ 查看另一面</button>${state.mode==='edit'?'<button class="full-width quiet" data-action="properties">编辑卡牌属性 ↗</button>':''}`);else if(o.type==='board')openModal(`<h2>${escape(objectName(o))}</h2><img class="large-board" src="${escape(texture(o.assetId))}" alt="版图">`,true);else notify('在右侧面板中调整物件属性');}
function exportSession(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`桌间-果丛-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('桌面已导出，包含自定义图片和所有物件');}
function confirmNew(){openModal(`<span class="section-eyebrow">A FRESH START</span><h2>${state.setup?'从初始设置开始。':'再种一座果园。'}</h2><p class="modal-lead">${state.setup?`使用「${escape(state.setup.name)}」布置 ${state.setup.objects.length} 个物件。`:'洗匀 18 张卡牌，重新分配本局和备用牌堆。'}当前布局将被替换，你仍可用撤销恢复。</p><button class="primary-button" data-action="confirm-new">开始新一局 ↗</button><button class="full-width quiet" data-action="export">先导出当前桌面</button>`);}
function writeSetup(setup){$('#setup-source').value=JSON.stringify(setup,null,2);setupDirty=false;$('#setup-error').textContent='';}
function renderSetup(){
  if(!setupDirty)writeSetup(state.setup||captureSetup(state));
  $('#setup-status').textContent=setupDirty?'有未保存的修改':state.setup?`新一局使用：${state.setup.name}`:'尚未保存 · 新一局使用默认果丛设置';
  $('#setup-assets').innerHTML='<strong>可用图片资产</strong>'+[...builtinAssets,...state.assets].map(a=>`<div><code>${escape(a.id)}</code> ${escape(a.name)}</div>`).join('');
}
function readSetup(){try{const setup=validateSetup(JSON.parse($('#setup-source').value),state);$('#setup-error').textContent='';return setup;}catch(error){$('#setup-error').textContent=`无法使用这份设置：${error.message}`;return null;}}

function properties(){if(!primary())return;openModal($('#inspector-content').innerHTML);$('#modal').dataset.kind='properties';}
const actions={flip,rotate,draw,shuffle,stack,spread,roll,undo,redo:()=>undo(true),delete:remove,duplicate,rules,help,inspect,export:exportSession,'new-game':confirmNew,'confirm-new':()=>{mutate(()=>{if(state.setup)state=applySetup(state);else{const assets=state.assets,settings=state.settings,mode=state.mode;state=newGame();state.assets=assets;state.settings=settings;state.mode=mode;}selected.clear();},{audio:'shuffle'});$('#modal').close();fit();},'close-modal':()=>$('#modal').close(),'inspect-flip':()=>{flip();inspect();},'rotate-left':()=>rotate(-15),'rotate-small':()=>rotate(15),'bring-front':()=>mutate(()=>selection().filter(isMovable).forEach((o,i)=>o.z=nextZ(state)+i)),'lock':()=>{const items=selection();if(items.length)mutate(()=>{const lock=!items.every(o=>o.locked);items.forEach(o=>o.locked=lock);});},'sound':()=>{mutate(()=>state.settings.sound=!state.settings.sound);if(state.settings.sound)play('drop');notify(state.settings.sound?'音效已开启':'音效已关闭');},'grid':()=>mutate(()=>state.settings.grid=!state.settings.grid),'zoom-in':()=>zoomAt(1.15),'zoom-out':()=>zoomAt(1/1.15),'fit':fit,'import-assets':()=>{importPurpose='new';$('#asset-input').click();},'import-board':()=>{importPurpose='board';$('#asset-input').click();},'change-back':()=>{importPurpose='back';$('#asset-input').click();},'import-session':()=>$('#session-input').click(),'confirm-import':()=>finishImport()};
actions.properties=properties;
actions['close-drawer']=()=>setDrawer(null);
actions['blank-table']=()=>openModal('<span class="section-eyebrow">YOUR NEXT GAME</span><h2>从一张空桌开始。</h2><p class="modal-lead">清空当前摆放，保留你的资产库。可以撤销恢复，也可以先导出备份。</p><button class="primary-button" data-action="confirm-blank">新建空白桌面 ↗</button>');
actions['confirm-blank']=()=>{mutate(()=>{state.objects=[];state.blank=true;state.name='未命名游戏 · 我的桌面';selected.clear();});$('#modal').close();};
actions['capture-setup']=()=>{const setup=captureSetup(state);setup.name=state.setup?.name||setup.name;writeSetup(setup);setupDirty=true;renderSetup();notify('已生成配置草稿，保存后才会用于新一局');};
actions['grove-setup']=()=>{const setup=captureSetup(newGame(()=>.5));setup.name='果丛 · 随机开局';setup.randomizeCards=true;writeSetup(setup);setupDirty=true;renderSetup();};
actions['save-setup']=()=>{const setup=readSetup();if(!setup)return;setupDirty=false;mutate(()=>state.setup=setup);notify('初始设置已保存，新一局将使用这份配置');};
actions['preview-setup']=()=>{const setup=readSetup();if(!setup)return;mutate(()=>{state=applySetup(state,setup);selected.clear();});fit();notify('已试运行初始设置，可用撤销恢复桌面');};
actions['clear-setup']=()=>{setupDirty=false;mutate(()=>delete state.setup);notify('已恢复默认开局，可撤销');};
$('#setup-source').addEventListener('input',()=>{setupDirty=true;$('#setup-status').textContent='有未保存的修改';$('#setup-error').textContent='';});

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.action)actions[b.dataset.action]?.();
  else if(b.dataset.tab){tab=b.dataset.tab;renderLibrary();}
  else if(b.dataset.mode)setMode(b.dataset.mode);
  else if(b.dataset.drawer)setDrawer(activeDrawer===b.dataset.drawer?null:b.dataset.drawer);
  else if(b.dataset.addAsset)addAsset(b.dataset.addAsset);
  else if(b.dataset.addDie)addDie(b.dataset.addDie);
  else if(b.dataset.addToken)addToken(b.dataset.addToken);
  else if(b.dataset.theme)mutate(()=>state.settings.theme=b.dataset.theme);
  else if(b.dataset.dieValue)setDiceValue(Number(b.dataset.dieValue));
});
document.addEventListener('change',e=>{
  const el=e.target;if(el.dataset.setting){mutate(()=>state.settings[el.dataset.setting]=el.type==='checkbox'?el.checked:Number(el.value));}
  if(el.dataset.property){const o=primary();if(!o||o.locked)return;const p=el.dataset.property;const v=p==='color'?el.value:Number(el.value);if(p!=='color'&&(!Number.isFinite(v)||(p==='rotation'?Math.abs(v)>360:v<40||v>1600))){notify('请输入有效范围内的数值');renderInspector();return;}mutate(()=>o[p]=v);}
});

viewport.addEventListener('pointerdown',e=>{
  if(e.target.closest('button,.view-tools'))return;if(e.button!==0&&e.button!==1)return;
  const node=e.target.closest('.table-object'),o=node&&state.objects.find(x=>x.id===node.dataset.id);
  if(e.button===1&&o?.type==='card'&&!spaceDown){e.preventDefault();select(o);rotate(e.shiftKey?-90:90);return;}
  if(e.button===1||spaceDown||!o){if(spaceDown)spaceUsed=true;drag={kind:'pan',sx:e.clientX,sy:e.clientY,pan:{...pan},moved:false,clear:!spaceDown&&!o&&!e.shiftKey};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');e.preventDefault();return;}
  if(e.shiftKey){select(o,true);e.preventDefault();return;}
  if(!selected.has(o.id))select(o);if(o.locked||rolling.has(o.id))return;
  const items=selection().filter(isMovable);drag={kind:'object',sx:e.clientX,sy:e.clientY,ids:items.map(x=>x.id),starts:items.map(x=>({id:x.id,x:x.x,y:x.y,rotation:x.rotation})),moved:false,alt:e.altKey};viewport.setPointerCapture(e.pointerId);e.preventDefault();
});
viewport.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.moved&&Math.hypot(dx,dy)<3)return;
  if(!drag.moved){drag.moved=true;if(drag.kind==='object'){checkpoint();selection().filter(isMovable).forEach((o,i)=>{if(o.type!=='board')o.z=nextZ(state)+i;});play('flip');}}
  if(drag.kind==='pan'){pan={x:drag.pan.x+dx,y:drag.pan.y+dy};transformScene();return;}
  for(const start of drag.starts){const o=state.objects.find(x=>x.id===start.id);if(!o)continue;o.x=Math.max(-10000,Math.min(10000,start.x+dx/zoom));o.y=Math.max(-10000,Math.min(10000,start.y+dy/zoom));const node=objectNodes.get(o.id);node?.classList.add('dragging');node?.style.setProperty('--x',`${o.x}px`);node?.style.setProperty('--y',`${o.y}px`);if(node)node.style.zIndex=objectLayer(o);}
});
function endDrag(e,cancelled=false){
  if(!drag)return;const previous=drag;drag=null;viewport.classList.remove('panning');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
  if(previous.kind==='pan'){if(!previous.moved&&previous.clear)select(null);return;}
  if(previous.moved){
    if(cancelled){state=JSON.parse(history.pop());render();return;}
    let didStack=false;
    if((e.altKey||previous.alt)&&previous.ids.length===1){const o=state.objects.find(x=>x.id===previous.ids[0]);const target=state.objects.filter(x=>x.id!==o.id&&!x.locked&&['card','deck'].includes(x.type)&&Math.hypot(x.x-o.x,x.y-o.y)<85).sort((a,b)=>b.z-a.z)[0];if(target&&['card','deck'].includes(o.type)){const d=mergeCards(state,[o.id,target.id]);selected=new Set([d.id]);didStack=true;}}
    if(!didStack){for(const id of previous.ids){const o=state.objects.find(x=>x.id===id);if(!o)continue;if(state.settings.snap&&previous.ids.length===1){if(o.type==='card'&&assetFor(state,o.assetId)?.cells&&o.x>390&&o.x<1020&&o.y<690)snapCard(o);else if(['die','token'].includes(o.type)&&treeAt(state,o.x,o.y)){const target=treeAt(state,o.x,o.y);const {w,h}=dimensions(state,target.card),col=target.index%2,row=Math.floor(target.index/2),a=target.card.rotation*Math.PI/180;const tx=(col-.5)*w/2,ty=(row-1)*h/3;o.x=target.card.x+tx*Math.cos(a)-ty*Math.sin(a);o.y=target.card.y+tx*Math.sin(a)+ty*Math.cos(a);}}}}
    play('drop');render();save();
  }
}
viewport.addEventListener('pointerup',e=>endDrag(e));viewport.addEventListener('pointercancel',e=>endDrag(e,true));
viewport.addEventListener('dblclick',e=>{const node=e.target.closest('.table-object')||document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-object');if(!node)return;const o=state.objects.find(x=>x.id===node.dataset.id);select(o);if(o.type==='card')flip();else if(o.type==='deck')draw();else if(o.type==='die')roll();});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
viewport.addEventListener('contextmenu',e=>{const node=e.target.closest('.table-object');if(!node)return;e.preventDefault();const o=state.objects.find(x=>x.id===node.dataset.id);if(!o)return;select(o);if(o.type==='card')inspect();else properties();});
viewport.addEventListener('auxclick',e=>{if(e.button===1&&e.target.closest('.table-object.card'))e.preventDefault();});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'&&!$('#modal').open&&!drag){e.preventDefault();setMode(state.mode==='play'?'edit':'play');return;}
  if(e.key==='Escape'&&!$('#modal').open){if(activeDrawer){setDrawer(null);return;}select(null);if(state.mode==='play')revealEditor();return;}
  if(e.target.matches('input,textarea,select')||$('#modal').open)return;
  const k=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&k==='z'){e.preventDefault();undo(e.shiftKey);return;}if(ctrl&&k==='y'){e.preventDefault();undo(true);return;}if(ctrl&&k==='d'){e.preventDefault();duplicate();return;}if(ctrl&&k==='s'){e.preventDefault();exportSession();return;}if(ctrl)return;
  if(!e.altKey&&!e.shiftKey&&/^\d$/.test(k)&&selection().some(o=>o.type==='die')){e.preventDefault();if(!e.repeat&&!drag)setDiceValue(k==='0'?10:Number(k));return;}
  if(k===' '){e.preventDefault();if(!spaceDown)spaceUsed=false;spaceDown=true;viewport.classList.add('space-pan');return;}
  const map={f:flip,r:()=>rotate(e.shiftKey?-90:90),d:roll,g:stack,delete:remove,backspace:remove,'+':()=>zoomAt(1.15),'=':()=>zoomAt(1.15),'-':()=>zoomAt(1/1.15),'0':fit,'?':help};if(map[k]){e.preventDefault();map[k]();}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){const shouldInspect=spaceDown&&!spaceUsed&&!drag&&!$('#modal').open;spaceDown=false;spaceUsed=false;viewport.classList.remove('space-pan');if(shouldInspect&&primary()?.type==='card')inspect();}});
window.addEventListener('blur',()=>{spaceDown=false;viewport.classList.remove('space-pan');});
objects.addEventListener('keydown',e=>{if(e.key==='Enter'){const o=state.objects.find(o=>o.id===e.target.closest('.table-object')?.dataset.id);if(o)select(o,e.shiftKey);}});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
async function imageData(file){if(file.size>20*1024*1024)throw new Error('单张图片请小于 20 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('只支持 PNG、JPG 和 WebP 图片');const image=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();return {data:canvas.toDataURL('image/webp',.9),width:canvas.width,height:canvas.height,name:file.name.replace(/\.[^.]+$/,'').slice(0,80)};}
$('#asset-input').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{pendingImages=await Promise.all(files.slice(0,30).map(imageData));
    if(importPurpose==='back'){const o=primary();if(o?.type!=='card')return;const original=assetFor(state,o.assetId);mutate(()=>{const a={...structuredClone(original),id:uid(),back:pendingImages[0].data};delete a.number;state.assets.push(a);o.assetId=a.id;});pendingImages=[];notify('已为这张卡牌更换背面');return;}
    openModal(`<span class="section-eyebrow">MAKE IT YOURS</span><h2>把你的素材放上桌。</h2><p class="modal-lead">已选择 ${pendingImages.length} 张图片，图片会随桌面存档一起保存。</p><div class="import-preview">${pendingImages.map(i=>`<img src="${i.data}" alt="${escape(i.name)}">`).join('')}</div><label class="import-label">资产类型<select id="import-type"><option value="card">卡牌</option><option value="board" ${importPurpose==='board'?'selected':''}>版图</option><option value="token">标记</option></select></label><p class="subtle-note">双面卡牌可在编辑模式中选中后更换背面。版图默认放到最下层。</p><button class="primary-button" data-action="confirm-import">添加到资产库与桌面 ↗</button>`);
  }catch(error){notify(error.message);}
});
function finishImport(){const type=$('#import-type').value,p=viewportCenter();mutate(()=>{const ids=[];pendingImages.forEach((i,index)=>{const width=type==='card'?160:type==='board'?640:60,height=type==='card'?240:type==='board'?Math.max(40,Math.min(1600,640*i.height/i.width)):60;const asset={id:uid(),type,name:i.name,front:i.data,width,height};state.assets.push(asset);const o={...baseObject(type,p.x+index*25,p.y+index*25,type==='board'?0:nextZ(state)),assetId:asset.id,faceUp:true};if(type==='board'){o.width=width;o.height=height;}if(type==='token'){o.kind='custom';o.name=i.name;o.color='#c79e62';}state.objects.push(o);ids.push(o.id);});selected=new Set(ids);state.mode='edit';tab=type==='card'?'cards':type==='board'?'boards':'tokens';});pendingImages=[];$('#modal').close();notify('素材已加入，可右键查看属性');}
$('#session-input').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>50*1024*1024)throw new Error('存档请小于 50 MB');const imported=validateSession(JSON.parse(await file.text()));mutate(()=>{state=imported;selected.clear();});fit();notify('桌面存档已载入');}catch(error){notify(`无法载入：${error.message}`);}});
window.addEventListener('beforeunload',()=>{if(saveTimer){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}}});
new ResizeObserver(()=>{if(!drag)fit();}).observe(viewport);
render();requestAnimationFrame(fit);if(storageFailed)notify('上次的本地存档无法读取，已打开新桌面');else save();

