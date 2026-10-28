import {deckControlsHTML,deckSearchHTML} from './deck-controls.js';
import {canResize,resizeObjects,matchObjectSize} from './sizing.js';
import {sharedDice,sharedTokens,sharedDieImage,sharedToken} from './shared-assets.js';
import {SHORTCUT_STORAGE,shortcutDefinitions,defaultShortcuts,eventShortcut,bindingError,loadShortcuts,shortcutAction,deckShortcutAction} from './shortcuts.js';
import {deckEntries,replaceDeckEntries,flipDeck,flipTopCard,shuffleDeck,setDeckFace,createFixedPile,canMoveObject,adjustTokenValue,createSession,applySetup,createDealSlot,validateDeals,assetFor,baseObject,uid,nextZ,dimensions,objectsInRect,pointOnObject,drawDestination,drawFromDeck,drawDeckCard,takeDeckCard,mergeCards,shuffled,COLORS,COLOR_NAMES} from './model.js';
import {gameFor,migrateSession,makeExhibit,saveEditorDraft,openEditor,addSetupProfile,switchSetupProfile,updateSetupProfile,removeSetupProfile,startOpening} from './projects.js';
import {projectStore} from './project-store.js';
import {createPlaza} from './plaza.js';
import {sound,objectSound,setAudioEnabled,unlockAudio,stopSound} from './audio.js';
import {wheelIntent,isPanGesture,cardDropPlan,snapCardOnto} from './interactions.js';
import {openingHTML as openingPropertiesHTML,drawTargetHTML,openingChoicesHTML,pileSettingsHTML,sizeSettingsHTML} from './opening-editor.js';
import {nameMatches,libraryName} from './library.js';
import {examples} from './projects.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let shortcuts=loadShortcuts(localStorage);
const STORAGE='tablecraft.workspace.v1',RECOVERY='tablecraft.recovery.v2';
let state=createSession(),storageFailed=false,workspaceLoaded=false,plaza,savedFingerprint='';
let selected=new Set(),history=[],future=[],tab='cards',zoom=1,pan={x:0,y:0},drag=null,saveTimer,toastTimer,spaceDown=false,importPurpose='new',pendingImages=[],rolling=new Set();
let metaEditing=null,pendingExport=null,exportReplacementId;
let pickingDrawTarget=null,deckScope='top',deckScopeId=null;
const currentDeckScope=()=>primary()?.id===deckScopeId?deckScope:'top';
function setDeckScope(scope){const deck=primary();if(deck?.type!=='deck'||deck.locked)return;deckScope=scope;deckScopeId=deck.id;renderSelection();renderInspector();}
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
  clearTimeout(saveTimer);saveTimer=null;if(!workspaceLoaded)return;
  state=saveEditorDraft(state);if(JSON.stringify(state)===savedFingerprint)return;
  const snapshot=structuredClone(state);snapshot.updatedAt=Date.now();
  try{await projectStore.save(snapshot);if(state.projectId===snapshot.projectId){state.updatedAt=snapshot.updatedAt;savedFingerprint=JSON.stringify(snapshot);$('#save-status').textContent=state.mode==='edit'?'草稿已保存':'进度已保存';}storageFailed=false;}
  catch(error){$('#save-status').textContent='保存失败，请修改名称';storageFailed=true;if(error.code==='DRAFT_NAME_CONFLICT')openModal(`<h2>本地草稿已有同名游戏</h2><p class="modal-lead">请给当前草稿换一个名称，已有草稿会保留。</p><label class="create-project-label">草稿名称<input id="draft-rename" maxlength="100" value="${escape(state.name)}"></label><button class="primary-button" data-action="rename-conflicting-draft">改名并保存</button>`);else notify(error.message);throw error;}
}
function save(){if(!workspaceLoaded)return;clearTimeout(saveTimer);$('#save-status').textContent='正在保存…';saveTimer=setTimeout(()=>saveNow().catch(()=>{}),300);}
function game(){return gameFor(state.gameId);}
function commonDiceTemplates(){return [...sharedDice,...['ivory','orange','lemon','lime'].map(color=>({id:color,color,name:`${COLOR_NAMES[color]}六面骰`,faces:[1,2,3,4,5,6]}))];}
function diceTemplates(){return [...commonDiceTemplates(),...(game()?.dice||[])];}
function commonTokenTemplates(){return [...sharedTokens,{kind:'disc',name:'圆形标记',color:'#c79e62',description:'自由用途 · 可修改颜色'}];}
function tokenTemplates(){return [...commonTokenTemplates(),...(game()?.tokens||[])];}
async function activateSession(session,{newExample=false,chooseProfile=false}={}){
  cancelDrawTarget();state=migrateSession(session);workspaceLoaded=true;savedFingerprint='';selected.clear();rolling.clear();history=[];future=[];tab=gameTab='cards';activeDrawer=state.mode==='edit'?'assets':null;
  if(state.mode==='play'&&(state.awaitingOpening||(newExample||chooseProfile)&&state.setupProfiles?.length>1)){state.awaitingOpening=true;state.objects=[];}
  $('#modal').close();$('#plaza').hidden=true;$('#app').hidden=false;
  setAudioEnabled(state.settings.sound);render();requestAnimationFrame(fit);await saveNow();
  if(state.awaitingOpening||(newExample||chooseProfile)&&state.setupProfiles?.length>1)chooseOpening();else if(newExample&&game()?.startView)gameAction(game().startView,'');
}

