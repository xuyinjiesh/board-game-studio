import {adjustTokenValue,createSession,captureSetup,validateSetup,applySetup,assetFor,baseObject,uid,nextZ,dimensions,objectsInRect,pointOnObject,drawFromDeck,mergeCards,shuffled,validateSession,COLORS,COLOR_NAMES} from './model.js';
import {gameFor,migrateSession,makeExhibit} from './projects.js';
import {projectStore} from './project-store.js';
import {createPlaza} from './plaza.js';
import {sound,objectSound,setAudioEnabled,unlockAudio,stopSound} from './audio.js';
import {wheelIntent,isPanGesture} from './interactions.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='tablecraft.workspace.v1',RECOVERY='tablecraft.recovery.v2';
let state=createSession(),storageFailed=false,workspaceLoaded=false,plaza,savedFingerprint='';
let selected=new Set(),history=[],future=[],tab='cards',zoom=1,pan={x:0,y:0},drag=null,saveTimer,toastTimer,spaceDown=false,importPurpose='new',pendingImages=[],rolling=new Set();
let setupDirty=false,metaEditing=null;
let activeDrawer=state.mode==='edit'?'assets':null,modeRevealTimer;
const scene=$('#scene'),viewport=$('#viewport'),objects=$('#objects');
const objectNodes=new Map();
const icons={flip:'⤾',rotate:'↻',draw:'↗',shuffle:'⤨',stack:'▱',lock:'⌑',inspect:'⤢',delete:'×'};
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function play(kind,options){sound(kind,state.settings.sound,options);}
function playObjects(items,action='drop'){for(const cue of [...new Set(items.map(o=>objectSound(o,action)))].slice(0,3))play(cue);}
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(workspaceLoaded&&!$('#app').hidden)unlockAudio(state.settings.sound);},{capture:true});
function checkpoint(){history.push(JSON.stringify(state));if(history.length>60)history.shift();future=[];}
async function saveNow(){
  clearTimeout(saveTimer);saveTimer=null;if(!workspaceLoaded||JSON.stringify(state)===savedFingerprint)return;
  const snapshot=structuredClone(state);snapshot.updatedAt=Date.now();
  try{await projectStore.save(snapshot);if(state.projectId===snapshot.projectId){state.updatedAt=snapshot.updatedAt;savedFingerprint=JSON.stringify(snapshot);$('#save-status').textContent='已自动保存';}storageFailed=false;}
  catch(error){$('#save-status').textContent='保存失败，请导出';storageFailed=true;notify(error.message);throw error;}
}
function save(){if(!workspaceLoaded)return;clearTimeout(saveTimer);$('#save-status').textContent='正在保存…';saveTimer=setTimeout(()=>saveNow().catch(()=>{}),300);}
function game(){return gameFor(state.gameId);}
function diceTemplates(){return [...['ivory','orange','lemon','lime'].map(color=>({id:color,color,name:`${COLOR_NAMES[color]}六面骰`,faces:[1,2,3,4,5,6]})),...(game()?.dice||[])];}
function tokenTemplates(){return [{kind:'disc',name:'圆形标记',color:'#c79e62',description:'自由用途 · 可修改颜色'},...(game()?.tokens||[])];}
async function activateSession(session,{newExample=false}={}){
  state=migrateSession(session);workspaceLoaded=true;savedFingerprint='';setupDirty=false;selected.clear();rolling.clear();history=[];future=[];tab='cards';activeDrawer=state.mode==='edit'?'assets':null;
  $('#modal').close();$('#plaza').hidden=true;$('#app').hidden=false;
  setAudioEnabled(state.settings.sound);render();requestAnimationFrame(fit);await saveNow();
  if(newExample&&game()?.startView)gameAction(game().startView,'');
}

