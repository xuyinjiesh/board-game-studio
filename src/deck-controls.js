import {assetFor,deckEntries} from './model.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function deckControlsHTML(deck,scope,keys){
  const button=(action,label,key,disabled=false)=>`<button data-action="${action}" ${disabled?'disabled':''}>${label}${key?` <kbd>${escape(key)}</kbd>`:''}</button>`;
  return `<div class="deck-scope-switch" aria-label="牌堆操作对象"><button data-deck-scope="top" aria-pressed="${scope==='top'}">顶牌</button><button data-deck-scope="pile" aria-pressed="${scope==='pile'}">整堆</button><kbd>${escape(keys.deckScope)}</kbd></div><div class="deck-scope-actions">${scope==='pile'?button('draw','发牌',keys.roll,!deck.cards.length)+button('search-deck','搜寻',keys.searchDeck,!deck.cards.length)+button('shuffle','洗牌',keys.rotate,deck.cards.length<2):button('flip-top','翻顶牌',keys.flip,!deck.cards.length)+button('inspect','查看顶牌','',!deck.cards.length)}</div>`;
}
export function deckSearchHTML(state,deck){
  const entries=deckEntries(deck).map((card,index)=>({...card,index})).reverse();
  return `<h2>${escape(deck.name||'牌堆')} · 搜寻</h2><p class="modal-lead">共 ${entries.length} 张，按顶牌到底牌的顺序展示。取出卡牌会保留当前正背面，其余牌序不变。</p><ol class="deck-search-list">${entries.map((card,order)=>{const asset=assetFor(state,card.assetId);return `<li><span class="deck-search-order">${order+1}${order===0?' · 顶牌':''}</span><img src="${escape(asset.front)}" alt="${escape(asset.name)}" loading="lazy"><strong>${escape(asset.name)}</strong><small>${card.faceUp?'当前正面朝上':'当前背面朝上'}</small><button data-search-draw="${card.index}" ${deck.locked?'disabled':''}>取出这张牌</button></li>`;}).join('')||'<li class="deck-search-empty">牌堆已空</li>'}</ol>`;
}