function mutate(fn,{audio=null}={}){checkpoint();fn();setAudioEnabled(state.settings.sound);render();save();if(typeof audio==='function')audio();else if(audio)play(audio);}
function selection(){return state.objects.filter(o=>selected.has(o.id));}
function primary(){return selection().at(-1);}
function select(o,add=false){const prior=primary()?.id;if(!add)selected.clear();if(o){if(add&&selected.has(o.id))selected.delete(o.id);else selected.add(o.id);}renderSelection();renderInspector();renderDrawTarget();if(primary()?.id!==prior)$('#inspector-content').scrollTop=0;renderDrawers();}
function renderDrawTarget(){
  const marker=$('#draw-target'),owner=primary();let target;try{target=owner?.drawTarget&&drawDestination(state,owner);}catch{};
  marker.hidden=state.mode!=='edit'||!target;
  if(marker.hidden)return;
  const {w,h}=dimensions(state,target.deck||owner);
  marker.style.cssText=`pointer-events:${(!owner.drawTarget.mode||owner.drawTarget.mode==='position')?'auto':'none'};--x:${target.x}px;--y:${target.y}px;--w:${w}px;--h:${h}px;--angle:${target.rotation}deg`;
}
function cancelDrawTarget(){pickingDrawTarget=null;viewport.classList.remove('picking-draw-target');}
function objectName(o){if(o.type==='deal')return o.name||'初始牌位';if(o.type==='card')return o.faceUp===false?'背面朝上的卡牌':assetFor(state,o.assetId)?.name||'卡牌';if(o.type==='deck')return o.name||'牌堆';if(o.type==='die')return o.name||`${COLOR_NAMES[o.color]||'自定义'}骰子`;if(o.type==='board')return assetFor(state,o.assetId)?.name||'版图';return o.name||'标记';}
function texture(id,face=true){const a=assetFor(state,id);return face?a?.front:a?.back;}
function fallbackBack(){return '<div class="custom-back"><span>✳</span><small>TABLECRAFT</small></div>';}
function cardFace(url,back=false){return url?`<img src="${escape(url)}" alt="${back?'卡牌背面':'卡牌正面'}" draggable="false">`:fallbackBack();}
function pips(value){if(value>6)return `<span class="face-number">${value}</span>`;const patterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};return `<span class="pips">${Array.from({length:9},(_,i)=>`<i class="${patterns[value]?.includes(i)?'pip':''}"></i>`).join('')}</span>`;}
function dieVisual(o){const image=sharedDieImage(o.skin,o.value);return image?`<img class="shared-die-image" src="${image}" alt="" draggable="false">`:pips(o.value);}
function dieHTML(o){return `<div class="die-face ${sharedDieImage(o.skin,o.value)?'shared-die-face':''}" aria-hidden="true">${dieVisual(o)}</div>`;}
function tokenSVG(kind,o){const shared=sharedToken(kind);if(shared)return `<img class="shared-token-image" src="${shared.image}" alt="" draggable="false">${Number.isFinite(o?.value)?`<span class="shared-token-value">${o.value}</span>`:''}`;return game()?.tokens?.some(t=>t.kind===kind)?game().tokenIcon(kind,o):`<span class="disc-star">${Number.isFinite(o?.value)?o.value:'✦'}</span>`;}
function tokenFace(o){if(o.kind==='custom'){const image=texture(o.assetId,o.faceUp!==false);return image?cardFace(image,o.faceUp===false):'<span class="token-back" aria-label="背面">●</span>';}return o.faceUp===false?'<span class="token-back" aria-label="背面">●</span>':tokenSVG(o.kind,o);}
function nodeSignature(o){return JSON.stringify([o.type,o.skin,o.assetId,o.cards?.length,o.cards?.at(-1),o.faces,o.kind,o.name,o.maxCards,o.fixedPosition,o.type==='token'?[o.value,o.faceUp]:null,o.type==='deal'?[o.sourceKey,o.count,o.layout,o.spacing]:null]);}
function syncObjects(){
  const present=new Set(state.objects.map(o=>o.id));
  for(const [id,node] of objectNodes)if(!present.has(id)){node.remove();objectNodes.delete(id);}
  for(const o of state.objects){
    let node=objectNodes.get(o.id);if(!node){node=document.createElement('div');node.dataset.id=o.id;node.tabIndex=0;node.setAttribute('role','button');objects.append(node);objectNodes.set(o.id,node);}
    const signature=nodeSignature(o);
    if(node.dataset.signature!==signature){
      if(o.type==='card')node.innerHTML=`<div class="card-shadow"></div><div class="card-lift"><div class="card-flipper"><div class="card-side card-front">${cardFace(texture(o.assetId,true))}</div><div class="card-side card-back">${cardFace(texture(o.assetId,false),true)}</div></div></div>`;
      else if(o.type==='deck')node.innerHTML=`<div class="deck-layers">${Array.from({length:Math.min(6,o.cards.length)},(_,i)=>`<div class="deck-layer" style="--layer:${i};--phase:${((i*7)%5-2)*state.settings.scatter/3}deg"></div>`).join('')}</div><div class="deck-top">${o.cards.length?cardFace(texture(o.cards.at(-1),o.faceUp),!o.faceUp):`<span class="empty-pile">${o.fixedPosition?'':'牌堆已空'}</span>`}</div>${o.maxCards===1?'':`<span class="deck-count">${o.cards.length}</span>`}${o.fixedPosition?`<span class="pile-guide" aria-hidden="true"></span><span class="pile-label" aria-hidden="true">${escape(o.name||'固定牌位')}</span>`:`<span class="deck-caption">${escape(o.name)}</span>`}`;
      else if(o.type==='die')node.innerHTML=dieHTML(o);
      else if(o.type==='token')node.innerHTML=`<div class="token-body">${tokenFace(o)}</div>`;
      else if(o.type==='deal'&&o.layout==='deck')node.innerHTML=`<div class="deck-layers"></div><div class="deck-top"><span class="empty-pile"></span></div>${o.maxCards===1?'':`<span class="deck-count">${o.count}</span>`}${o.fixedPosition?`<span class="pile-guide" aria-hidden="true"></span><span class="pile-label" aria-hidden="true">${escape(o.name)}</span>`:`<span class="deck-caption">${escape(o.name)}</span>`}`;
      else if(o.type==='deal')node.innerHTML=`<div class="deal-placeholder"><span>↗</span><strong>${escape(o.name)}</strong><small>${o.count} 张 · ${escape(state.objects.find(d=>d.type==='deck'&&d.setupKey===o.sourceKey)?.name||'选择来源牌堆')}</small><em>${o.layout==='deck'?'开局生成牌堆':'开局展开单牌'}</em></div>`;
      else node.innerHTML=`<img class="board-image" src="${escape(texture(o.assetId))}" draggable="false" alt="${escape(objectName(o))}">`;
      node.dataset.signature=signature;
    }
    const {w,h}=dimensions(state,o);
    node.className=`table-object ${o.type} ${o.type==='deal'&&o.layout==='deck'?'deck generated-pile':''} ${o.fixedPosition?'fixed-position':''} ${sharedToken(o.kind)?'shared-token':''} ${o.type==='token'&&o.kind?.startsWith('ih-')?'ih-square-marker':''} ${o.faceUp===false?'face-down':''} ${selected.has(o.id)?'selected':''} ${o.locked?'locked':''} ${drag?.ids?.includes(o.id)?'dragging':''} ${rolling.has(o.id)?'rolling':''}`;
    node.style.cssText=`--x:${o.x}px;--y:${o.y}px;--angle:${o.rotation}deg;--w:${w}px;--h:${h}px;--object-color:${COLORS[o.color]||(/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231')};z-index:${objectLayer(o)};`;
    if(o.type==='die')updateDie(node,o);
    if(o.type==='card'){
      node.querySelector('.card-front').setAttribute('aria-hidden',String(o.faceUp===false));
      node.querySelector('.card-back').setAttribute('aria-hidden',String(o.faceUp!==false));
    }
    node.setAttribute('aria-label',`${objectName(o)}${o.type==='die'?'，点数 '+o.value:o.type==='token'&&Number.isFinite(o.value)?'，数值 '+o.value:''}${o.fixedPosition?'，固定牌位':''}${o.locked?'，已锁定':''}`);
    if(o.type==='deck'){const img=node.querySelector('.deck-top img');if(img)img.src=texture(o.cards.at(-1),o.faceUp);}
  }
}
function objectLayer(o){return o.type==='board'?-100+o.z/1000000:['die','token'].includes(o.type)?1000000+o.z:o.z;}
function updateDie(node,o){const face=node.querySelector('.die-face');if(face&&face.dataset.value!==String(o.value)){face.innerHTML=dieVisual(o);face.dataset.value=String(o.value);}}
function render(){
  $('#app').dataset.mode=state.mode;
  renderShortcutHints();
  syncObjects();renderSelection();renderInspector();renderLibrary();renderDrawTarget();
  const controls=$('#game-controls');controls.hidden=!game()?.toolbar;controls.innerHTML=game()?.toolbar?.(state)||'';
  if($('#modal').open&&$('#modal').dataset.kind==='game')renderGameDialog();
  if($('#modal').open&&$('#modal').dataset.kind==='deck-search')renderDeckSearch();
  $('#table-settings-content').innerHTML=settingsHTML();
  renderDrawers();
  viewport.dataset.theme=state.settings.theme;$('#grid').classList.toggle('visible',state.settings.grid);$('#grid-button').classList.toggle('active',state.settings.grid);$('#sound-button').classList.toggle('active',state.settings.sound);
  const grid=game()?.grid||{size:40,x:0,y:0};$('#grid').style.backgroundSize=`${grid.size}px ${grid.size}px`;$('#grid').style.backgroundPosition=`${grid.x}px ${grid.y}px`;
  $('#table-mode-label').textContent=state.mode==='edit'?'编辑桌面 · 构建你的游戏':'自由操作桌面';$('#table-item-count').textContent=`${state.objects.length} 件物件`;
  $('.project-name>span:nth-child(2)').textContent=state.name;
  const profile=state.setupProfiles?.find(p=>p.id===state.activeSetupProfileId);$('#active-profile-name').textContent=profile?.name||'';$('#active-profile-name').hidden=!profile;
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
  for(const name of ['assets','settings']){const el=$(`#${name}-drawer`),open=state.mode==='edit'&&activeDrawer===name&&(name!=='assets'||innerWidth>=900||!primary());el.classList.toggle('open',open);el.inert=!open;el.setAttribute('aria-hidden',String(!open));const trigger=$(`[data-drawer="${name}"]`);trigger.classList.toggle('active',open);trigger.setAttribute('aria-expanded',String(open));}
  const panel=$('#object-drawer'),open=state.mode==='edit'&&!!primary()&&activeDrawer!=='settings';panel.classList.toggle('open',open);panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
}
function setDrawer(name){if(name&&innerWidth<900){selected.clear();renderSelection();renderInspector();}const previous=activeDrawer;activeDrawer=state.mode==='edit'?name:null;renderDrawers();if(previous&&!activeDrawer&&state.mode==='edit')$(`[data-drawer="${previous}"]`)?.focus({preventScroll:true});}
function setMode(mode){cancelDrawTarget();if(mode===state.mode)return;if(mode==='play'&&state.setupProfiles?.length>1){chooseOpening();return;}let next;try{next=mode==='play'?startOpening(state):openEditor(state);}catch(error){notify(error.message);return;}checkpoint();state=next;selected.clear();activeDrawer=mode==='edit'?'assets':null;$('#mode-toggle').classList.remove('revealed');render();fit();save();}
function revealEditor(){clearTimeout(modeRevealTimer);for(const el of [$('#mode-toggle'),$('#play-plaza')])el.classList.add('revealed');modeRevealTimer=setTimeout(()=>{for(const el of [$('#mode-toggle'),$('#play-plaza')])el.classList.remove('revealed');},3500);}
function renderSelection(){
  for(const [id,node]of objectNodes){node.classList.toggle('selected',selected.has(id));node.classList.toggle('pile-selected',selected.has(id)&&currentDeckScope()==='pile');}
  renderDeckDrawTools();
  renderDrawers();
}
function renderDeckDrawTools(){
  const tools=$('#deck-draw-tools'),deck=primary();
  if(deck?.id!==deckScopeId){deckScope='top';deckScopeId=deck?.type==='deck'?deck.id:null;}
  tools.hidden=!!drag||spaceDown||selected.size!==1||deck?.type!=='deck'||deck.locked;
  if(tools.hidden)return;
  const {w,h}=dimensions(state,deck),angle=deck.rotation*Math.PI/180;
  const halfHeight=(Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*h)*zoom/2;
  const x=pan.x+deck.x*zoom,y=pan.y+deck.y*zoom,r=viewport.getBoundingClientRect();
  if(x+w*zoom/2<0||x-w*zoom/2>r.width||y+halfHeight<0||y-halfHeight>r.height){tools.hidden=true;return;}
  tools.style.left=`${Math.max(150,Math.min(r.width-150,x))}px`;
  tools.style.top=`${Math.max(8,Math.min(r.height-52,y-halfHeight-96))}px`;
  tools.dataset.scope=currentDeckScope();tools.setAttribute('aria-label',currentDeckScope()==='pile'?'整堆操作':'顶牌操作');
  const html=deckControlsHTML(deck,currentDeckScope(),shortcuts);if(tools.innerHTML!==html)tools.innerHTML=html;
}
const dieButton=d=>`<button class="public-asset" data-add-die="${escape(d.id)}"><span class="public-art dice-sample" style="--swatch:${COLORS[d.color]}">${d.skin?dieVisual({...d,value:5}):pips(5)}</span><strong>${escape(d.name)}</strong><small>六面骰 · 可投掷</small></button>`;
const tokenButton=t=>`<button class="public-asset" data-add-token="${escape(t.kind)}"><span class="public-art token-sample ${t.image?'shared-sample':''}" style="background:${t.color}">${tokenSVG(t.kind)}</span><strong>${escape(t.name)}</strong><small>${escape(t.description)}</small></button>`;
const section=(title,items)=>`<h3 class="public-section-title">${title}</h3><div class="public-grid">${items}</div>`;
let publicFilter='all',gameTab='cards';
function renderPublicLibrary(el){
  const dice=commonDiceTemplates(),tokens=commonTokenTemplates();
  $('#asset-total').textContent='公共组件';
  el.innerHTML=`<div class="public-intro"><strong>公共素材</strong><p>每个游戏都能使用。点击即可放到桌面。</p></div><div class="public-filters" aria-label="公共素材分类">${[['all','全部'],['slots','牌位'],['dice','骰子'],['tokens','标记']].map(([id,label])=>`<button data-public-filter="${id}" aria-pressed="${id===publicFilter}">${label}</button>`).join('')}</div>`;
  if(['all','slots'].includes(publicFilter))el.innerHTML+=section('牌位',`<button class="public-asset slot-asset" data-action="add-fixed-pile"><span class="slot-sample">＋</span><strong>固定牌位</strong><small>自动吸附 · 默认容纳 1 张</small></button>`);
  if(['all','dice'].includes(publicFilter))el.innerHTML+=section('通用骰子',dice.map(dieButton).join(''));
  if(['all','tokens'].includes(publicFilter))el.innerHTML+=section('通用标记',tokens.map(tokenButton).join(''));
  el.innerHTML+='<p class="public-credit">图像：<a href="https://kenney.nl/assets/boardgame-pack" target="_blank" rel="noopener noreferrer">Kenney</a> · CC0 免费商用<br>牌位与圆形标记由工坊提供</p>';
}
function renderLibrary(){
  const el=$('#asset-library'),isPublic=tab==='public';
  if(!isPublic)gameTab=tab;
  $('.asset-tabs').hidden=isPublic;
  $('#assets-drawer [data-action="import-assets"]').hidden=isPublic;
  $$('.library-sources button').forEach(b=>{const active=b.dataset.tab==='public'?isPublic:!isPublic;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  $$('.asset-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
  if(tab==='cards'){
    const assets=state.assets.filter(a=>a.type==='card');$('#asset-total').textContent=`${assets.length} 张卡牌`;
    el.innerHTML=`<div class="collection-title"><span class="collection-cover">✳</span><div><strong>${escape(state.name)}</strong><small>当前项目的卡牌资产</small></div></div><p class="library-hint">点击卡牌，添加到桌面 <span>＋</span></p><div class="card-grid">${assets.length?'':'<p class="subtle-note">还没有卡牌。导入图片，开始制作你的游戏。</p>'}${assets.map(a=>`<button class="asset-card" data-add-asset="${escape(a.id)}" title="添加 ${escape(a.name)}"><img src="${escape(a.front)}" alt="${escape(a.name)}" loading="lazy" draggable="false"><span>${a.number?String(a.number).padStart(2,'0'):escape(a.name.slice(0,6))}<i>＋</i></span></button>`).join('')}</div>`;
  }else if(tab==='dice'){
    const dice=game()?.dice||[];$('#asset-total').textContent=`${dice.length} 种骰子`;
    el.innerHTML='<div class="asset-intro"><h3>游戏专用骰子</h3><p>仅显示当前游戏配置的骰子。</p></div>'+ (dice.length?section('骰子',dice.map(dieButton).join('')):'<p class="subtle-note">这个游戏还没有专用骰子。通用骰子可在「公共素材」中添加。</p>');
  }else if(tab==='tokens'){
    const tokens=game()?.tokens||[],custom=state.assets.filter(a=>a.type==='token'&&!tokens.some(t=>t.assetId===a.id));$('#asset-total').textContent=`${tokens.length+custom.length} 种标记`;
    el.innerHTML='<div class="asset-intro"><h3>游戏专用标记</h3><p>当前游戏的专用标记与导入图片。</p></div>'+(tokens.length?section('专用标记',tokens.map(tokenButton).join('')):'')+(custom.length?section('导入标记',custom.map(a=>`<button class="public-asset" data-add-asset="${escape(a.id)}"><span class="public-art"><img src="${escape(a.front)}" alt="" loading="lazy"></span><strong>${escape(a.name)}</strong></button>`).join('')):'');
    if(!tokens.length&&!custom.length)el.innerHTML+='<p class="subtle-note">还没有游戏标记。可导入图片，或到「公共素材」添加通用标记。</p>';
  }else if(tab==='public'){
    renderPublicLibrary(el);
  }else{
    const assets=state.assets.filter(a=>a.type==='board');$('#asset-total').textContent=`${assets.length} 张版图`;el.innerHTML=`<div class="asset-intro"><h3>铺开一个新世界。</h3><p>导入 PNG、JPG 或 WebP 作为版图。<br>版图支持缩放、旋转与锁定。</p></div>${assets.map(a=>`<button class="board-asset" data-add-asset="${escape(a.id)}"><img src="${escape(a.front)}" alt="${escape(a.name)}"><strong>${escape(a.name)}</strong><span>＋</span></button>`).join('')}<button class="board-placeholder" data-action="import-board"><span>⊞</span>导入你的第一张版图</button>`;
  }
}
function openingHTML(o){return sizeSettingsHTML(state,o)+pileSettingsHTML(state,o)+drawTargetHTML(state,o)+openingPropertiesHTML(state,o);}
function updateDeal(input){
  try{
    const current=primary();if(current?.type!=='deal')return;
    const draft=structuredClone(state),slot=draft.objects.find(o=>o.id===current.id),key=input.dataset.deal;
    if(key==='face'){if(!['up','down','random'].includes(input.value))return;slot.setupFace=input.value==='random'?'random':'fixed';slot.faceUp=input.value!=='down';}
    else if(key==='name'){if(!input.value.trim()||input.value.length>100)throw new Error('请填写牌位名称');slot.name=input.value.trim();}
    else if(['count','spacing','order'].includes(key)){const value=Number(input.value);if(!Number.isFinite(value)||(key==='spacing'?value<0||value>2000:!Number.isInteger(value)||value<1||value>(key==='order'?1000:500)))throw new Error('请输入有效的数量、顺序或间距');slot[key]=value;}
    else if(key==='layout'){if(!['spread','deck'].includes(input.value))return;slot.layout=input.value;if(slot.layout!=='deck'){delete slot.drawTarget;delete slot.drawKey;delete slot.fixedPosition;delete slot.snapCards;delete slot.maxCards;}}
    else if(key==='sourceKey')slot.sourceKey=input.value;else return;
    validateDeals(draft.objects);validateSession(draft);mutate(()=>state=draft);
  }catch(error){notify(error.message);renderInspector();}
}
function manageProfiles(){
  const draft=saveEditorDraft(state),active=draft.setupProfiles?.find(p=>p.id===draft.activeSetupProfileId),profiles=draft.setupProfiles||[];
  const covers=draft.assets.filter(a=>a.type==='card');
  openModal(`<h2>角色开局方案</h2><p class="modal-lead">这里的名称、封面和说明会直接显示在游玩的开局选项中。点击卡片编辑对应桌面，修改会自动保存。</p>${openingChoicesHTML(draft,{editing:true})||''}${active?`<label class="create-project-label">当前方案<select id="profile-select">${profiles.map(p=>`<option value="${escape(p.id)}" ${p.id===active.id?'selected':''}>${escape(p.name)}</option>`).join('')}</select></label>`:''}<label class="create-project-label">方案名称<input id="profile-name" maxlength="100" placeholder="例如：战士、法师" value="${escape(active?.name||'')}"></label>${active?`<label class="create-project-label">开局封面<select id="profile-cover"><option value="auto" ${active.coverAssetId===undefined?'selected':''}>跟随桌面角色卡</option><option value="" ${active.coverAssetId===''?'selected':''}>不显示封面</option>${covers.map(a=>`<option value="${escape(a.id)}" ${a.id===active.coverAssetId?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><label class="create-project-label">开局说明<textarea id="profile-description" maxlength="300" rows="2" placeholder="例如：适合初次冒险的近战角色">${escape(active.description||'')}</textarea></label><button class="primary-button" data-action="save-profile-options">保存开局选项</button><button class="full-width quiet" data-action="preview-opening">预览游玩开局</button>`:''}<button class="full-width quiet" data-action="add-profile">复制当前摆放为新方案</button>${profiles.length>1?'<button class="danger-button" data-action="remove-profile">移除当前方案</button>':''}`,profiles.some(p=>p.setup.objects.some(o=>o.ihRole==='hero'))||profiles.some(p=>p.coverAssetId));
}
function editProfile(id){
  try{const draft=switchSetupProfile(state,id);$('#modal').close();mutate(()=>{state=draft;selected.clear();});fit();notify(`正在编辑：${state.setupProfiles.find(p=>p.id===id).name}`);}catch(error){notify(error.message);}
}
function chooseOpening(){
  openModal(`<h2>选择角色开局</h2><p class="modal-lead">加载所选方案，再独立洗牌、发初始牌。当前进度可撤销恢复。</p>${openingChoicesHTML(saveEditorDraft(state))}`,state.gameId==='iron-helm');
  $('#modal').dataset.kind='opening-choice';
}
function beginOpening(id){
  try{const next=startOpening(state,id);$('#modal').close();activeDrawer=null;mutate(()=>{state=next;selected.clear();},{audio:'shuffle'});fit();}catch(error){notify(error.message);}
}
function updateOpening(input){
  const key=input.dataset.opening,items=selection().filter(o=>key==='setupOrder'?o.type==='deck':key==='value'?o.type==='token':key==='faceUp'?['card','deck','token'].includes(o.type):['card','deck','token','die'].includes(o.type));
  const value=key==='setupHideEmpty'?input.checked:key==='faceUp'?input.value==='true':key==='value'?Number(input.value):input.value;
  if(!items.length||key==='value'&&(!Number.isFinite(value)||value< -999||value>999))return;
  if(['setupOrder','setupFace'].includes(key)&&!(key==='setupOrder'?['fixed','shuffle']:['fixed','random']).includes(value))return;
  mutate(()=>items.forEach(o=>{if(key==='value'&&game()?.adjustToken&&Number.isFinite(o.value))game().adjustToken(state,o,value-o.value);else if(key==='faceUp'&&o.type==='deck')setDeckFace(o,value);else o[key]=value;}));
}
function moveDeckCard(index,step){const deck=primary();if(deck?.type!=='deck'||![1,-1].includes(step)||!Number.isInteger(index)||index<0||index>=deck.cards.length||index+step<0||index+step>=deck.cards.length)return;mutate(()=>{const entries=deckEntries(deck);[entries[index],entries[index+step]]=[entries[index+step],entries[index]];replaceDeckEntries(deck,entries);});}
function renderInspector(){
  const el=$('#inspector-content'),o=primary(),items=selection(),orderOpen=el.querySelector('.opening-properties details')?.open,orderScroll=el.querySelector('.deck-order')?.scrollTop||0;
  if(!o){el.innerHTML='';return;}else{
    const a=assetFor(state,o.assetId);
    el.innerHTML=`<div class="selected-heading"><span class="tiny-label">${items.length>1?`已选择 ${items.length} 个物件`:'当前选中'}</span><h2>${escape(objectName(o))}</h2><span class="object-type">${({card:'双面卡牌',deck:o.maxCards===1?'固定牌位':`牌堆 · ${o.cards?.length || 0} 张`,die:'六面骰 · 单面显示',token:'桌面标记',board:'自定义版图',deal:'开局发牌位置'})[o.type]}</span></div>`+openingHTML(o)+
    (o.type==='card'?`<button class="inspector-card" data-action="inspect">${cardFace(texture(o.assetId,o.faceUp),!o.faceUp)}</button><div class="two-buttons"><button data-action="flip">⤾ 翻面 <kbd>F</kbd></button><button data-action="rotate">↻ 旋转 <kbd>R</kbd></button></div>`:o.type==='deck'?`<div class="deck-preview">${o.cards.length?cardFace(texture(o.cards.at(-1),o.faceUp)):fallbackBack()}${o.maxCards===1?'':`<b>${o.cards.length}</b>`}</div><button class="primary-button" data-action="draw" ${!o.cards.length?'disabled':''}>发到指定位置 ↗</button><div class="two-buttons"><button data-action="shuffle">⤨ 洗牌</button><button data-action="spread">▱ 展开全部</button></div><p class="subtle-note">${state.mode==='edit'?'点击选择牌堆，直接拖动整叠来安排开局。':o.fixedPosition?'固定牌位：默认拖动取顶牌，整堆操作时牌位仍保持固定。':'默认拖动顶牌；按 Q 切换整堆后拖动整叠。'}默认操作顶牌，按 Q 切换整堆；整堆模式 D 发牌、S 搜寻、R 洗牌。Shift 多选卡牌后按 G 可合堆。</p>`:o.type==='die'?`<div class="die-preview" style="--swatch:${COLORS[o.color]}"><span>${dieVisual(o)}</span><small>${escape(o.name||COLOR_NAMES[o.color])} · D6</small></div><button class="primary-button" data-action="roll">⚄ 掷出这一颗 <kbd>D</kbd></button><div class="inspector-section"><h3>手动调整骰面</h3><div class="face-picker">${o.faces.map(v=>`<button data-die-value="${v}" class="${v===o.value?'active':''}">${v}</button>`).join('')}</div><p class="subtle-note">选中后按数字键切换骰面，<kbd>0</kbd> 对应 10 点。<br>开局时可保留当前骰面，或随机投掷。</p></div>`:o.type==='token'?`<div class="token-preview" style="background:${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}">${tokenFace(o)}</div><p class="subtle-note">${escape(tokenTemplates().find(t=>t.kind===o.kind)?.description||'自由拖动、复制和摆放，记录你的游戏状态。')}</p>`:o.type==='deal'?'<p class="subtle-note">这是发牌位置，开始游玩后才会生成实际卡牌。可以直接拖动、旋转和复制。</p>':`<img class="board-preview" src="${escape(a?.front)}" alt="版图预览">`)+
    `<div class="inspector-section"><div class="section-title"><h3>物件属性</h3><button data-action="lock" class="text-button">${o.locked?'⌑ 已锁定':'⌑ 锁定'}</button></div><div class="property-row"><label>角度 <input type="number" data-property="rotation" value="${Math.round(o.rotation)}" step="15" min="-360" max="360" ${!isMovable(o)?'disabled':''}></label><span>°</span></div><div class="two-buttons"><button data-action="rotate-left">↶ −15°</button><button data-action="rotate-small">↻ +15°</button></div>${o.type==='token'&&!sharedToken(o.kind)&&state.mode==='edit'?`<div class="property-row"><label>标记颜色 <input type="color" data-property="color" value="${/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#b86231'}"></label></div>`:''}<div class="two-buttons"><button data-action="duplicate">⧉ 复制</button><button data-action="bring-front">↑ 置顶</button></div>${(o.type==='card'||o.type==='token'&&o.kind==='custom')&&state.mode==='edit'?'<button class="full-width quiet" data-action="change-back">更换背面图片 ↗</button>':''}<button class="danger-button" data-action="delete">移除选中物件</button></div>`;
  }
  if(orderOpen&&el.querySelector('.opening-properties details')){el.querySelector('.opening-properties details').open=true;el.querySelector('.deck-order').scrollTop=orderScroll;}
  if($('#modal').open&&$('#modal').dataset.kind==='properties')$('#modal-content').innerHTML=el.innerHTML;
}
function settingsHTML(){return `<div class="project-fields"><h3>项目资料</h3><label>游戏名称<input data-meta="name" maxlength="100" value="${escape(state.name)}"></label><label>一句话介绍<textarea data-meta="description" maxlength="1000" rows="2">${escape(state.meta?.description)}</textarea></label><div class="project-field-pair"><label>人数<input data-meta="players" maxlength="100" placeholder="例如 2–4 人" value="${escape(state.meta?.players)}"></label><label>时长<input data-meta="duration" maxlength="100" placeholder="例如 20 分钟" value="${escape(state.meta?.duration)}"></label></div><label>规则说明<textarea data-meta="rules" maxlength="20000" rows="4" placeholder="写下你的游戏玩法…">${escape(state.meta?.rules)}</textarea></label><button class="full-width quiet" data-action="plaza">返回作品广场</button></div><div class="inspector-section table-settings"><h3>桌布与交互</h3><label class="toggle-row"><span>操作音效</span><input type="checkbox" data-setting="sound" ${state.settings.sound?'checked':''}><i></i></label><label class="toggle-row"><span>显示网格</span><input type="checkbox" data-setting="grid" ${state.settings.grid?'checked':''}><i></i></label><label class="toggle-row"><span>${escape(game()?.snapLabel||'网格吸附')}</span><input type="checkbox" data-setting="snap" ${state.settings.snap?'checked':''}><i></i></label><label class="range-row"><span>摆放自然错位 <b>${state.settings.scatter}°</b></span><input type="range" min="0" max="12" value="${state.settings.scatter}" data-setting="scatter"></label><div class="theme-picker">${[['forest','苔绿'],['linen','亚麻'],['night','深夜']].map(([v,n])=>`<button data-theme="${v}" class="${state.settings.theme===v?'active':''}" title="${n}"><i class="${v}"></i>${n}</button>`).join('')}</div></div>`;}
function transformScene(){scene.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;renderDeckDrawTools();}
function fitObjects(items){const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;if(!items.length){zoom=1;pan={x:r.width/2-720,y:r.height/2-500};transformScene();return;}const bounds=items.map(o=>{const {w,h}=dimensions(state,o);const a=o.rotation*Math.PI/180,hw=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*h)/2,hh=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*h)/2;return {left:o.x-hw,right:o.x+hw,top:o.y-hh,bottom:o.y+hh};});const left=Math.min(...bounds.map(b=>b.left)),right=Math.max(...bounds.map(b=>b.right)),top=Math.min(...bounds.map(b=>b.top)),bottom=Math.max(...bounds.map(b=>b.bottom));zoom=Math.max(.2,Math.min(1.2,(r.width-100)/(right-left),(r.height-140)/(bottom-top)));pan={x:r.width/2-(left+right)/2*zoom,y:r.height/2-(top+bottom)/2*zoom};transformScene();}
function fit(){fitObjects(state.objects);}
function resetView(){fitObjects((state.setup||state.initialSetup)?.objects||state.objects);}
function snapObject(o){if(o.type==='token'&&game()?.onTokenDrop){game().onTokenDrop(state,o);return;}if(!state.settings.snap)return;if(game()?.onDrop){game().onDrop(state,o);return;}o.x=Math.round(o.x/40)*40;o.y=Math.round(o.y/40)*40;}

function toWorld(clientX,clientY){const r=viewport.getBoundingClientRect();return {x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};}
function zoomAt(factor,cx,cy){const r=viewport.getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2;const next=Math.min(2,Math.max(.2,zoom*factor));pan.x=x-(x-pan.x)*next/zoom;pan.y=y-(y-pan.y)*next/zoom;zoom=next;transformScene();}
function viewportCenter(){const r=viewport.getBoundingClientRect();return toWorld(r.left+r.width/2,r.top+r.height/2);}
function addAsset(id){const a=assetFor(state,id);if(!a)return;mutate(()=>{const p=viewportCenter();const o={...baseObject(a.type,p.x+(Math.random()-.5)*70,p.y+(Math.random()-.5)*70,nextZ(state)),assetId:a.id,faceUp:true,rotation:(Math.random()-.5)*state.settings.scatter*2};if(a.type==='board'){o.width=a.width;o.height=a.height;o.z=0;}if(a.type==='token'){o.kind='custom';o.name=a.name;o.color='#c79e62';}state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}
function addDie(id){const template=diceTemplates().find(d=>d.id===id);if(!template)return;mutate(()=>{const p=viewportCenter(),{color,faces,name}=template;const o={...baseObject('die',p.x,p.y,nextZ(state)),name,color,value:faces[0],faces:[...faces],...(template.skin?{skin:template.skin}:{})};state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}
function addToken(kind){const template=tokenTemplates().find(t=>t.kind===kind);if(!template)return;mutate(()=>{const p=viewportCenter();const {name,color,value,width,height,assetId}=template;const o={...baseObject('token',p.x,p.y,nextZ(state)),kind,name,color,...(value!==undefined?{value,width,height,assetId}:{})};state.objects.push(o);selected=new Set([o.id]);},{audio:()=>playObjects(selection())});}

function setDiceValue(value){const dice=selection().filter(o=>o.type==='die'&&!o.locked&&!rolling.has(o.id)&&o.faces.includes(value)&&o.value!==value);if(dice.length)mutate(()=>dice.forEach(o=>o.value=value),{audio:'die-drop'});}
function isMovable(o){return canMoveObject(o,state.mode);}
function flip(){const cards=selection().filter(o=>['card','deck','token','deal'].includes(o.type)&&!o.locked);if(!cards.length)return;mutate(()=>cards.forEach(o=>{if(o.type==='deck'){if(currentDeckScope()==='top')flipTopCard(o);else flipDeck(o);}else o.faceUp=o.faceUp===false;}),{audio:'flip'});}
function rotate(amount=90){const deck=primary();if(state.mode==='play'&&selected.size===1&&deck?.type==='deck'&&currentDeckScope()==='top'){if(deck.locked||!deck.cards.length)return;mutate(()=>{const card=drawFromDeck(state,deck,undefined,deck);card.rotation+=amount;selected=new Set([card.id]);},{audio:'card-drop'});return;}const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>items.forEach(o=>{o.rotation=Math.round((o.rotation+amount)*10)/10;if(amount%90===0&&game()?.onDrop&&o.type==='card')snapObject(o);}),{audio:()=>playObjects(items)});}
function draw(faceUp,deck=primary(),index=deck?.cards.length-1){
  if(deck?.type!=='deck'||!deck.cards.length||deck.locked)return;
  let destination;try{destination=drawDestination(state,deck.drawTarget?deck:{...deck,drawTarget:{mode:'right',gap:30}});}catch(error){notify(error.message);return;}
  const reserved=state.objects.filter(o=>o.type==='deal'&&o.sourceKey===deck.setupKey).reduce((n,o)=>n+o.count,0);
  if(state.mode==='edit'&&deck.cards.length<=reserved){notify('这些牌已分配给初始牌位，请先减少发牌数量');return;}
  const keepPile=currentDeckScope()==='pile';
  mutate(()=>{const card=drawDeckCard(state,deck,index,faceUp,destination);if(card)selected=new Set([keepPile?deck.id:card.id]);},{audio:'draw'});
}
function renderDeckSearch(){const deck=state.objects.find(o=>o.id===$('#modal').dataset.deckId&&o.type==='deck');$('#modal-content').innerHTML=deck?deckSearchHTML(state,deck):'<h2>牌堆已移除</h2>';}
function searchDeck(){const deck=primary();if(deck?.type!=='deck'||deck.locked)return;openModal(deckSearchHTML(state,deck));$('#modal').dataset.kind='deck-search';$('#modal').dataset.deckId=deck.id;}
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
function shuffle(){const deck=primary();if(deck?.type!=='deck'||deck.locked||deck.cards.length<2)return;mutate(()=>shuffleDeck(deck),{audio:'shuffle'});const node=objectNodes.get(deck.id);node?.animate([{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`},{transform:`translate(-35%,-50%) rotate(${deck.rotation+8}deg)`,offset:.3},{transform:`translate(-65%,-50%) rotate(${deck.rotation-8}deg)`,offset:.65},{transform:`translate(-50%,-50%) rotate(${deck.rotation}deg)`}],{duration:450});notify('牌堆已洗匀');}
function stack(){const eligible=selection().filter(o=>['card','deck'].includes(o.type)&&!o.locked);if(eligible.length<2){notify('按住 Shift 选择至少两张卡牌或牌堆，再合并');return;}mutate(()=>{const deck=mergeCards(state,[...selected]);if(deck)selected=new Set([deck.id]);},{audio:'card-drop'});}
function spread(){const deck=primary();if(deck?.type!=='deck'||deck.locked||!deck.cards.length)return;if(state.objects.some(o=>o.type==='deal'&&o.sourceKey===deck.setupKey)){notify('这个牌堆关联了初始牌位，请先移除这些牌位再展开');return;}mutate(()=>{const ids=[];deckEntries(deck).forEach(({assetId,faceUp},i)=>{const o={...baseObject('card',deck.x+(i%5)*185,deck.y+Math.floor(i/5)*265,nextZ(state)+i),assetId,faceUp,rotation:(Math.random()-.5)*state.settings.scatter*2};state.objects.push(o);ids.push(o.id);});if(deck.fixedPosition)replaceDeckEntries(deck,[]);else state.objects=state.objects.filter(o=>o.id!==deck.id);selected=new Set(ids);},{audio:'spread'});}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify(state));state=JSON.parse(from.pop());setAudioEnabled(state.settings.sound);selected.clear();rolling.clear();render();save();notify(redo?'已重做':'已撤销');}
function remove(){const deck=primary();if(state.mode==='play'&&selected.size===1&&deck?.type==='deck'&&currentDeckScope()==='top'){if(deck.locked||!deck.cards.length)return;mutate(()=>takeDeckCard(deck),{audio:'card-pickup'});return;}const items=selection().filter(isMovable);if(!items.length)return;mutate(()=>{const ids=new Set(items.map(o=>o.id)),keys=new Set(items.filter(o=>o.type==='deck').map(o=>o.setupKey).filter(Boolean));state.objects=state.objects.filter(o=>!ids.has(o.id)&&!(o.type==='deal'&&keys.has(o.sourceKey)));selected.clear();},{audio:()=>playObjects(items,'pickup')});}
function duplicate(){
  const deck=primary();if(state.mode==='play'&&selected.size===1&&deck?.type==='deck'&&currentDeckScope()==='top'){if(deck.locked||!deck.cards.length)return;const entry=deckEntries(deck).at(-1),{w,h}=dimensions(state,deck);mutate(()=>{const card={...baseObject('card',deck.x+45,deck.y+45,nextZ(state)),...entry,width:w,height:h,rotation:deck.rotation};state.objects.push(card);selected=new Set([card.id]);},{audio:'card-drop'});return;}
  const items=selection().filter(o=>state.mode==='edit'||!o.fixedPosition);if(!items.length)return;
  const keys=new Map(items.filter(o=>o.type==='deck'&&o.setupKey).map(o=>[o.setupKey,uid()]));
  const drawKeys=new Map(items.filter(o=>o.drawKey).map(o=>[o.drawKey,uid()]));
  const added=items.map((o,i)=>({...structuredClone(o),id:uid(),x:o.x+45,y:o.y+45,z:nextZ(state)+i,locked:false,...(o.setupKey?{setupKey:keys.get(o.setupKey)}:{}),...(o.type==='deal'?{sourceKey:keys.get(o.sourceKey)||o.sourceKey}:{})}));
  for(const o of added){if(o.drawKey)o.drawKey=drawKeys.get(o.drawKey);if(o.drawTarget?.mode==='deck')o.drawTarget.deckKey=drawKeys.get(o.drawTarget.deckKey)||o.drawTarget.deckKey;}
  try{validateDeals([...state.objects,...added]);}catch(error){notify(error.message);return;}
  mutate(()=>{state.objects.push(...added);selected=new Set(added.map(o=>o.id));},{audio:()=>playObjects(items)});
}
function openModal(html,wide=false){$('#modal').dataset.kind='';$('#modal-content').innerHTML=html;$('#modal').classList.toggle('wide',wide);if(!$('#modal').open)$('#modal').showModal();}
function rules(){const rules=game()?.rules;openModal(`<span class="section-eyebrow">HOW TO PLAY</span><h2>${escape(rules?.title||state.name)}</h2>${rules?`<p class="modal-lead">${escape(rules.credit)}</p><ol class="rule-steps">${rules.steps.map(([title,text])=>`<li><strong>${escape(title)}</strong><p>${escape(text)}</p></li>`).join('')}</ol><a class="primary-button" href="${rules.pdf}" target="_blank" rel="noopener">打开完整规则 ↗</a>${(rules.links||[]).map(([label,url])=>`<a class="primary-button" href="${escape(url)}" target="_blank" rel="noopener">${escape(label)} ↗</a>`).join('')}`:''}<div class="project-rules-text">${escape(state.meta?.rules||(!rules?'还没有规则说明，可在编辑模式的「桌面」中填写。':''))}</div>${game()?.score?`<p class="subtle-note">参考得分：${game().score(state).total}</p>`:''}<p class="subtle-note">工坊提供自由操作桌面，游戏规则由玩家执行。</p>`);}