function mutate(fn,{audio=null}={}){checkpoint();fn();setAudioEnabled(state.settings.sound);render();save();if(typeof audio==='function')audio();else if(audio)play(audio);}
function selection(){return state.objects.filter(o=>selected.has(o.id));}
function primary(){return selection().at(-1);}
function select(o,add=false){const prior=primary()?.id;if(!add)selected.clear();if(o){if(add&&selected.has(o.id))selected.delete(o.id);else selected.add(o.id);}renderSelection();renderInspector();if(primary()?.id!==prior)$('#inspector-content').scrollTop=0;}
function objectName(o){if(o.type==='card')return o.faceUp===false?'背面朝上的卡牌':assetFor(state,o.assetId)?.name||'卡牌';if(o.type==='deck')return o.name||'牌堆';if(o.type==='die')return o.name||`${COLOR_NAMES[o.color]||'自定义'}骰子`;if(o.type==='board')return assetFor(state,o.assetId)?.name||'版图';return o.name||'标记';}
function texture(id,face=true){const a=assetFor(state,id);return face?a?.front:a?.back;}
function fallbackBack(){return '<div class="custom-back"><span>✳</span><small>TABLECRAFT</small></div>';}
function cardFace(url,back=false){return url?`<img src="${escape(url)}" alt="${back?'卡牌背面':'卡牌正面'}" draggable="false">`:fallbackBack();}
function pips(value){if(value>6)return `<span class="face-number">${value}</span>`;const patterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};return `<span class="pips">${Array.from({length:9},(_,i)=>`<i class="${patterns[value]?.includes(i)?'pip':''}"></i>`).join('')}</span>`;}
function dieHTML(o){return `<div class="die-face" aria-hidden="true">${pips(o.value)}</div>`;}
function tokenSVG(kind,o){return game()?.tokens?.some(t=>t.kind===kind)?game().tokenIcon(kind,o):'<span class="disc-star">✦</span>';}
function nodeSignature(o){return JSON.stringify([o.type,o.assetId,o.cards?.length,o.cards?.at(-1),o.faces,o.kind,o.name,o.type==='token'?o.value:null]);}
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
      else if(o.type==='token')node.innerHTML=`<div class="token-body">${o.kind==='custom'?cardFace(texture(o.assetId)):tokenSVG(o.kind,o)}</div>`;
      else node.innerHTML=`<img class="board-image" src="${escape(texture(o.assetId))}" draggable="false" alt="${escape(objectName(o))}">`;
      node.dataset.signature=signature;
    }
    const {w,h}=dimensions(state,o);
    node.className=`table-object ${o.type} ${o.faceUp===false?'face-down':''} ${selected.has(o.id)?'selected':''} ${o.locked?'locked':''} ${drag?.ids?.includes(o.id)?'dragging':''} ${rolling.has(o.id)?'rolling':''}`;
    node.style.cssText=`--x:${o.x}px;--y:${o.y}px;--angle:${o.rotation}deg;--w:${w}px;--h:${h}px;--object-color:${COLORS[o.color]||(/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231')};z-index:${objectLayer(o)};`;
    if(o.type==='die')updateDie(node,o);
    if(o.type==='card'){
      node.querySelector('.card-front').setAttribute('aria-hidden',String(o.faceUp===false));
      node.querySelector('.card-back').setAttribute('aria-hidden',String(o.faceUp!==false));
    }
    node.setAttribute('aria-label',`${objectName(o)}${o.type==='die'?'，点数 '+o.value:''}${o.locked?'，已锁定':''}`);
    if(o.type==='deck'){const img=node.querySelector('.deck-top img');if(img)img.src=texture(o.cards.at(-1),o.faceUp);}
  }
}
function objectLayer(o){return o.type==='board'?-100+o.z/1000000:['die','token'].includes(o.type)?1000000+o.z:o.z;}
function updateDie(node,o){const face=node.querySelector('.die-face');if(face&&face.dataset.value!==String(o.value)){face.innerHTML=pips(o.value);face.dataset.value=String(o.value);}}
function render(){
  $('#app').dataset.mode=state.mode;
  syncObjects();renderSelection();renderInspector();renderLibrary();
  const controls=$('#game-controls');controls.hidden=!game()?.toolbar;controls.innerHTML=game()?.toolbar?.(state)||'';
  if($('#modal').open&&$('#modal').dataset.kind==='game')renderGameDialog();
  $('#table-settings-content').innerHTML=settingsHTML();
  renderDrawers();renderSetup();
  viewport.dataset.theme=state.settings.theme;$('#grid').classList.toggle('visible',state.settings.grid);$('#grid-button').classList.toggle('active',state.settings.grid);$('#sound-button').classList.toggle('active',state.settings.sound);
  const grid=game()?.grid||{size:40,x:0,y:0};$('#grid').style.backgroundSize=`${grid.size}px ${grid.size}px`;$('#grid').style.backgroundPosition=`${grid.x}px ${grid.y}px`;
  $('#table-mode-label').textContent=state.mode==='edit'?'编辑桌面 · 构建你的游戏':'自由操作桌面';$('#table-item-count').textContent=`${state.objects.length} 件物件`;
  $('.project-name>span:nth-child(2)').textContent=state.name;
  $('.table-toolbar .tiny-label').textContent=state.mode==='edit'?'正在编辑':'正在游玩';
  $('.table-toolbar h2').textContent=state.name;
  $$('[data-action="new-game"]').forEach(button=>button.textContent='↻ 新一局');
  $('[data-action="blank-table"]').classList.toggle('hidden',state.mode!=='edit');
  scene.classList.toggle('blank-table',!game()?.zones?.length);
  scene.dataset.game=state.gameId;
  $('#game-zones').innerHTML=(game()?.zones||[]).map(z=>`<div class="zone ${escape(z.className)}" ${z.box?`style="left:${z.box[0]}px;top:${z.box[1]}px;width:${z.box[2]}px;height:${z.box[3]}px"`:''}><span>${escape(z.label)}</span><small>${escape(z.subtitle)}</small></div>`).join('');
  $('[data-action="undo"]').disabled=!history.length;$('[data-action="redo"]').disabled=!future.length;
}
function renderDrawers(){
  for(const name of ['assets','settings','setup']){const el=$(`#${name}-drawer`),open=state.mode==='edit'&&activeDrawer===name;el.classList.toggle('open',open);el.inert=!open;el.setAttribute('aria-hidden',String(!open));const trigger=$(`[data-drawer="${name}"]`);trigger.classList.toggle('active',open);trigger.setAttribute('aria-expanded',String(open));}
}
function setDrawer(name){if(name==='setup')renderSetup();const previous=activeDrawer;activeDrawer=state.mode==='edit'?name:null;renderDrawers();if(previous&&!activeDrawer&&state.mode==='edit')$(`[data-drawer="${previous}"]`)?.focus({preventScroll:true});}
function setMode(mode){if(mode===state.mode)return;state.mode=mode;activeDrawer=mode==='edit'?'assets':null;$('#mode-toggle').classList.remove('revealed');render();save();}
function revealEditor(){clearTimeout(modeRevealTimer);for(const el of [$('#mode-toggle'),$('#play-plaza')])el.classList.add('revealed');modeRevealTimer=setTimeout(()=>{for(const el of [$('#mode-toggle'),$('#play-plaza')])el.classList.remove('revealed');},3500);}
function renderSelection(){
  for(const [id,node]of objectNodes)node.classList.toggle('selected',selected.has(id));
}
function renderLibrary(){
  const el=$('#asset-library');$$('.asset-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',b.dataset.tab===tab);});
  if(tab==='cards'){
    const assets=state.assets.filter(a=>a.type==='card');$('#asset-total').textContent=`${assets.length} 张卡牌`;
    el.innerHTML=`<div class="collection-title"><span class="collection-cover">✳</span><div><strong>${escape(state.name)}</strong><small>当前项目的卡牌资产</small></div></div><p class="library-hint">点击卡牌，添加到桌面 <span>＋</span></p><div class="card-grid">${assets.length?'':'<p class="subtle-note">还没有卡牌。导入图片，开始制作你的游戏。</p>'}${assets.map(a=>`<button class="asset-card" data-add-asset="${escape(a.id)}" title="添加 ${escape(a.name)}"><img src="${escape(a.front)}" alt="${escape(a.name)}" loading="lazy" draggable="false"><span>${a.number?String(a.number).padStart(2,'0'):escape(a.name.slice(0,6))}<i>＋</i></span></button>`).join('')}</div>`;
  }else if(tab==='dice'){
    const templates=diceTemplates();$('#asset-total').textContent=`${templates.length} 种骰子`;el.innerHTML='<div class="asset-intro"><h3>让随机，掷地有声。</h3><p>标准六面骰，以及当前项目提供的骰子。</p></div>'+templates.map(d=>`<button class="dice-asset" data-add-die="${escape(d.id)}"><span class="dice-sample" style="--swatch:${COLORS[d.color]}">⚄</span><span><strong>${escape(d.name)}</strong><small>${d.faces.join(' / ')}</small></span><b>＋</b></button>`).join('');
  }else if(tab==='tokens'){
    const templates=tokenTemplates();$('#asset-total').textContent=`${templates.length} 种标记`;el.innerHTML='<div class="asset-intro"><h3>小小标记，大有用处。</h3><p>自由摆放，记录游戏状态。</p></div>'+templates.map(t=>`<button class="token-asset" data-add-token="${escape(t.kind)}"><span class="token-sample" style="background:${t.color}">${tokenSVG(t.kind)}</span><span><strong>${escape(t.name)}</strong><small>${escape(t.description)}</small></span><b>＋</b></button>`).join('')+state.assets.filter(a=>a.type==='token').map(a=>`<button class="custom-asset" data-add-asset="${escape(a.id)}"><img src="${escape(a.front)}" alt=""><span>${escape(a.name)}</span><b>＋</b></button>`).join('');
  }else{
    const assets=state.assets.filter(a=>a.type==='board');$('#asset-total').textContent=`${assets.length} 张版图`;el.innerHTML=`<div class="asset-intro"><h3>铺开一个新世界。</h3><p>导入 PNG、JPG 或 WebP 作为版图。<br>版图支持缩放、旋转与锁定。</p></div>${assets.map(a=>`<button class="board-asset" data-add-asset="${escape(a.id)}"><img src="${escape(a.front)}" alt="${escape(a.name)}"><strong>${escape(a.name)}</strong><span>＋</span></button>`).join('')}<button class="board-placeholder" data-action="import-board"><span>⊞</span>导入你的第一张版图</button>`;
  }
}
function renderInspector(){
  const el=$('#inspector-content'),o=primary(),items=selection();
  if(!o){el.innerHTML='';return;}else{
    const a=assetFor(state,o.assetId);
    el.innerHTML=`<div class="selected-heading"><span class="tiny-label">${items.length>1?`已选择 ${items.length} 个物件`:'当前选中'}</span><h2>${escape(objectName(o))}</h2><span class="object-type">${({card:'双面卡牌',deck:`牌堆 · ${o.cards?.length || 0} 张`,die:'六面骰 · 单面显示',token:'桌面标记',board:'自定义版图'})[o.type]}</span></div>`+
    (o.type==='card'?`<button class="inspector-card" data-action="inspect">${cardFace(texture(o.assetId,o.faceUp),!o.faceUp)}</button><div class="two-buttons"><button data-action="flip">⤾ 翻面 <kbd>F</kbd></button><button data-action="rotate">↻ 旋转 <kbd>R</kbd></button></div>`:o.type==='deck'?`<div class="deck-preview">${o.cards.length?cardFace(texture(o.cards.at(-1),o.faceUp)):fallbackBack()}<b>${o.cards.length}</b></div><button class="primary-button" data-action="draw" ${!o.cards.length?'disabled':''}>抽取顶牌 ↗</button><div class="two-buttons"><button data-action="shuffle">⤨ 洗牌</button><button data-action="spread">▱ 展开全部</button></div><p class="subtle-note">双击抽牌。Shift 多选卡牌后按 G，可重新叠成牌堆。</p>`:o.type==='die'?`<div class="die-preview" style="--swatch:${COLORS[o.color]}"><span>${pips(o.value)}</span><small>${COLOR_NAMES[o.color]} · D6</small></div><button class="primary-button" data-action="roll">⚄ 掷出这一颗 <kbd>D</kbd></button><div class="inspector-section"><h3>手动调整骰面</h3><div class="face-picker">${o.faces.map(v=>`<button data-die-value="${v}" class="${v===o.value?'active':''}">${v}</button>`).join('')}</div><p class="subtle-note">选中后按数字键切换骰面，<kbd>0</kbd> 对应 10 点。<br>可在初始设置中配置 faces 和 value。</p></div>`:o.type==='token'?`<div class="token-preview" style="background:${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}">${o.kind==='custom'?cardFace(texture(o.assetId)):tokenSVG(o.kind,o)}</div><p class="subtle-note">${escape(tokenTemplates().find(t=>t.kind===o.kind)?.description||'自由拖动、复制和摆放，记录你的游戏状态。')}</p>`:`<img class="board-preview" src="${escape(a?.front)}" alt="版图预览">`)+
    `<div class="inspector-section"><div class="section-title"><h3>物件属性</h3><button data-action="lock" class="text-button">${o.locked?'⌑ 已锁定':'⌑ 锁定'}</button></div><div class="property-row"><label>角度 <input type="number" data-property="rotation" value="${Math.round(o.rotation)}" step="15" min="-360" max="360" ${o.locked?'disabled':''}></label><span>°</span></div><div class="two-buttons"><button data-action="rotate-left">↶ −15°</button><button data-action="rotate-small">↻ +15°</button></div>${['card','board'].includes(o.type)&&state.mode==='edit'?`<div class="property-row"><label>宽度 <input type="number" data-property="width" value="${dimensions(state,o).w}" min="40" max="1600"></label><span>px</span></div><div class="property-row"><label>高度 <input type="number" data-property="height" value="${dimensions(state,o).h}" min="40" max="1600"></label><span>px</span></div>`:''}${o.type==='token'&&state.mode==='edit'?`<div class="property-row"><label>标记颜色 <input type="color" data-property="color" value="${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}"></label></div>`:''}<div class="two-buttons"><button data-action="duplicate">⧉ 复制</button><button data-action="bring-front">↑ 置顶</button></div>${o.type==='card'&&state.mode==='edit'?'<button class="full-width quiet" data-action="change-back">更换背面图片 ↗</button>':''}<button class="danger-button" data-action="delete">移除选中物件</button></div>`;
  }
  if($('#modal').open&&$('#modal').dataset.kind==='properties')$('#modal-content').innerHTML=el.innerHTML;
}
function settingsHTML(){return `<div class="project-fields"><h3>项目资料</h3><label>游戏名称<input data-meta="name" maxlength="100" value="${escape(state.name)}"></label><label>一句话介绍<textarea data-meta="description" maxlength="1000" rows="2">${escape(state.meta?.description)}</textarea></label><div class="project-field-pair"><label>人数<input data-meta="players" maxlength="100" placeholder="例如 2–4 人" value="${escape(state.meta?.players)}"></label><label>时长<input data-meta="duration" maxlength="100" placeholder="例如 20 分钟" value="${escape(state.meta?.duration)}"></label></div><label>规则说明<textarea data-meta="rules" maxlength="20000" rows="4" placeholder="写下你的游戏玩法…">${escape(state.meta?.rules)}</textarea></label><button class="primary-button" data-action="publish">展示到广场 ↗</button><button class="full-width quiet" data-action="plaza">返回展示广场</button></div><div class="inspector-section table-settings"><h3>桌布与交互</h3><label class="toggle-row"><span>操作音效</span><input type="checkbox" data-setting="sound" ${state.settings.sound?'checked':''}><i></i></label><label class="toggle-row"><span>显示网格</span><input type="checkbox" data-setting="grid" ${state.settings.grid?'checked':''}><i></i></label><label class="toggle-row"><span>${escape(game()?.snapLabel||'网格吸附')}</span><input type="checkbox" data-setting="snap" ${state.settings.snap?'checked':''}><i></i></label><label class="range-row"><span>摆放自然错位 <b>${state.settings.scatter}°</b></span><input type="range" min="0" max="12" value="${state.settings.scatter}" data-setting="scatter"></label><div class="theme-picker">${[['forest','苔绿'],['linen','亚麻'],['night','深夜']].map(([v,n])=>`<button data-theme="${v}" class="${state.settings.theme===v?'active':''}" title="${n}"><i class="${v}"></i>${n}</button>`).join('')}</div></div>`;}
function transformScene(){scene.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;}
function fit(){const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;const items=state.objects;if(!items.length){zoom=1;pan={x:r.width/2-720,y:r.height/2-500};transformScene();return;}const bounds=items.map(o=>{const {w,h}=dimensions(state,o);const a=o.rotation*Math.PI/180,hw=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*h)/2,hh=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*h)/2;return {left:o.x-hw,right:o.x+hw,top:o.y-hh,bottom:o.y+hh};});const left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right)),top=Math.min(...bounds.map(b=>b.top)),bottom=Math.max(...bounds.map(b=>b.bottom));zoom=Math.max(.2,Math.min(1.2,(r.width-100)/(right-left),(r.height-140)/(bottom-top)));pan={x:r.width/2-(left+right)/2*zoom,y:r.height/2-(top+bottom)/2*zoom};transformScene();}
function snapObject(o){if(!state.settings.snap)return;if(game()?.onDrop){game().onDrop(state,o);return;}o.x=Math.round(o.x/40)*40;o.y=Math.round(o.y/40)*40;}

