import {assetFor,dimensions} from './model.js';
import {canResize} from './sizing.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openingChoicesHTML(state,{editing=false}={}){
  const profiles=state.setupProfiles||[];
  const previews=profiles.map(p=>{
    const hero=p.setup.objects.find(o=>o.ihRole==='hero'&&(o.type==='card'||o.cards?.length))
      ||p.setup.objects.find(o=>o.type==='card'&&assetFor(state,o.assetId)?.group==='hero');
    const id=p.coverAssetId??(hero?.assetId||hero?.cards?.at(-1)),asset=assetFor(state,id);
    if(!asset)return null;
    const piece=p.setup.objects.find(o=>o.type==='card'&&o.assetId===id);
    return {asset,src:piece?.faceUp===false&&asset.back?asset.back:asset.front};
  });
  return `<div class="profile-list${previews.some(Boolean)?' profile-cards':''}" style="--profile-columns:${Math.max(1,Math.min(4,profiles.length))};--profile-compact-columns:${Math.max(1,Math.min(2,profiles.length))}">${profiles.map((p,i)=>{
    const hero=previews[i];
    return `<button ${editing?'data-edit-profile':'data-start-profile'}="${escape(p.id)}" class="${editing&&p.id===state.activeSetupProfileId?'active':''}">${hero?`<img src="${escape(hero.src)}" alt="${escape(hero.asset.name)}" draggable="false">`:''}<strong>${escape(p.name)}</strong>${p.description?`<small class="profile-description">${escape(p.description)}</small>`:''}<small>${editing?'编辑此方案的桌面 ↗':'以此方案开始新一局 ↗'}</small></button>`;
  }).join('')}</div>`;
}
export function drawTargetHTML(state,o){
  if(state.mode!=='edit'||!(o.type==='deck'||o.type==='deal'&&o.layout==='deck'))return '';
  const target=o.drawTarget,mode=target?(target.mode||'position'):'none';
  const modes=[['none','未设置'],['deck','指定牌堆'],['right','牌堆右边'],['below','牌堆下面'],['center','牌堆中央'],['above','牌堆上面'],['left','牌堆左边'],['position','自定义桌面位置']];
  const candidates=state.objects.filter(d=>d!==o&&(d.type==='deck'||d.type==='deal'&&d.layout==='deck'));
  const options=candidates.map((d,i)=>`<option value="${escape(d.drawKey||d.id)}" ${d.drawKey===target?.deckKey?'selected':''}>${i+1}. ${escape(d.name||'牌堆')}${d.type==='deal'?'（开局生成）':''}</option>`).join('');
  return `<section class="opening-properties"><h3>点击发牌位置</h3><label>发牌到<select data-draw-mode>${modes.map(([v,label])=>`<option value="${v}" ${mode===v?'selected':''}>${label}</option>`).join('')}</select></label>${mode==='deck'?`<label>目标牌堆<select data-draw-deck><option value="">${target.deckKey?'目标已移除，请重新选择':'请选择牌堆'}</option>${options}</select></label><p>每次将顶牌加入目标牌堆，目标移动后仍能找到它。${!candidates.length?'当前没有其他牌堆，请先创建。':''}</p>`:mode==='position'?`<button class="deal-create-button" data-action="pick-draw-target">重新点选桌面位置</button>${['x','y','rotation'].map((key,i)=>`<label>${['横坐标','纵坐标','发出卡牌角度'][i]}<input type="number" data-draw-target="${key}" min="${key==='rotation'?-360:-10000}" max="${key==='rotation'?360:10000}" value="${target[key]}"></label>`).join('')}<p>拖动桌面上的虚线标记调整位置。</p>`:mode!=='none'?`${mode!=='center'?`<label>与牌堆的间距<input type="number" data-draw-target="gap" min="0" max="2000" value="${target.gap??30}"></label>`:''}<p>相对来源牌堆定位，移动牌堆后发牌位置跟随调整。</p>`:''}<p>游玩时点击发一张；直接拖动顶牌仍可自由摆放，不影响开局发牌。</p></section>`;
}
export function pileSettingsHTML(state,o){
  if(state.mode!=='edit')return '';
  if(o.type==='card')return '<button class="deal-create-button" data-action="make-fixed-pile">设为固定牌位（最多 1 张）</button>';
  if(!(o.type==='deck'||o.type==='deal'&&o.layout==='deck'))return '';
  return `<section class="opening-properties"><h3>牌堆与吸附</h3>${o.type==='deck'?`<label>牌位名称<input data-pile="name" maxlength="100" value="${escape(o.name||'')}"></label>`:''}<label>游玩时固定位置<input type="checkbox" data-pile="fixedPosition" ${o.fixedPosition?'checked':''}></label><label>拖入卡牌自动吸附<input type="checkbox" data-pile="snapCards" ${o.snapCards!==false?'checked':''}></label><label>最多容纳<input type="number" data-pile="maxCards" min="1" max="500" step="1" value="${o.maxCards??500}"></label><p>容量为 1 时隐藏数量。固定牌位可在编辑中移动、旋转、缩放；游玩时取出顶牌，牌位留在原处。</p>${['x','y'].map((key,i)=>`<label>${i?'纵坐标':'横坐标'}<input type="number" data-pile="${key}" min="-10000" max="10000" value="${o[key]}"></label>`).join('')}</section>`;
}
export function sizeSettingsHTML(state,o){
  if(state.mode!=='edit'||!canResize(o))return '';
  const {w,h}=dimensions(state,o),number=n=>Math.round(n*100)/100;
  const references=state.objects.filter(other=>other!==o&&canResize(other));
  const label=other=>other.name||assetFor(state,other.assetId)?.name||({deck:'牌堆',deal:'发牌位置',board:'版图',card:'卡牌'})[other.type];
  return `<section class="opening-properties size-settings"><h3>尺寸</h3><div class="size-fields">${[['width','宽度',w],['height','高度',h]].map(([key,name,value])=>`<label>${name}<input type="number" data-size="${key}" min="20" max="2000" step="0.1" value="${number(value)}" ${o.locked?'disabled':''}></label>`).join('')}</div><label>锁定宽高比例<input type="checkbox" data-size-lock ${o.lockAspect!==false?'checked':''} ${o.locked?'disabled':''}></label><label>匹配尺寸<select data-size-reference ${o.locked?'disabled':''}><option value="">选择桌面上的卡牌或牌位</option>${references.map(other=>{const {w,h}=dimensions(state,other);return `<option value="object:${escape(other.id)}">${escape(label(other))} · ${number(w)} × ${number(h)}</option>`;}).join('')}<optgroup label="卡牌资产">${state.assets.filter(a=>a.type==='card').map(a=>`<option value="asset:${escape(a.id)}">${escape(a.name)} · ${a.width} × ${a.height}</option>`).join('')}</optgroup></select></label><p>选择参考后立即匹配宽高；多选时同时应用到所选部件。</p>${(['card','deck'].includes(o.type)||o.type==='deal'&&o.layout==='deck')?'<button class="deal-create-button" data-action="add-matching-pile">＋ 创建同尺寸空牌位</button>':''}</section>`;
}
export function openingHTML(state,o){
  if(state.mode!=='edit'||o.type==='board')return '';
  if(o.type==='deal'){
    const sources=state.objects.filter(d=>d.type==='deck'&&d.setupKey),source=sources.find(d=>d.setupKey===o.sourceKey);
    const requested=state.objects.filter(d=>d.type==='deal'&&d.sourceKey===o.sourceKey).reduce((n,d)=>n+d.count,0);
    return `<section class="opening-properties"><h3>开局发牌</h3><label>牌位名称<input data-deal="name" maxlength="100" value="${escape(o.name)}"></label><label>来源牌堆<select data-deal="sourceKey">${sources.map(d=>`<option value="${escape(d.setupKey)}" ${d.setupKey===o.sourceKey?'selected':''}>${escape(d.name||'牌堆')} · ${d.cards.length} 张</option>`).join('')}</select></label><label>抽取数量<input type="number" data-deal="count" min="1" max="500" step="1" value="${o.count}"></label><label>发牌顺序<input type="number" data-deal="order" min="1" max="1000" step="1" value="${o.order??state.objects.filter(d=>d.type==='deal').indexOf(o)+1}"></label><label>放置方式<select data-deal="layout"><option value="spread" ${o.layout==='spread'?'selected':''}>展开为单牌</option><option value="deck" ${o.layout==='deck'?'selected':''}>组成新牌堆</option></select></label>${o.layout==='spread'?`<label>展开间距<input type="number" data-deal="spacing" min="0" max="2000" value="${o.spacing}"></label>`:''}<label>正背面<select data-deal="face"><option value="up" ${o.setupFace!=='random'&&o.faceUp!==false?'selected':''}>正面朝上</option><option value="down" ${o.setupFace!=='random'&&o.faceUp===false?'selected':''}>背面朝上</option><option value="random" ${o.setupFace==='random'?'selected':''}>${o.layout==='deck'?'牌堆随机正背面':'每张随机正背面'}</option></select></label><p class="${!source||requested>source.cards.length?'opening-error':''}">${source?`这个牌堆共 ${source.cards.length} 张，所有牌位合计取 ${requested} 张。`:'请指定有效的来源牌堆。'}</p><p>拖动牌位安排位置。每局先洗来源牌堆，再按发牌顺序从小到大发牌；来源牌堆会相应减少。</p></section>`;
  }
  const previous=state.setup||state.initialSetup;
  const order=o.setupOrder||(previous?.shuffleDecks||previous?.randomizeCards?'shuffle':'fixed');
  const face=o.setupFace||(o.type==='die'&&previous?.rollDice?'random':'fixed');
  const deck=o.type==='deck'?`<label>牌序<select data-opening="setupOrder"><option value="fixed" ${order==='fixed'?'selected':''}>固定顺序</option><option value="shuffle" ${order==='shuffle'?'selected':''}>每局随机洗牌</option></select></label><button class="deal-create-button" data-action="add-deal">＋ 设置初始发牌位置</button><label>发完后移除空堆<input type="checkbox" data-opening="setupHideEmpty" ${o.setupHideEmpty?'checked':''}></label><details><summary>调整牌序 · 顶牌在前</summary><ol class="deck-order">${o.cards.map((id,index)=>({id,index})).reverse().map(({id,index})=>`<li><span>${escape(assetFor(state,id)?.name||'卡牌')}</span><button data-order-index="${index}" data-order-step="1" aria-label="向牌顶移动第 ${o.cards.length-index} 张牌" ${index===o.cards.length-1?'disabled':''}>↑</button><button data-order-index="${index}" data-order-step="-1" aria-label="向牌底移动第 ${o.cards.length-index} 张牌" ${index===0?'disabled':''}>↓</button></li>`).join('')}</ol></details>`:'';
  const fixed=o.type!=='die'&&face==='fixed'?`<label>固定面<select data-opening="faceUp"><option value="true" ${o.faceUp!==false?'selected':''}>正面朝上</option><option value="false" ${o.faceUp===false?'selected':''}>背面朝上</option></select></label>`:'';
  const value=o.type==='token'?`<label>初始数值<input type="number" data-opening="value" min="-999" max="999" value="${Number.isFinite(o.value)?o.value:0}"></label>`:'';
  return `<section class="opening-properties"><h3>开局设置</h3>${deck}<label>${o.type==='die'?'骰面':'朝向'}<select data-opening="setupFace"><option value="fixed" ${face==='fixed'?'selected':''}>固定${o.type==='die'?'骰面':'面'}</option><option value="random" ${face==='random'?'selected':''}>每局随机${o.type==='die'?'骰面':'正背面'}</option></select></label>${fixed}${value}<p>以上朝向仅在开局时应用；游玩中放入、叠放和取牌保留卡牌当时的正背面。</p></section>`;
}