function renderGameDialog(){
  const view=$('#modal').dataset.gameView||'journal';
  $('#modal-content').innerHTML=game()?.[view]?.(state)||'';
}
function gameAction(action,value){
  if(action==='choose-hero'&&state.setupProfiles?.some(p=>p.id===`ih-hero-${value}`)){beginOpening(`ih-hero-${value}`);return;}
  if(action==='heroes'&&state.setupProfiles?.length){chooseOpening();return;}
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

function renderShortcutHints(){
  const mode=$('#mode-toggle');mode.querySelector('kbd').textContent=shortcuts.mode;
  mode.title='编辑桌面 · '+shortcuts.mode;mode.setAttribute('aria-label',mode.title);
  $('.play-button').title='进入游玩模式 · '+shortcuts.mode;
  for(const [action,id] of [['undo','undo'],['redo','redo'],['save-draft','save'],['fit','fit']]){
    $$('[data-action="'+action+'"]').forEach(b=>{b.title=shortcutDefinitions.find(d=>d.id===id).label+' · '+shortcuts[id];const k=b.querySelector('kbd');if(k)k.textContent=shortcuts[id];});
  }
  $('#play-help').title='查看和设置快捷键 · '+shortcuts.help;
}
function help(){
  openModal(`<span class="section-eyebrow">A LITTLE GUIDE</span><h2>操作与快捷键</h2><p class="modal-lead">点击快捷键后按下新组合，立即保存。所有游戏共用此设置。</p><p id="shortcut-feedback" role="status" aria-live="polite"></p><div class="shortcut-settings">${shortcutDefinitions.map(d=>`<label><span>${d.label}</span><input data-shortcut="${d.id}" aria-label="${d.label}快捷键" value="${escape(shortcuts[d.id])}" readonly autocomplete="off" spellcheck="false"></label>`).join('')}</div><button class="full-width quiet" data-action="reset-shortcuts">恢复默认快捷键</button><h3>鼠标与基础操作</h3><div class="shortcut-list">${[
    ['Esc','关闭弹窗 / 取消选择；游玩时显示编辑入口'],['拖动物件','拿起、移动、松手摆放'],['空白处左键拖动','框选多个部件'],['Shift + 点击 / 框选','追加选择多个物件'],['空格 + 拖动 / 中键拖动','平移桌面'],['卡牌上轻点中键','顺时针旋转 90°'],['Ctrl + 滚轮','缩放桌面'],['数值标记上滚轮','调整数值，遵守游戏范围'],['双击卡牌 / 牌堆 / 骰子','卡牌翻面 / 只翻顶牌 / 投掷'],['选中骰子 + 数字键','切换骰面；0 = 10 点，优先于适应桌面'],['游玩时点击 / 拖动牌堆','默认选择 / 拖走顶牌；按 Q 切换整堆后拖动整叠'],['编辑时拖动牌堆','移动整叠'],['拖到牌堆中央','自动加入牌堆，无需按 Alt'],['拖到单张卡牌中央','吸附对齐；按 Alt 合并为牌堆'],['右键物件','查看卡牌详情或物件属性']
  ].map(([k,v])=>`<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div><p class="subtle-note">快捷键保存在当前浏览器，Ctrl 组合也支持 Command 键。Tab 切换输入框，Esc 关闭窗口。</p>`);
}
function storeShortcuts(next){
  try{localStorage.setItem(SHORTCUT_STORAGE,JSON.stringify(next));shortcuts=next;renderShortcutHints();return true;}
  catch{$('#shortcut-feedback').textContent='保存失败，请检查浏览器存储空间后重试';return false;}
}

function inspect(){const o=primary();if(!o)return;if(o.type==='card'||o.type==='deck'&&o.cards.length)openModal(`<span class="section-eyebrow">${escape(objectName(o))}</span><h2>${o.faceUp?'卡牌正面':'卡牌背面'}</h2><div class="large-card" style="aspect-ratio:${dimensions(state,o).w}/${dimensions(state,o).h}">${cardFace(texture(o.type==='deck'?o.cards.at(-1):o.assetId,o.faceUp),!o.faceUp)}</div><button class="primary-button" data-action="inspect-flip">⤾ 查看另一面</button>${state.mode==='edit'?'<button class="full-width quiet" data-action="properties">编辑卡牌属性 ↗</button>':''}`);else if(o.type==='board')openModal(`<h2>${escape(objectName(o))}</h2><img class="large-board" src="${escape(texture(o.assetId))}" alt="版图">`,true);else notify('在右侧面板中调整物件属性');}
function exportSession(){const blob=new Blob([JSON.stringify(saveEditorDraft(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`桌游工坊-${state.name.replace(/[\\/:*?"<>|]/g,'-')}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('桌面已导出，包含自定义图片和所有物件');}
function confirmNew(){if(state.setupProfiles?.length>1){chooseOpening();return;}const setup=state.setup||state.initialSetup;openModal(`<span class="section-eyebrow">A FRESH START</span><h2>从初始设置开始。</h2><p class="modal-lead">使用「${escape(setup.name)}」布置 ${setup.objects.length} 个物件。当前布局将被替换，你仍可用撤销恢复。${setup.objects.length?'':'你也可以先在编辑模式摆放并保存草稿。'}</p><button class="primary-button" data-action="confirm-new">开始新一局 ↗</button><button class="full-width quiet" data-action="download-session">下载当前进度备份</button>`);}

function properties(){if(!primary())return;if(state.mode==='edit'){setDrawer(null);return;}openModal($('#inspector-content').innerHTML);$('#modal').dataset.kind='properties';}
const actions={flip,rotate,draw,shuffle,stack,spread,roll,undo,redo:()=>undo(true),delete:remove,duplicate,rules,help,inspect,export:exportSession,'new-game':confirmNew,'confirm-new':()=>{mutate(()=>{state=startOpening(state);selected.clear();},{audio:'shuffle'});$('#modal').close();fit();},'close-modal':()=>$('#modal').close(),'inspect-flip':()=>{flip();inspect();},'rotate-left':()=>rotate(-15),'rotate-small':()=>rotate(15),'bring-front':()=>mutate(()=>selection().filter(isMovable).forEach((o,i)=>o.z=nextZ(state)+i)),'lock':()=>{const items=selection();if(items.length)mutate(()=>{const lock=!items.every(o=>o.locked);items.forEach(o=>o.locked=lock);});},'sound':()=>{mutate(()=>state.settings.sound=!state.settings.sound);if(state.settings.sound)play('drop');notify(state.settings.sound?'音效已开启':'音效已关闭');},'grid':()=>mutate(()=>state.settings.grid=!state.settings.grid),'zoom-in':()=>zoomAt(1.15),'zoom-out':()=>zoomAt(1/1.15),'fit':fit,'reset-view':resetView,'import-assets':()=>{importPurpose='new';$('#asset-input').click();},'import-board':()=>{importPurpose='board';$('#asset-input').click();},'change-back':()=>{importPurpose='back';$('#asset-input').click();},'import-session':()=>$('#session-input').click(),'confirm-import':()=>finishImport()};
actions.properties=properties;
actions['reset-shortcuts']=()=>{if(storeShortcuts(defaultShortcuts())){help();$('#shortcut-feedback').textContent='已恢复默认快捷键';}};
actions['search-deck']=searchDeck;
actions['flip-top']=()=>{const deck=primary();if(deck?.type==='deck'&&!deck.locked&&deck.cards.length)mutate(()=>flipTopCard(deck),{audio:'flip'});};
actions['draw-down']=()=>draw(false);
actions['draw-up']=()=>draw(true);
actions.plaza=()=>plaza.show('all');
actions['new-project']=()=>openModal('<span class="section-eyebrow">A TABLE OF YOUR OWN</span><h2>你的下一个游戏。</h2><p class="modal-lead">从空白项目开始，导入图片资产，摆放部件，保存到本地草稿，完成后导出到作品广场。</p><label class="create-project-label">游戏名称<input id="new-project-name" maxlength="100" placeholder="给这个灵感起个名字" value="未命名游戏"></label><button class="primary-button" data-action="confirm-create-project">创建项目 ↗</button>');
actions['confirm-create-project']=async()=>{const name=$('#new-project-name').value.trim();if(!name){notify('请填写游戏名称');return;}await plaza.create(name);};
actions['save-draft']=async()=>{await saveNow();notify('已保存到本地草稿');};
actions['download-session']=exportSession;
async function finishExport(replaceId){
  if(!pendingExport)return;
  try{await projectStore.exhibit(pendingExport,{replaceId});}
  catch(error){if(error.code==='EXHIBIT_NAME_CONFLICT'){await prepareExport();return;}throw error;}
  pendingExport=null;$('#modal').close();await plaza.show('all');notify('已导出到作品广场，同名作品只保留一份');
}
async function prepareExport(){
  if(!pendingExport)return;
  const collision=nameMatches(await projectStore.exhibits(),pendingExport.session.name)[0];
  const builtin=examples.find(g=>libraryName(g.title)===libraryName(pendingExport.session.name));
  if(!collision&&!builtin){await finishExport();return;}
  exportReplacementId=collision?.id;
  openModal(`<h2>作品广场已有同名游戏</h2><p class="modal-lead">「${escape(pendingExport.session.name)}」已存在。覆盖会更新作品广场版本，本地草稿保留。${!collision&&builtin?'内置示例将由你的版本替代显示。':''}</p><button class="primary-button" data-action="overwrite-export">覆盖作品广场版本</button><label class="create-project-label">或使用新名称<input id="export-name" maxlength="100" value="${escape(pendingExport.session.name)}"></label><button class="full-width quiet" data-action="rename-export">改名导出</button><button class="full-width quiet" data-action="cancel-export">取消导出</button>`);
}
actions.publish=async()=>{await saveNow();pendingExport=makeExhibit(state);await prepareExport();};
actions['overwrite-export']=()=>finishExport(exportReplacementId);
actions['rename-export']=async()=>{if(!pendingExport)return;const name=$('#export-name').value.trim();if(!name){notify('请填写新的游戏名称');return;}pendingExport.session.name=name;await prepareExport();};
actions['cancel-export']=()=>{pendingExport=null;$('#modal').close();};
actions['rename-conflicting-draft']=async()=>{const name=$('#draft-rename').value.trim();if(!name){notify('请填写草稿名称');return;}state.name=name;render();await saveNow();$('#modal').close();notify('已改名并保存草稿');};
actions['close-object']=()=>select(null);
actions['manage-profiles']=manageProfiles;
actions['add-fixed-pile']=()=>{const p=viewportCenter(),reference=primary();mutate(()=>{const o=createFixedPile(p.x,p.y);if(canResize(reference)){const {w,h}=dimensions(state,reference);o.width=w;o.height=h;}o.z=nextZ(state);state.objects.push(o);selected=new Set([o.id]);});};
actions['add-matching-pile']=()=>{const reference=primary();if(state.mode!=='edit'||!canResize(reference))return;const {w,h}=dimensions(state,reference);mutate(()=>{const o={...createFixedPile(Math.min(10000,reference.x+w+30),reference.y),width:w,height:h,rotation:reference.rotation,z:nextZ(state)};state.objects.push(o);selected=new Set([o.id]);});};
actions['make-fixed-pile']=()=>{const o=primary();if(state.mode!=='edit'||o?.type!=='card')return;const {w,h}=dimensions(state,o);mutate(()=>{o.width=w;o.height=h;o.cards=[o.assetId];delete o.assetId;Object.assign(o,{type:'deck',name:assetFor(state,o.cards[0])?.name||'固定牌位',fixedPosition:true,snapCards:true,maxCards:1});});};

actions['add-profile']=()=>{const next=addSetupProfile(state,$('#profile-name').value);$('#modal').close();mutate(()=>{state=next;selected.clear();});fit();notify('角色方案已创建，直接在桌面上调整装备和数值');};
actions['save-profile-options']=()=>{const next=updateSetupProfile(state,{name:$('#profile-name').value,coverAssetId:$('#profile-cover').value==='auto'?undefined:$('#profile-cover').value,description:$('#profile-description').value});mutate(()=>state=next);manageProfiles();notify('开局选项已保存，游玩时同步显示');};
actions['preview-opening']=()=>{actions['save-profile-options']();chooseOpening();};
actions['remove-profile']=()=>{const next=removeSetupProfile(state);$('#modal').close();mutate(()=>{state=next;selected.clear();});fit();notify('已移除方案，可撤销恢复');};
actions['pick-draw-target']=()=>{const o=primary();if(state.mode!=='edit'||!(o?.type==='deck'||o?.type==='deal'&&o.layout==='deck'))return;pickingDrawTarget=o.id;viewport.classList.add('picking-draw-target');setDrawer(null);notify('点击桌面指定发牌位置，Esc 取消');};
actions['clear-draw-target']=()=>{cancelDrawTarget();const o=primary();if(state.mode==='edit'&&o?.drawTarget)mutate(()=>delete o.drawTarget);};
actions['add-deal']=()=>{const draft=structuredClone(state),source=draft.objects.find(o=>o.id===primary()?.id),slot=createDealSlot(draft,source);draft.objects.push(slot);validateDeals(draft.objects);mutate(()=>{state=draft;selected=new Set([slot.id]);});notify('已添加初始牌位，拖动它安排位置并设置数量');};
actions['close-drawer']=()=>setDrawer(null);
actions['blank-table']=()=>openModal('<span class="section-eyebrow">YOUR NEXT GAME</span><h2>从一张空桌开始。</h2><p class="modal-lead">清空当前摆放，保留你的资产库。可以撤销恢复，也可以先导出备份。</p><button class="primary-button" data-action="confirm-blank">新建空白桌面 ↗</button>');
actions['confirm-blank']=()=>{mutate(()=>{state.objects=[];selected.clear();});$('#modal').close();};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.deckScope){setDeckScope(b.dataset.deckScope);return;}
  if(b.dataset.searchDraw!==undefined){const deck=state.objects.find(o=>o.id===$('#modal').dataset.deckId);if(deck)draw(undefined,deck,Number(b.dataset.searchDraw));return;}
  if(b.dataset.editProfile){editProfile(b.dataset.editProfile);return;}
  if(b.dataset.startProfile){beginOpening(b.dataset.startProfile);return;}
  if(b.dataset.orderIndex!==undefined){moveDeckCard(Number(b.dataset.orderIndex),Number(b.dataset.orderStep));return;}
  if(b.dataset.gameAction){try{gameAction(b.dataset.gameAction,b.dataset.gameValue||'');}catch(error){gameError(error);}return;}
  if(b.dataset.action){try{const result=actions[b.dataset.action]?.();if(result?.then){b.disabled=true;result.catch(error=>notify(error.message)).finally(()=>b.disabled=false);}}catch(error){notify(error.message);}}
  else if(b.dataset.library==='game'){tab=gameTab;renderLibrary();}
  else if(b.dataset.publicFilter){publicFilter=b.dataset.publicFilter;renderLibrary();}
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
  if(el.hasAttribute('data-draw-mode')){
    const o=primary(),mode=el.value;cancelDrawTarget();if(state.mode!=='edit'||!o)return;
    if(mode==='none')mutate(()=>delete o.drawTarget);
    else if(mode==='position'){const p=viewportCenter();mutate(()=>o.drawTarget={mode,x:Math.round(p.x),y:Math.round(p.y),rotation:0});}
    else if(mode==='deck')mutate(()=>o.drawTarget={mode,deckKey:''});
    else if(['right','left','above','below','center'].includes(mode))mutate(()=>o.drawTarget={mode,gap:30});
    return;
  }
  if(el.hasAttribute('data-draw-deck')){
    const o=primary(),target=state.objects.find(d=>d!==o&&(d.drawKey||d.id)===el.value&&(d.type==='deck'||d.type==='deal'&&d.layout==='deck'));
    if(state.mode==='edit'&&o&&!el.value){mutate(()=>o.drawTarget={mode:'deck',deckKey:''});return;}
    if(state.mode==='edit'&&o&&target)mutate(()=>{target.drawKey||=uid();o.drawTarget={mode:'deck',deckKey:target.drawKey};});return;
  }
  if(el.dataset.drawTarget){
    const o=primary(),key=el.dataset.drawTarget,value=Number(el.value),limit=key==='rotation'?360:key==='gap'?2000:10000;
    if(state.mode!=='edit'||!o?.drawTarget||!['x','y','rotation','gap'].includes(key))return;
    if(!el.value.trim()||!Number.isFinite(value)||Math.abs(value)>limit||key==='gap'&&value<0){notify('请输入有效范围内的坐标或角度');renderInspector();return;}
    mutate(()=>o.drawTarget[key]=value);return;
  }
  if(el.id==='profile-select'){const next=switchSetupProfile(state,el.value);mutate(()=>{state=next;selected.clear();});manageProfiles();fit();return;}
  if(el.hasAttribute('data-size')||el.hasAttribute('data-size-lock')||el.hasAttribute('data-size-reference')){
    if(state.mode!=='edit')return;
    const draft=structuredClone(state),items=draft.objects.filter(o=>selected.has(o.id)&&canResize(o)&&canMoveObject(o,'edit'));
    try{
      if(el.hasAttribute('data-size-lock'))items.forEach(o=>o.lockAspect=el.checked);
      else if(el.hasAttribute('data-size-reference')){const reference=el.value.startsWith('object:')?draft.objects.find(o=>o.id===el.value.slice(7)):el.value.startsWith('asset:')?draft.assets.find(a=>a.id===el.value.slice(6)):null;if(!reference)return;matchObjectSize(draft,items,reference);}
      else{if(!el.value.trim())throw new Error('请输入有效尺寸');resizeObjects(draft,items,el.dataset.size,Number(el.value));}
      mutate(()=>state=draft);
    }catch(error){notify(error.message);renderInspector();}
    return;
  }
  if(el.dataset.pile){
    const o=primary(),key=el.dataset.pile;if(state.mode!=='edit'||!(o?.type==='deck'||o?.type==='deal'&&o.layout==='deck'))return;
    const value=el.type==='checkbox'?el.checked:key==='name'?el.value.trim():Number(el.value);
    if(key==='name'&&(!value||value.length>100)||key==='maxCards'&&(!Number.isInteger(value)||value<Math.max(1,o.type==='deck'?o.cards.length:o.count)||value>500)||['x','y'].includes(key)&&(!el.value.trim()||!Number.isFinite(value)||Math.abs(value)>10000)){notify('请输入有效的设置，容量不能少于当前卡牌数');renderInspector();return;}
    if(!['name','fixedPosition','snapCards','maxCards','x','y'].includes(key))return;
    mutate(()=>o[key]=value);return;
  }
  if(el.dataset.deal){updateDeal(el);return;}
  if(el.dataset.opening){updateOpening(el);return;}
  if(el.dataset.property){const o=primary();if(!o||!isMovable(o))return;const p=el.dataset.property;const v=p==='color'?el.value:Number(el.value);if(p!=='color'&&(!Number.isFinite(v)||(p==='rotation'?Math.abs(v)>360:v<40||v>1600))){notify('请输入有效范围内的数值');renderInspector();return;}mutate(()=>o[p]=v);}
});
document.addEventListener('input',e=>{
  const el=e.target,key=el.dataset.meta;if(!key)return;
  const value=el.value;if(key==='name'&&!value.trim())return;
  if(metaEditing!==el){checkpoint();metaEditing=el;}
  if(key==='name'){state.name=value;$('.project-name>span:nth-child(2)').textContent=value;$('.table-toolbar h2').textContent=value;}else state.meta[key]=value;
  $('[data-action="undo"]').disabled=false;$('[data-action="redo"]').disabled=true;save();
});
document.addEventListener('focusout',e=>{
  if(e.target===metaEditing)metaEditing=null;
  const input=e.target,o=primary(),key=input.dataset?.deal;
  if(o?.type==='deal'&&input.tagName==='INPUT'&&key&&String(o[key])!==input.value)updateDeal(input);
  if(o?.type==='token'&&input.dataset?.opening==='value'&&String(o.value??0)!==input.value)updateOpening(input);
});

viewport.addEventListener('pointerdown',e=>{
  if(pickingDrawTarget&&state.mode==='edit'&&e.button===0&&!e.target.closest('.view-tools,#game-controls')){
    const owner=state.objects.find(o=>o.id===pickingDrawTarget),p=toWorld(e.clientX,e.clientY);cancelDrawTarget();
    if(owner)mutate(()=>owner.drawTarget={x:Math.max(-10000,Math.min(10000,Math.round(p.x))),y:Math.max(-10000,Math.min(10000,Math.round(p.y))),rotation:0});
    e.preventDefault();return;
  }
  if(state.mode==='edit'&&e.target.closest('#draw-target')&&e.button===0){
    const owner=primary();if(!owner?.drawTarget||owner.drawTarget.mode&&owner.drawTarget.mode!=='position')return;
    drag={kind:'draw-target',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,ownerId:owner.id,start:{...owner.drawTarget},moved:false};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  if(drag||e.target.closest('button,.view-tools,#game-controls'))return;if(e.button!==0&&e.button!==1)return;
  viewport.focus({preventScroll:true});
  const node=e.target.closest('.table-object'),hit=node&&state.objects.find(x=>x.id===node.dataset.id),o=hit?.type==='board'&&hit.locked?null:hit;
  if(isPanGesture(e.button,spaceDown)){drag={kind:'pan',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,pan:{...pan},moved:false,rotateId:e.button===1&&!spaceDown&&o?.type==='card'&&isMovable(o)&&!rolling.has(o.id)?o.id:null};viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');e.preventDefault();return;}
  if(!o){drag={kind:'marquee',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,moved:false,add:e.shiftKey,selected:[...selected]};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;}
  if(e.shiftKey){select(o,true);e.preventDefault();return;}
  if(!selected.has(o.id))select(o);if(o.locked||rolling.has(o.id))return;
  if(state.mode==='play'&&o.type==='deck'&&o.cards.length&&selected.size===1){
    if(currentDeckScope()==='top'){
      drag={kind:'deck-press',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,ids:[o.id],deckId:o.id,moved:false,alt:e.altKey};
      renderDeckDrawTools();viewport.setPointerCapture(e.pointerId);e.preventDefault();return;
    }
  }
  const items=selection().filter(o=>isMovable(o)&&!rolling.has(o.id));if(!items.length)return;drag={kind:'object',pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,ids:items.map(x=>x.id),starts:items.map(x=>({id:x.id,x:x.x,y:x.y,rotation:x.rotation})),moved:false,alt:e.altKey};viewport.setPointerCapture(e.pointerId);e.preventDefault();
});
viewport.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.moved&&Math.hypot(dx,dy)<3)return;
  if(drag.kind==='draw-target'){
    if(!drag.moved){checkpoint();drag.moved=true;}
    const owner=state.objects.find(o=>o.id===drag.ownerId);
    if(owner){owner.drawTarget.x=Math.max(-10000,Math.min(10000,Math.round(drag.start.x+dx/zoom)));owner.drawTarget.y=Math.max(-10000,Math.min(10000,Math.round(drag.start.y+dy/zoom)));renderDrawTarget();}return;
  }
  if(drag.kind==='deck-press'){
    drag.press?.finish();
    const deck=state.objects.find(o=>o.id===drag.deckId);
    objectNodes.get(drag.deckId)?.classList.remove('deck-pressing');
    if(!deck?.cards.length){endDrag(e,true);return;}
    checkpoint();
    const card=drawFromDeck(state,deck,undefined,deck);
    card.x=deck.x;card.y=deck.y;card.rotation=deck.rotation;
    selected=new Set([card.id]);drag.kind='object';drag.ids=[card.id];drag.starts=[{id:card.id,x:card.x,y:card.y,rotation:card.rotation}];drag.checkpointed=true;
    render();
  }
  if(!drag.moved){drag.moved=true;if(drag.kind==='object'){if(!drag.checkpointed)checkpoint();const items=state.objects.filter(o=>drag.ids.includes(o.id));items.forEach((o,i)=>{if(o.type!=='board')o.z=nextZ(state)+i;});if(!drag.pickupPlayed)playObjects(items,'pickup');}}
  $('#deck-draw-tools').hidden=true;
  if(drag.kind==='pan'){pan={x:drag.pan.x+dx,y:drag.pan.y+dy};transformScene();return;}
  if(drag.kind==='marquee'){updateMarquee(e);return;}
  const moveX=Math.max(...drag.starts.map(o=>-10000-o.x),Math.min(dx/zoom,...drag.starts.map(o=>10000-o.x)));
  const moveY=Math.max(...drag.starts.map(o=>-10000-o.y),Math.min(dy/zoom,...drag.starts.map(o=>10000-o.y)));
  for(const start of drag.starts){const o=state.objects.find(x=>x.id===start.id);if(!o)continue;o.x=start.x+moveX;o.y=start.y+moveY;const node=objectNodes.get(o.id);node?.classList.add('dragging');node?.style.setProperty('--x',`${o.x}px`);node?.style.setProperty('--y',`${o.y}px`);if(node)node.style.zIndex=objectLayer(o);}
  updateCardSnapPreview(e.altKey);
});
function updateCardSnapPreview(merge=drag?.alt){
  const preview=$('#card-snap-preview');
  if(!drag||drag.kind!=='object'||!drag.moved||drag.ids.length!==1){preview.hidden=true;return;}
  drag.alt=!!merge;
  const moving=state.objects.find(o=>o.id===drag.ids[0]);
  const {placement,target}=cardDropPlan(state,moving,drag.ids,{forceMerge:merge,placementFor:game()?.cardPlacement});
  drag.snapTargetId=target?.id;
  preview.hidden=!!placement||!target;if(preview.hidden)return;
  const {w,h}=dimensions(state,target);
  preview.style.cssText=`--x:${target.x}px;--y:${target.y}px;--w:${w}px;--h:${h}px;--angle:${target.rotation}deg`;
  preview.querySelector('span').textContent=placement?'松手按果树格对齐':target.fixedPosition?'松手放入牌位':target.type==='deck'?'松手加入牌堆':merge?'松手合为牌堆':'松手叠放';
}
function updateMarquee(e){
  const r=viewport.getBoundingClientRect(),left=Math.max(0,Math.min(drag.sx,e.clientX)-r.left),top=Math.max(0,Math.min(drag.sy,e.clientY)-r.top),right=Math.min(r.width,Math.max(drag.sx,e.clientX)-r.left),bottom=Math.min(r.height,Math.max(drag.sy,e.clientY)-r.top);
  const marquee=$('#selection-marquee');marquee.hidden=false;marquee.style.cssText=`left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px`;
  const matches=objectsInRect(state,{left:(left-pan.x)/zoom,top:(top-pan.y)/zoom,right:(right-pan.x)/zoom,bottom:(bottom-pan.y)/zoom}).filter(o=>!rolling.has(o.id));
  selected=new Set([...(drag.add?drag.selected:[]),...matches.map(o=>o.id)]);renderSelection();
}
function endDrag(e,cancelled=false){
  if(!drag)return;const previous=drag;drag=null;viewport.classList.remove('panning');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
  previous.press?.cancel();
  objectNodes.get(previous.deckId)?.classList.remove('deck-pressing','deck-held','dragging');
  $('#card-snap-preview').hidden=true;
  if(previous.kind==='draw-target'){if(previous.moved){if(cancelled)state=JSON.parse(history.pop());render();save();}return;}
  if(previous.kind==='deck-press'){renderDeckDrawTools();return;}
  if(previous.kind==='pan'){
    if(cancelled){pan=previous.pan;transformScene();}
    else if(!previous.moved&&previous.rotateId){const card=state.objects.find(o=>o.id===previous.rotateId);if(card&&isMovable(card)){select(card);rotate();}}
    renderDeckDrawTools();return;
  }
  if(previous.kind==='marquee'){$('#selection-marquee').hidden=true;if(cancelled)selected=new Set(previous.selected);else if(!previous.moved&&!previous.add)selected.clear();renderSelection();renderInspector();if(previous.moved&&!cancelled&&selected.size)notify(`已选中 ${selected.size} 个部件，拖动其中一个即可一起移动`);return;}
  if(previous.moved){
    for(const cue of new Set(state.objects.filter(o=>previous.ids.includes(o.id)).map(o=>objectSound(o,'pickup'))))stopSound(cue);
    if(cancelled){state=JSON.parse(history.pop());render();return;}
    let didStack=false;
    if(previous.ids.length===1){
      const o=state.objects.find(x=>x.id===previous.ids[0]);
      const {placement,target}=cardDropPlan(state,o,previous.ids,{forceMerge:e.altKey??previous.alt,placementFor:game()?.cardPlacement});
      if(placement){Object.assign(o,{x:placement.x,y:placement.y,rotation:placement.rotation});didStack=true;}
      else if(target&&snapCardOnto(state,o,target)){
        if(target.type==='deck')selected=new Set([target.id]);
        else if(e.altKey??previous.alt){const d=mergeCards(state,[target.id,o.id]);if(d)selected=new Set([d.id]);}
        didStack=true;
      }
    }
    if(!didStack&&previous.ids.length===1){const o=state.objects.find(x=>x.id===previous.ids[0]);if(o)snapObject(o);}
    playObjects(selection());render();save();
  }
  else if(previous.deckHeld){for(const o of selection())stopSound(objectSound(o,'pickup'));if(!cancelled)playObjects(selection());renderDeckDrawTools();}
}
viewport.addEventListener('pointerup',e=>endDrag(e));viewport.addEventListener('pointercancel',e=>endDrag(e,true));
viewport.addEventListener('dblclick',e=>{if(spaceDown||e.button!==0||e.target.closest('button:not(.table-object)'))return;const node=e.target.closest('.table-object')||document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-object');if(!node)return;const o=state.objects.find(x=>x.id===node.dataset.id);if(!o)return;select(o);if(o.type==='deck'){if(currentDeckScope()==='top'&&!o.locked&&o.cards.length)mutate(()=>flipTopCard(o),{audio:'flip'});}else if(['card','token'].includes(o.type))flip();else if(o.type==='die')roll();});
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
viewport.addEventListener('contextmenu',e=>{const node=e.target.closest('.table-object');if(!node)return;e.preventDefault();if(drag)endDrag({pointerId:drag.pointerId},true);const o=state.objects.find(x=>x.id===node.dataset.id);if(!o)return;select(o);if(o.type==='deck'&&state.mode==='play'&&currentDeckScope()==='pile')renderDeckDrawTools();else if(o.type==='card'||o.type==='deck'&&currentDeckScope()==='top'&&o.cards.length)inspect();else properties();});
viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
document.addEventListener('keydown',e=>{
  if($('#app').hidden)return;
  if(pickingDrawTarget&&e.key==='Escape'){e.preventDefault();cancelDrawTarget();notify('已取消设置发牌位置');return;}
  if(pickingDrawTarget)return;
  if(e.target.matches('[data-shortcut]')){
    if(['Tab','Escape'].includes(e.key))return;
    e.preventDefault();if(e.repeat)return;
    const key=eventShortcut(e);if(!key)return;
    const id=e.target.dataset.shortcut,error=bindingError(shortcuts,id,key);
    if(error){$('#shortcut-feedback').textContent=error;return;}
    if(storeShortcuts({...shortcuts,[id]:key})){e.target.value=key;$('#shortcut-feedback').textContent='已保存快捷键';}return;
  }
  const typing=e.target.closest('input,textarea,select,[contenteditable="true"]');
  const command=primary()?.type==='deck'?deckShortcutAction(shortcutAction(shortcuts,e),currentDeckScope()):shortcutAction(shortcuts,e);
  if(!typing&&!$('#modal').open&&!drag&&['mode','save'].includes(command)){
    e.preventDefault();if(e.repeat)return;
    if(command==='mode')setMode(state.mode==='play'?'edit':'play');else actions['save-draft']().catch(error=>notify(error.message));return;
  }
  if(e.key==='Escape'&&drag){e.preventDefault();endDrag({pointerId:drag.pointerId},true);return;}
  if(e.key==='Alt'&&drag){e.preventDefault();updateCardSnapPreview(true);return;}
  if(e.code==='Space'&&!e.target.closest('input,textarea,select,[contenteditable="true"]')&&!$('#modal').open&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();spaceDown=true;viewport.classList.add('space-pan');return;}
  if(drag)return;
  if(e.key==='Escape'&&!$('#modal').open){if(activeDrawer){setDrawer(null);return;}select(null);if(state.mode==='play')revealEditor();return;}
  if(typing||$('#modal').open)return;
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&/^\d$/.test(e.key)&&selection().some(o=>o.type==='die')){e.preventDefault();if(!e.repeat)setDiceValue(e.key==='0'?10:Number(e.key));return;}
  const commands={deckScope:()=>setDeckScope(currentDeckScope()==='top'?'pile':'top'),deckDraw:()=>draw(),deckShuffle:shuffle,searchDeck,undo,redo:()=>undo(true),duplicate,flip,rotate:()=>rotate(90),rotateBack:()=>rotate(-90),roll,stack,remove,zoomIn:()=>zoomAt(1.15),zoomOut:()=>zoomAt(1/1.15),fit,help};
  if(commands[command]){e.preventDefault();if(!e.repeat)commands[command]();}

});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;viewport.classList.remove('space-pan');}if(e.key==='Alt'&&drag)updateCardSnapPreview(false);});
window.addEventListener('blur',()=>{spaceDown=false;viewport.classList.remove('space-pan');if(drag)endDrag({pointerId:drag.pointerId},true);});
objects.addEventListener('keydown',e=>{if(e.key==='Enter'){const o=state.objects.find(o=>o.id===e.target.closest('.table-object')?.dataset.id);if(o)select(o,e.shiftKey);}});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#modal').addEventListener('close',()=>{if(state.awaitingOpening&&$('#modal').dataset.kind==='opening-choice')plaza.show('all').catch(error=>notify(error.message));});
async function imageData(file){if(file.size>20*1024*1024)throw new Error('单张图片请小于 20 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('只支持 PNG、JPG 和 WebP 图片');const image=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();return {data:canvas.toDataURL('image/webp',.9),width:canvas.width,height:canvas.height,name:file.name.replace(/\.[^.]+$/,'').slice(0,80)};}
$('#asset-input').addEventListener('change',async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  try{pendingImages=await Promise.all(files.slice(0,30).map(imageData));
    if(importPurpose==='back'){const o=primary();if(!o||!['card','token'].includes(o.type))return;const original=assetFor(state,o.assetId);mutate(()=>{const a={...structuredClone(original),id:uid(),back:pendingImages[0].data};delete a.number;state.assets.push(a);o.assetId=a.id;});pendingImages=[];notify('已更换物件背面');return;}
    openModal(`<span class="section-eyebrow">MAKE IT YOURS</span><h2>把你的素材放上桌。</h2><p class="modal-lead">已选择 ${pendingImages.length} 张图片，图片会随桌面存档一起保存。</p><div class="import-preview">${pendingImages.map(i=>`<img src="${i.data}" alt="${escape(i.name)}">`).join('')}</div><label class="import-label">资产类型<select id="import-type"><option value="card">卡牌</option><option value="board" ${importPurpose==='board'?'selected':''}>版图</option><option value="token">标记</option></select></label><p class="subtle-note">双面卡牌可在编辑模式中选中后更换背面。版图默认放到最下层。</p><button class="primary-button" data-action="confirm-import">添加到资产库与桌面 ↗</button>`);
  }catch(error){notify(error.message);}
});
function finishImport(){const type=$('#import-type').value,p=viewportCenter();mutate(()=>{const ids=[];pendingImages.forEach((i,index)=>{const width=type==='card'?160:type==='board'?640:60,height=type==='card'?240:type==='board'?Math.max(40,Math.min(1600,640*i.height/i.width)):60;const asset={id:uid(),type,name:i.name,front:i.data,width,height};state.assets.push(asset);const o={...baseObject(type,p.x+index*25,p.y+index*25,type==='board'?0:nextZ(state)),assetId:asset.id,faceUp:true};if(type==='board'){o.width=width;o.height=height;}if(type==='token'){o.kind='custom';o.name=i.name;o.color='#c79e62';}state.objects.push(o);ids.push(o.id);});selected=new Set(ids);state.mode='edit';tab=type==='card'?'cards':type==='board'?'boards':'tokens';});pendingImages=[];$('#modal').close();notify('素材已加入，可右键查看属性');}
$('#session-input').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>50*1024*1024)throw new Error('存档请小于 50 MB');const imported=migrateSession(JSON.parse(await file.text()));await plaza.import(imported);notify('项目已导入，原项目也会保留');}catch(error){notify(`无法载入：${error.message}`);}});