function toWorld(clientX,clientY){const r=viewport.getBoundingClientRect();return {x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};}
function zoomAt(factor,cx,cy){const r=viewport.getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2;const next=Math.min(2,Math.max(.2,zoom*factor));pan.x=x-(x-pan.x)*next/zoom;pan.y=y-(y-pan.y)*next/zoom;zoom=next;transformScene();}
function viewportCenter(){const r=viewport.getBoundingClientRect();return toWorld(r.left+r.width/2,r.top+r.height/2);}
function addAsset(id){const a=assetFor(state,id);if(!a)return;mutate(()=>{const p=viewportCenter();const o={...baseObject(a.type,p.x+(Math.random()-.5)*70,p.y+(Math.random()-.5)*70,nextZ(state)),assetId:a.id,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};if(a.type==='board'){o.width=a.width;o.height=a.height;o.z=0;}if(a.type==='token'){o.kind='custom';o.name=a.name;o.color='#c79e62';}state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}
function addDie(id){const template=diceTemplates().find(d=>d.id===id);if(!template)return;mutate(()=>{const p=viewportCenter(),{color,faces,name}=template;const o={...baseObject('die',p.x,p.y,nextZ(state)),name,color,value:faces[0],faces:[...faces]};state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}
function addToken(kind){const template=tokenTemplates().find(t=>t.kind===kind);if(!template)return;mutate(()=>{const p=viewportCenter();const {name,color}=template;const o={...baseObject('token',p.x,p.y,nextZ(state)),kind,name,color};state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}

function setDiceValue(value){const dice=selection().filter(o=>o.type==='die'&&!o.locked&&!rolling.has(o.id)&&o.faces.includes(value)&&o.value!==value);if(dice.length)mutate(()=>dice.forEach(o=>o.value=value),{audio:'die-drop'});}
function isMovable(o){return !o.locked;}
function flip(){const cards=selection().filter(o=>['card','deck'].includes(o.type)&&isMovable(o));if(!cards.length)return;mutate(()=>cards.forEach(o=>o.faceUp=!o.faceUp),{audio:'flip'});}
function rotate(amount=90){const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>items.forEach(o=>{o.rotation=Math.round((o.rotation+amount)*10)/10;if(amount%90===0&&game()?.onDrop&&o.type==='card')snapObject(o);}),{audio:()=>playObjects(items)});}
function draw(){const deck=primary();if(deck?.type!=='deck'||!deck.cards.length||deck.locked)return;mutate(()=>{const card=drawFromDeck(state,deck);selected=new Set([card.id]);},{audio:'draw'});}
function roll(){
  const dice=selection().filter(o=>o.type==='die'&&!o.locked&&!rolling.has(o.id));if(!dice.length)return;
  checkpoint();for(const d of dice){rolling.add(d.id);d.value=d.faces[Math.floor(Math.random()*6)];d.rotation+=(Math.random()-.5)*state.settings.scatter*2;}render();play(dice.length>1?'roll-many':'roll');
  for(const [i,die]of dice.entries()){
    const face=objectNodes.get(die.id)?.querySelector('.die-face');if(!face)continue;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?1:650+i*40;
    face.animate([{transform:'translate(0,0) rotate(0deg)'},{transform:'translate(8px,-7px) rotate(25deg)',offset:.2},{transform:'translate(-7px,2px) rotate(-20deg)',offset:.45},{transform:'translate(3px,-2px) rotate(10deg)',offset:.7},{transform:'translate(0,0) rotate(0deg)'}],{duration,easing:'ease-out'});
  }
  setTimeout(()=>{dice.forEach(d=>rolling.delete(d.id));render();save();},700+dice.length*40);
}
function shuffle(){const deck=primary();if(deck?.type!=='deck'||deck.locked||deck.cards.length<2)return;mutate(()=>deck.cards=shuffled(deck.cards),{audio:'shuffle'});const node=objectNodes.get(deck.id);node?.animate([{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`},{transform:`translate(-35%,-50%) rotate(${deck.rotation+8}deg)`,offset:.3},{transform:`translate(-65%,-50%) rotate(${deck.rotation-8}deg)`,offset:.65},{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`}],{duration:450});notify('牌堆已洗匀');}
function stack(){const eligible=selection().filter(o=>['card','deck'].includes(o.type)&&!o.locked);if(eligible.length<2){notify('按住 Shift 选择至少两张卡牌或牌堆，再合并');return;}mutate(()=>{const deck=mergeCards(state,[...selected]);if(deck)selected=new Set([deck.id]);},{audio:'card-drop'});}
function spread(){const deck=primary();if(deck?.type!=='deck'||deck.locked||!deck.cards.length)return;mutate(()=>{const ids=[];deck.cards.forEach((id,i)=>{const o={...baseObject('card',deck.x+(i%5)*185,deck.y+Math.floor(i/5)*265,nextZ(state)+i),assetId:id,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};state.objects.push(o);ids.push(o.id);});state.objects=state.objects.filter(o=>o.id!==deck.id);selected=new Set(ids);},{audio:'spread'});}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());setAudioEnabled(state.settings.sound);selected.clear();rolling.clear();render();save();notify(redo?'已重做':'已撤销');}
function remove(){const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>{const ids=new Set(items.map(o=>o.id));state.objects=state.objects.filter(o=>!ids.has(o.id));selected.clear();},{audio:()=>playObjects(items,'pickup')});}
function duplicate(){const items=selection();if(!items.length)return;mutate(()=>{const added=items.map(o=>({...structuredClone(o),id:uid(),x:o.x+45,y:o.y+45,z:nextZ(state)+1,locked:false}));state.objects.push(...added);selected=new Set(added.map(o=>o.id));},{audio:()=>playObjects(items)});}
function openModal(html,wide=false){$('#modal').dataset.kind='';$('#modal-content').innerHTML=html;$('#modal').classList.toggle('wide',wide);if(!$('#modal').open)$('#modal').showModal();}
function rules(){const rules=game()?.rules;openModal(`<span class="section-eyebrow">HOW TO PLAY</span><h2>${escape(rules?.title||state.name)}</h2>${rules?`<p class="modal-lead">${escape(rules.credit)}</p><ol class="rule-steps">${rules.steps.map(([title,text])=>`<li><strong>${escape(title)}</strong><p>${escape(text)}</p></li>`).join('')}</ol><a class="primary-button" href="${rules.pdf}" target="_blank" rel="noopener">打开完整规则 ↗</a>${(rules.links||[]).map(([label,url])=>`<a class="primary-button" href="${escape(url)}" target="_blank" rel="noopener">${escape(label)} ↗</a>`).join('')}`:''}<div class="project-rules-text">${escape(state.meta?.rules||(!rules?'还没有规则说明，可在编辑模式的「桌面」抽屉中填写。':''))}</div>${game()?.score?`<p class="subtle-note">参考得分：${game().score(state).total}</p>`:''}<p class="subtle-note">工坊提供自由操作桌面，游戏规则由玩家执行。</p>`);}

function renderGameDialog(){
  const view=$('#modal').dataset.gameView||'journal';
  $('#modal-content').innerHTML=game()?.[view]?.(state)||'';
}
function gameAction(action,value){
  if(['journal','catalog','heroes'].includes(action)){
    openModal(game()?.[action]?.(state)||'',action!=='journal');
    $('#modal').dataset.kind='game';$('#modal').dataset.gameView=action;return;
  }
  if(!game()?.act)return;
  // Apply to an isolated draft: a rejected action must leave the table and undo intact.
  const draft=structuredClone(state);
  const message=game().act(draft,action,value,[...selected]);
  mutate(()=>{state=draft;selected=new Set([...selected].filter(id=>state.objects.some(o=>o.id===id)));},{audio:'drop'});
  if(action==='choose-hero'){$('#modal').close();fit();}
  if(message)notify(message);
}
function gameError(error){
  notify(error.message);
  if($('#modal').open&&$('#modal').dataset.kind==='game'){
    $('#game-error')?.remove();
    const note=document.createElement('p');note.id='game-error';note.className='ih-alert';note.setAttribute('role','alert');note.textContent=error.message;
    $('#modal-content').prepend(note);$('#modal').scrollTop=0;
  }
}

function help(){openModal(`<span class="section-eyebrow">A LITTLE GUIDE</span><h2>把鼠标，当作你的手。</h2><p class="modal-lead">随手摆放，认真游玩。</p><div class="shortcut-list">${[['Ctrl + E','切换游玩 / 编辑模式'],['Esc（游玩时）','显示编辑入口'],['拖动物件','拿起、移动、松手摆放'],['空白处左键拖动','框选多个部件；拖动其中一个一起移动'],['Shift + 框选','追加选择部件'],['按住空格 + 左键拖动 / 中键拖动','抓手工具，平移桌面'],['Ctrl + 滚轮 / ＋ / −','缩放桌面；普通滚轮不改变视角'],['数值标记上滚轮','向上 +1，向下 −1，遵守游戏数值范围'],['Shift + 点击','选择多个物件'],['双击卡牌 / F','翻转正反面'],['R / Shift + R','旋转 90° / −90°'],['双击牌堆','抽取顶牌'],['G','多选卡牌，合成牌堆'],['Alt + 拖到另一张牌上','合并为牌堆'],['D / 双击骰子','投掷选中骰子'],['选中骰子 + 数字键','切换对应骰面；0 = 10 点'],['右键卡牌','查看卡牌详情'],['右键其他部件','打开物件属性'],['Ctrl + D / Delete','复制 / 移除'],['Ctrl + Z / Ctrl + Shift + Z','撤销 / 重做'],['Esc','关闭弹窗 / 取消选择']].map(([k,v])=>`<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div><p class="subtle-note">图片与进度保存在当前浏览器。导出桌面可备份或换设备继续。触屏支持单指拖动与缩放按钮。</p>`);}
function inspect(){const o=primary();if(!o)return;if(o.type==='card')openModal(`<span class="section-eyebrow">${escape(objectName(o))}</span><h2>${o.faceUp?'卡牌正面':'卡牌背面'}</h2><div class="large-card" style="aspect-ratio:${dimensions(state,o).w}/${dimensions(state,o).h}">${cardFace(texture(o.assetId,o.faceUp),!o.faceUp)}</div><button class="primary-button" data-action="inspect-flip">⤾ 查看另一面</button>${state.mode==='edit'?'<button class="full-width quiet" data-action="properties">编辑卡牌属性 ↗</button>':''}`);else if(o.type==='board')openModal(`<h2>${escape(objectName(o))}</h2><img class="large-board" src="${escape(texture(o.assetId))}" alt="版图">`,true);else notify('在右侧面板中调整物件属性');}
function exportSession(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`桌间-${state.name.replace(/[\\/:*?"<>|]/g,'-')}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('桌面已导出，包含自定义图片和所有物件');}
function confirmNew(){const setup=state.setup||state.initialSetup;openModal(`<span class="section-eyebrow">A FRESH START</span><h2>从初始设置开始。</h2><p class="modal-lead">使用「${escape(setup.name)}」布置 ${setup.objects.length} 个物件。当前布局将被替换，你仍可用撤销恢复。${setup.objects.length?'':'你也可以先在编辑模式中保存开局。'}</p><button class="primary-button" data-action="confirm-new">开始新一局 ↗</button><button class="full-width quiet" data-action="export">先导出当前桌面</button>`);}

function writeSetup(setup){$('#setup-source').value=JSON.stringify(setup,null,2);setupDirty=false;$('#setup-error').textContent='';}
function markSetupDraft(){state.setupDraft=$('#setup-source').value;setupDirty=true;$('#setup-status').textContent='有未保存的修改';$('#setup-error').textContent='';save();}
function renderSetup(){
  setupDirty=typeof state.setupDraft==='string';
  if(setupDirty){if($('#setup-source').value!==state.setupDraft)$('#setup-source').value=state.setupDraft;}else writeSetup(state.setup||captureSetup(state));
  $('#setup-status').textContent=setupDirty?'有未保存的修改':state.setup?`新一局使用：${state.setup.name}`:`尚未保存 · 新一局使用「${state.initialSetup.name}」`;
  $('#setup-assets').innerHTML='<strong>可用图片资产</strong>'+state.assets.map(a=>`<div><code>${escape(a.id)}</code> ${escape(a.name)}</div>`).join('');
}
function readSetup(){try{const setup=validateSetup(JSON.parse($('#setup-source').value),state);$('#setup-error').textContent='';return setup;}catch(error){$('#setup-error').textContent=`无法使用这份设置：${error.message}`;return null;}}

function properties(){if(!primary())return;openModal($('#inspector-content').innerHTML);$('#modal').dataset.kind='properties';}
const actions={flip,rotate,draw,shuffle,stack,spread,roll,undo,redo:()=>undo(true),delete:remove,duplicate,rules,help,inspect,export:exportSession,'new-game':confirmNew,'confirm-new':()=>{mutate(()=>{state=applySetup(state,state.setup||state.initialSetup);selected.clear();},{audio:'shuffle'});$('#modal').close();fit();},'close-modal':()=>$('#modal').close(),'inspect-flip':()=>{flip();inspect();},'rotate-left':()=>rotate(-15),'rotate-small':()=>rotate(15),'bring-front':()=>mutate(()=>selection().filter(isMovable).forEach((o,i)=>o.z=nextZ(state)+i)),'lock':()=>{const items=selection();if(items.length)mutate(()=>{const lock=!items.every(o=>o.locked);items.forEach(o=>o.locked=lock);});},'sound':()=>{mutate(()=>state.settings.sound=!state.settings.sound);if(state.settings.sound)play('drop');notify(state.settings.sound?'音效已开启':'音效已关闭');},'grid':()=>mutate(()=>state.settings.grid=!state.settings.grid),'zoom-in':()=>zoomAt(1.15),'zoom-out':()=>zoomAt(1/1.15),'fit':fit,'import-assets':()=>{importPurpose='new';$('#asset-input').click();},'import-board':()=>{importPurpose='board';$('#asset-input').click();},'change-back':()=>{importPurpose='back';$('#asset-input').click();},'import-session':()=>$('#session-input').click(),'confirm-import':()=>finishImport()};
actions.properties=properties;
actions.plaza=()=>plaza.show('all');
actions['new-project']=()=>openModal('<span class="section-eyebrow">A TABLE OF YOUR OWN</span><h2>你的下一个游戏。</h2><p class="modal-lead">从空白项目开始，导入图片资产，摆放部件，再保存初始设置。</p><label class="create-project-label">游戏名称<input id="new-project-name" maxlength="100" placeholder="给这个灵感起个名字" value="未命名游戏"></label><button class="primary-button" data-action="confirm-create-project">创建项目 ↗</button>');
actions['confirm-create-project']=async()=>{const name=$('#new-project-name').value.trim();if(!name){notify('请填写游戏名称');return;}await plaza.create(name);};
actions.publish=()=>{const entry=makeExhibit(state);openModal(`<span class="section-eyebrow">A PLACE ON THE PLAZA</span><h2>让作品摆上广场。</h2><p class="modal-lead">展示在这台设备的本地广场中，打开时会创建游玩副本。</p><div class="publish-preview"><h3>${escape(state.name)}</h3><p>${escape(state.meta?.description||'一张桌面，一场等待开始的游戏。')}</p><p>${entry.session.objects.length} 个初始部件 · ${state.assets.length} 份资产</p></div><button class="primary-button" data-action="confirm-publish">保存展示版本 ↗</button>`);};
actions['confirm-publish']=async()=>{const entry=makeExhibit(state);await saveNow();await projectStore.exhibit(entry);$('#modal').close();await plaza.show('exhibits');notify('作品已展示在本地广场');};
actions['close-drawer']=()=>setDrawer(null);
actions['blank-table']=()=>openModal('<span class="section-eyebrow">YOUR NEXT GAME</span><h2>从一张空桌开始。</h2><p class="modal-lead">清空当前摆放，保留你的资产库。可以撤销恢复，也可以先导出备份。</p><button class="primary-button" data-action="confirm-blank">新建空白桌面 ↗</button>');
actions['confirm-blank']=()=>{mutate(()=>{state.objects=[];selected.clear();});$('#modal').close();};
actions['capture-setup']=()=>{const setup=captureSetup(state);setup.name=state.setup?.name||setup.name;writeSetup(setup);markSetupDraft();renderSetup();notify('已生成配置草稿，保存后才会用于新一局');};
actions['default-setup']=()=>{const setup=structuredClone(state.initialSetup);writeSetup(setup);markSetupDraft();renderSetup();};
actions['save-setup']=()=>{const setup=readSetup();if(!setup)return;setupDirty=false;mutate(()=>{state.setup=setup;delete state.setupDraft;});notify('初始设置已保存，新一局将使用这份配置');};
actions['preview-setup']=()=>{const setup=readSetup();if(!setup)return;mutate(()=>{state=applySetup(state,setup);selected.clear();});fit();notify('已试运行初始设置，可用撤销恢复桌面');};
actions['clear-setup']=()=>{setupDirty=false;mutate(()=>{delete state.setup;delete state.setupDraft;});notify('已恢复默认开局，可撤销');};
$('#setup-source').addEventListener('input',markSetupDraft);

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.gameAction){try{gameAction(b.dataset.gameAction,b.dataset.gameValue||'');}catch(error){gameError(error);}return;}
  if(b.dataset.action){try{const result=actions[b.dataset.action]?.();if(result?.then){b.disabled=true;result.catch(error=>notify(error.message)).finally(()=>b.disabled=false);}}catch(error){notify(error.message);}}
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
  if(el.dataset.meta==='name'&&!el.value.trim()){el.value=state.name;notify('游戏名称不能为空');}
  if(el.dataset.property){const o=primary();if(!o||o.locked)return;const p=el.dataset.property;const v=p==='color'?el.value:Number(el.value);if(p!=='color'&&(!Number.isFinite(v)||(p==='rotation'?Math.abs(v)>360:v<40||v>1600))){notify('请输入有效范围内的数值');renderInspector();return;}mutate(()=>o[p]=v);}
});
document.addEventListener('input',e=>{
  const el=e.target,key=el.dataset.meta;if(!key)return;
  const value=el.value;if(key==='name'&&!value.trim())return;
  if(metaEditing!==el){checkpoint();metaEditing=el;}
  if(key==='name'){state.name=value;$('.project-name>span:nth-child(2)').textContent=value;$('.table-toolbar h2').textContent=value;}else state.meta[key]=value;
  $('[data-action="undo"]').disabled=false;$('[data-action="redo"]').disabled=true;save();
});
document.addEventListener('focusout',e=>{if(e.target===metaEditing)metaEditing=null;});

viewport.addEventListener('pointerdown',e=>{
  if(drag||e.target.closest('button,.view-tools,#game-controls'))return;if(e.button!==0&&e.button!==1)return;
  viewport.focus({preventScroll:true});
  const node=e.target.closest('.table-object'),o=node&&state.objects.find(x=>x.id===node.dataset.id);
  if(isPanGesture(e.button,spaceDown)){drag={kind:'pan',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,pan:{...pan},moved:false};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');e.preventDefault();return;}
  if(!o){drag={kind:'marquee',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,moved:false,add:e.shiftKey,selected:[...selected]};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;}
  if(e.shiftKey){select(o,true);e.preventDefault();return;}
  if(!selected.has(o.id))select(o);if(o.locked||rolling.has(o.id))return;
  const items=selection().filter(o=>isMovable(o)&&!rolling.has(o.id));drag={kind:'object',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,ids:items.map(x=>x.id),starts:items.map(x=>({id:x.id,x:x.x,y:x.y,rotation:x.rotation})),moved:false,alt:e.altKey};viewport.setPointerCapture(e.pointerId);e.preventDefault();
});
viewport.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.moved&&Math.hypot(dx,dy)<3)return;
  if(!drag.moved){drag.moved=true;if(drag.kind==='object'){checkpoint();const items=state.objects.filter(o=>drag.ids.includes(o.id));items.forEach((o,i)=>{if(o.type!=='board')o.z=nextZ(state)+i;});playObjects(items,'pickup');}}
  if(drag.kind==='pan'){pan={x:drag.pan.x+dx,y:drag.pan.y+dy};transformScene();return;}
  if(drag.kind==='marquee'){updateMarquee(e);return;}
  const moveX=Math.max(...drag.starts.map(o=>-10000-o.x),Math.min(dx/zoom,...drag.starts.map(o=>10000-o.x)));
  const moveY=Math.max(...drag.starts.map(o=>-10000-o.y),Math.min(dy/zoom,...drag.starts.map(o=>10000-o.y)));
  for(const start of drag.starts){const o=state.objects.find(x=>x.id===start.id);if(!o)continue;o.x=start.x+moveX;o.y=start.y+moveY;const node=objectNodes.get(o.id);node?.classList.add('dragging');node?.style.setProperty('--x',`${o.x}px`);node?.style.setProperty('--y',`${o.y}px`);if(node)node.style.zIndex=objectLayer(o);}
});
function updateMarquee(e){
  const r=viewport.getBoundingClientRect(),left=Math.max(0,Math.min(drag.sx,e.clientX)-r.left),top=Math.max(0,Math.min(drag.sy,e.clientY)-r.top),right=Math.min(r.width,Math.max(drag.sx,e.clientX)-r.left),bottom=Math.min(r.height,Math.max(drag.sy,e.clientY)-r.top);
  const marquee=$('#selection-marquee');marquee.hidden=false;marquee.style.cssText=`left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px`;
  const matches=objectsInRect(state,{left:(left-pan.x)/zoom,top:(top-pan.y)/zoom,right:(right-pan.x)/zoom,bottom:(bottom-pan.y)/zoom}).filter(o=>!rolling.has(o.id));
  selected=new Set([...(drag.add?drag.selected:[]),...matches.map(o=>o.id)]);renderSelection();
}
function endDrag(e,cancelled=false){
  if(!drag)return;const previous=drag;drag=null;viewport.classList.remove('panning');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
  if(previous.kind==='pan'){if(cancelled){pan=previous.pan;transformScene();}return;}
  if(previous.kind==='marquee'){$('#selection-marquee').hidden=true;if(cancelled)selected=new Set(previous.selected);else if(!previous.moved&&!previous.add)selected.clear();renderSelection();renderInspector();if(previous.moved&&!cancelled&&selected.size)notify(`已选中 ${selected.size} 个部件，拖动其中一个即可一起移动`);return;}
  if(previous.moved){
    for(const cue of new Set(state.objects.filter(o=>previous.ids.includes(o.id)).map(o=>objectSound(o,'pickup'))))stopSound(cue);
    if(cancelled){state=JSON.parse(history.pop());render();return;}
    let didStack=false;
    if((e.altKey||previous.alt)&&previous.ids.length===1){const o=state.objects.find(x=>x.id===previous.ids[0]);const target=state.objects.filter(x=>x.id!==o.id&&!x.locked&&['card','deck'].includes(x.type)&&Math.hypot(x.x-o.x,x.y-o.y)<85).sort((a,b)=>b.z-a.z)[0];if(target&&['card','deck'].includes(o.type)){const d=mergeCards(state,[o.id,target.id]);selected=new Set([d.id]);didStack=true;}}
    if(!didStack&&previous.ids.length===1){const o=state.objects.find(x=>x.id===previous.ids[0]);if(o)snapObject(o);}
    playObjects(selection());render();save();
  }
}
viewport.addEventListener('pointerup',e=>endDrag(e));viewport.addEventListener('pointercancel',e=>endDrag(e,true));
viewport.addEventListener('dblclick',e=>{if(spaceDown||e.button!==0)return;const node=e.target.closest('.table-object')||document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-object');if(!node)return;const o=state.objects.find(x=>x.id===node.dataset.id);select(o);if(o.type==='card')flip();else if(o.type==='deck')draw();else if(o.type==='die')roll();});
viewport.addEventListener('wheel',e=>{
  e.preventDefault();
  if(e.target.closest('#game-controls,.view-tools'))return;
  const node=e.target.closest('.table-object'),o=node&&state.objects.find(x=>x.id===node.dataset.id);
  const intent=wheelIntent(e,o,{handTool:spaceDown,dragging:!!drag});
  if(intent.kind==='zoom'){const r=viewport.getBoundingClientRect();zoomAt(intent.factor,e.clientX-r.left,e.clientY-r.top);}
  else if(intent.kind==='counter'){
    const draft=structuredClone(state),token=draft.objects.find(x=>x.id===o.id);
    if(adjustTokenValue(draft,token,intent.delta,game()?.adjustToken))mutate(()=>state=draft);
  }
},{passive:false});
viewport.addEventListener('contextmenu',e=>{const node=e.target.closest('.table-object');if(!node)return;e.preventDefault();const o=state.objects.find(x=>x.id===node.dataset.id);if(!o)return;select(o);if(o.type==='card')inspect();else properties();});
viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
document.addEventListener('keydown',e=>{
  if($('#app').hidden)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'&&!$('#modal').open&&!drag){e.preventDefault();setMode(state.mode==='play'?'edit':'play');return;}
  if(e.key==='Escape'&&drag){e.preventDefault();endDrag({pointerId:drag.pointerId},true);return;}
  if(e.code==='Space'&&!e.target.closest('input,textarea,select,[contenteditable="true"]')&&!$('#modal').open&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();spaceDown=true;viewport.classList.add('space-pan');return;}
  if(drag)return;
  if(e.key==='Escape'&&!$('#modal').open){if(activeDrawer){setDrawer(null);return;}select(null);if(state.mode==='play')revealEditor();return;}
  if(e.target.matches('input,textarea,select')||$('#modal').open)return;
  const k=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&k==='z'){e.preventDefault();undo(e.shiftKey);return;}if(ctrl&&k==='y'){e.preventDefault();undo(true);return;}if(ctrl&&k==='d'){e.preventDefault();duplicate();return;}if(ctrl&&k==='s'){e.preventDefault();exportSession();return;}if(ctrl)return;
  if(!e.altKey&&!e.shiftKey&&/^\d$/.test(k)&&selection().some(o=>o.type==='die')){e.preventDefault();if(!e.repeat&&!drag)setDiceValue(k==='0'?10:Number(k));return;}
  const map={f:flip,r:()=>rotate(e.shiftKey?-90:90),d:roll,g:stack,delete:remove,backspace:remove,'+':()=>zoomAt(1.15),'=':()=>zoomAt(1.15),'-':()=>zoomAt(1/1.15),'0':fit,'?':help};if(map[k]){e.preventDefault();map[k]();}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;viewport.classList.remove('space-pan');}});
window.addEventListener('blur',()=>{spaceDown=false;viewport.classList.remove('space-pan');if(drag)endDrag({pointerId:drag.pointerId},true);});
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
$('#session-input').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>50*1024*1024)throw new Error('存档请小于 50 MB');const imported=migrateSession(JSON.parse(await file.text()));await plaza.import(imported);notify('项目已导入，原项目也会保留');}catch(error){notify(`无法载入：${error.message}`);}});

window.addEventListener('beforeunload',()=>{if(saveTimer&&workspaceLoaded){try{localStorage.setItem(RECOVERY,JSON.stringify({...state,updatedAt:Date.now()}));}catch{}}});
new ResizeObserver(()=>{if(!drag&&!$('#app').hidden)fit();}).observe(viewport);
plaza=createPlaza({flush:saveNow,activate:activateSession,notify});
async function initialize(){
  try{
    try{const recovery=localStorage.getItem(RECOVERY);if(recovery){const recovered=migrateSession(JSON.parse(recovery)),record=await projectStore.get(recovered.projectId);if(!record||recovered.updatedAt>record.updatedAt)await projectStore.save(recovered);localStorage.removeItem(RECOVERY);}}catch(error){notify(`恢复存档未能读取，原文件已保留：${error.message}`);}
    try{const legacy=localStorage.getItem(STORAGE);if(legacy&&!localStorage.getItem('tablecraft.legacy-migrated')){await projectStore.save(migrateSession(JSON.parse(legacy)));localStorage.setItem('tablecraft.legacy-migrated','yes');}}catch(error){notify(`旧桌面未能迁移，原存档已保留：${error.message}`);}
    await plaza.show('all');
  }catch(error){notify(`本地项目库未能读取：${error.message}`);$('#plaza-loading').textContent='项目库暂时无法读取。你可以导入导出的项目文件。';}
}
initialize();