window.addEventListener('beforeunload',()=>{if(saveTimer&&workspaceLoaded){try{localStorage.setItem(RECOVERY,JSON.stringify({...state,updatedAt:Date.now()}));}catch{}}});
new ResizeObserver(()=>{if(!drag&&!$('#app').hidden)fit();}).observe(viewport);
function forgetDraft(ids){
  try{const recovery=JSON.parse(localStorage.getItem(RECOVERY)||'null');if(recovery&&ids.includes(recovery.projectId))localStorage.removeItem(RECOVERY);}catch{}
  if(!ids.includes(state.projectId))return;
  clearTimeout(saveTimer);saveTimer=null;workspaceLoaded=false;savedFingerprint='';state=createSession();selected.clear();history=[];future=[];rolling.clear();
}
plaza=createPlaza({flush:saveNow,activate:activateSession,notify,forgetDraft});
async function initialize(){
  try{
    try{const recovery=localStorage.getItem(RECOVERY);if(recovery){const recovered=migrateSession(JSON.parse(recovery)),record=await projectStore.get(recovered.projectId);if(!record||recovered.updatedAt>record.updatedAt)await projectStore.save(recovered);localStorage.removeItem(RECOVERY);}}catch(error){notify(`恢复存档未能读取，原文件已保留：${error.message}`);}
    try{const legacy=localStorage.getItem(STORAGE);if(legacy&&!localStorage.getItem('tablecraft.legacy-migrated')){await projectStore.save(migrateSession(JSON.parse(legacy)));localStorage.setItem('tablecraft.legacy-migrated','yes');}}catch(error){notify(`旧桌面未能迁移，原存档已保留：${error.message}`);}
    await plaza.show('all');
  }catch(error){notify(`本地项目库未能读取：${error.message}`);$('#plaza-loading').textContent='项目库暂时无法读取。你可以导入导出的项目文件。';}
}
initialize();
