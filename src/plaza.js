import {assetUrl} from './asset-url.js';
import {exampleCatalog as examples} from './example-catalog.js';
import {projectStore} from './project-store.js';
import {findLibraryDraft,libraryName} from './library.js';
import {gameCatalog,classificationFor,CATALOG_CHECKED} from './game-catalog.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const icon=paths=>'<svg class="plaza-icon" viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg>';
const arrowIcon=icon('<path d="M5 12h14m-5-5 5 5-5 5"/>');
const playersIcon=icon('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>');
const clockIcon=icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const editIcon=icon('<path d="m14 5 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z"/>');
const previews=new Map(examples.flatMap(game=>game.preview.assets).map(asset=>[asset.front,asset]));
export function createPlaza({flush,activate,notify,forgetDraft=()=>{}}){
  let filter='all',projects=[],exhibits=[],busy=false,pendingRemoval=null,lastRemoval=null,pendingPlay=null;
  const notice=document.createElement('div');notice.className='library-notice';notice.hidden=true;notice.setAttribute('role','status');$('#plaza-grid').before(notice);
  $('#plaza-rating-sources').innerHTML=Object.values(gameCatalog).map(entry=>'<li><strong>'+escape(entry.name)+'</strong><span>'+entry.ratings.map(rating=>'<a href="'+escape(rating.url)+'" target="_blank" rel="noopener noreferrer">'+escape(rating.name)+' '+rating.weight.toFixed(2)+'/5'+(rating.indirect?'（转引）':'')+' ↗</a>').join(' · ')+(entry.note?'<small>'+escape(entry.note)+'</small>':'')+'</span></li>').join('');
  $('#plaza-rating-date').textContent=CATALOG_CHECKED;
  function renderNotice(){notice.hidden=!lastRemoval;notice.innerHTML=lastRemoval?`<span>${lastRemoval.kind==='projects'?'已删除草稿':'已撤销发布'}「${escape(lastRemoval.entries[0].session.name)}」</span><button data-undo-library>撤销</button>`:'';}
  function confirmRemoval(kind,id){
    const entry=(kind==='projects'?projects:exhibits).find(e=>e.id===id);if(!entry)return;
    pendingRemoval={kind,id};
    const modal=$('#modal');modal.dataset.kind='library-removal';$('#modal-content').innerHTML=`<h2>${kind==='projects'?'删除草稿':'撤销发布'}？</h2><p class="modal-lead">${escape(entry.session.name)}<br>${kind==='projects'?'只删除本地草稿，作品广场已发布的版本会保留。':'只从作品广场撤下，本地草稿会保留。'}操作后可在当前页面撤销。</p><button class="primary-button" data-confirm-library-removal>${kind==='projects'?'删除草稿':'撤销发布'}</button><button class="full-width quiet" data-cancel-library-removal>取消</button>`;modal.classList.remove('wide');modal.showModal();
  }
  function card(session,type,id,eager=false){
    const available=session.assets.filter(a=>a.type==='card');
    const covers=(examples.find(game=>game.id===session.gameId)?.coverAssetIds||[]).map(id=>available.find(a=>a.id===id)).filter(Boolean);
    const cards=(covers.length?covers:available).slice(0,3),image=session.assets.find(a=>a.type==='board'||a.type==='token');
    const coverImage=(asset,single=false)=>{
      const preview=previews.get(asset.front);
      return '<img'+(single?' class="single-cover"':'')+' src="'+escape(assetUrl(preview?.thumbnail||asset.front))+'" alt="" loading="'+(eager?'eager':'lazy')+'" decoding="async" fetchpriority="'+(eager?'high':'low')+'"'+(preview?' width="'+preview.thumbnailWidth+'" height="'+preview.thumbnailHeight+'"':'')+'>';
    };
    const art=cards.length?cards.map(a=>coverImage(a)).join(''):image?coverImage(image,true):'<span>◇</span>';
    const attrs='="'+escape(id)+'"';
    const buttons=type==='project'?'<button data-plaza-project'+attrs+'><span>编辑草稿</span>'+arrowIcon+'</button>'+(session.mode==='play'?'<button class="secondary" data-resume-project'+attrs+'>继续游玩</button>':''):'<button data-plaza-'+type+attrs+'><span>开始游玩</span>'+arrowIcon+'</button><button class="secondary" data-edit-'+type+attrs+'>'+editIcon+'编辑游戏</button>';
    const exampleIndex=examples.findIndex(game=>game.id===session.gameId);
    const tone=['sage','sand','slate','clay'][(exampleIndex<0?[...String(session.gameId||id)].reduce((sum,c)=>sum+c.charCodeAt(0),0):exampleIndex)%4];
    const badge=type==='example'?'':'<span class="plaza-card-badge"><i></i>'+(type==='project'?'本地草稿':'玩家作品')+'</span>';
    const meta=(session.meta?.players?'<span>'+playersIcon+escape(session.meta.players)+'</span>':'')+(session.meta?.duration?'<span>'+clockIcon+escape(session.meta.duration)+'</span>':'');
    const info=classificationFor(session.gameId),tags='<div class="plaza-card-tags" aria-label="游戏分类">'+info.tags.map(tag=>'<span>'+escape(tag)+'</span>').join('')+'</div>';
    const bars='<span class="plaza-difficulty-bars" aria-hidden="true">'+Array.from({length:5},(_,i)=>'<i'+(info.level&&i<info.level?' class="filled"':'')+'></i>').join('')+'</span>';
    const difficulty=info.level?'<a class="plaza-difficulty" href="'+escape(info.ratings[0].url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+escape('难度参考：'+info.label+'，BGG 复杂度 '+info.score+'/5，查看来源')+'" title="'+escape('原作复杂度参考；'+(info.note||'扩展与自定义修改可能改变实际体验。'))+'">'+bars+'<span>'+escape(info.label)+'</span><small>'+escape(info.score)+'/5</small></a>':'<span class="plaza-difficulty unrated" title="自制游戏尚无公开复杂度参考">'+bars+'<span>难度待评</span></span>';
    return '<article class="plaza-card" data-cover-tone="'+tone+'"><div class="plaza-art">'+badge+'<div class="plaza-cover-stack">'+art+'</div></div><div class="plaza-card-body"><h3>'+escape(session.name)+'</h3>'+tags+'<p>'+escape(session.meta?.description||'自由摆放，随时开始。')+'</p><div class="plaza-card-meta">'+meta+difficulty+'</div><div class="plaza-card-actions">'+buttons+'</div>'+(type==='exhibit'?'<button class="unlist-exhibit" data-unlist'+attrs+'>撤销发布</button>':type==='project'?'<button class="delete-draft" data-delete-draft'+attrs+'>删除草稿</button>':'')+'</div></article>';
  }
  function renderCards(){
    const query=$('#plaza-search').value.trim().toLowerCase(),matches=s=>{const info=classificationFor(s.gameId);return [s.name,s.meta?.description,...info.tags,info.level?info.label:''].join(' ').toLowerCase().includes(query);},cards=[];
    if(filter==='all'){
      for(const game of examples){if(exhibits.some(e=>libraryName(e.session.name)===libraryName(game.title)))continue;const s=game.preview;if(matches(s))cards.push(card(s,'example',game.id,cards.length<3));}
      for(const entry of exhibits)if(matches(entry.session))cards.push(card(entry.session,'exhibit',entry.id));
    }else for(const entry of projects)if(matches(entry.session))cards.push(card(entry.session,'project',entry.id));
    $('#plaza-grid').innerHTML=cards.join('')||'<div class="plaza-empty"><span aria-hidden="true">'+icon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>')+'</span><h3>'+ (query?'没有找到相关游戏':'灵感的第一步，从这里开始')+'</h3><p>'+(query?'换个关键词，发现另一种好玩。':'点击「新建游戏」，或从作品广场编辑一款喜欢的游戏。')+'</p></div>';
    document.querySelectorAll('[data-plaza-filter]').forEach(b=>{const active=b.dataset.plazaFilter===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('#plaza-section-title').textContent=filter==='all'?'作品广场':'本地草稿';
    $('#plaza-section-note').textContent=filter==='all'?'选择一个游戏，开始游玩或编辑。':'直接摆放、设置开局，修改自动保存在这里。';
    $('#plaza-project-count').textContent=String(projects.length);
    $('#plaza-result-count').textContent=cards.length+(query?' 个结果':filter==='all'?' 款游戏':' 份草稿');
    $('#plaza-welcome-title').innerHTML=filter==='all'?'下一局，<em>玩点什么？</em>':'把灵感，<em>摆上桌面。</em>';
    $('#plaza-welcome-note').innerHTML=filter==='all'?'从一场小小的冒险，到一个全新的灵感。<br>找一款喜欢的游戏，把时间留给好玩。':'每一个好游戏，都从一个小小的想法开始。<br>继续打磨你的作品，让下一局更有意思。';
  }
  async function openGame(source,originKey,edit,newExample=false){
    await flush();
    const {openEditor,copyProject,prepareSession}=await import('./project-session.js');
    source=await prepareSession(source);
    const legacyNames=newExample?[examples.find(g=>g.id===source.gameId)?.legacyName].filter(Boolean):[];
    const existing=findLibraryDraft(await projectStore.list(),source,originKey,legacyNames);
    if(edit){await activate(openEditor(existing?await prepareSession(existing.session):{...copyProject(source),originKey}));return;}
    const saved=await projectStore.getPlay(originKey);
    // Keep old play progress available without deleting potentially authored drafts.
    const previous=saved?.session||(existing?.session.mode==='play'&&!existing.session.awaitingOpening?existing.session:null);
    if(previous){
      pendingPlay={source:structuredClone(source),originKey,newExample,previous:structuredClone(previous)};
      const modal=$('#modal');modal.dataset.kind='play-choice';modal.classList.remove('wide');
      $('#modal-content').innerHTML=`<h2>继续上一局，还是新开一局？</h2><p class="modal-lead">「${escape(source.name)}」有上次的游玩进度。继续原来的冒险，或从初始设置重新开始。</p><button class="primary-button" data-continue-play>继续上一局</button><button class="full-width quiet" data-new-play>新开一局</button><button class="full-width quiet" data-cancel-play>取消</button>`;
      modal.showModal();return;
    }
    await beginPlay(source,originKey,newExample);
  }
  async function beginPlay(source,originKey,newExample){
    const {createPlaySession}=await import('./project-session.js');
    const opening=createPlaySession(source,originKey);
    await activate(opening,{newExample,chooseProfile:true});
  }
  async function run(operation){if(busy)return;busy=true;$('#plaza').setAttribute('aria-busy','true');try{await operation();}catch(error){notify(error.message);}finally{busy=false;$('#plaza').removeAttribute('aria-busy');}}
  const api={
    async show(nextFilter=filter){
      await flush();filter=nextFilter==='mine'?'mine':'all';$('#app').hidden=true;$('#plaza').hidden=false;
      $('#plaza-loading').textContent='正在读取…';$('#plaza-loading').hidden=false;
      try{
        [projects,exhibits]=await Promise.all([projectStore.list(),projectStore.exhibits()]);
        projects.sort((a,b)=>b.updatedAt-a.updatedAt);exhibits.sort((a,b)=>b.publishedAt-a.publishedAt);renderCards();
      }catch(error){
        $('#plaza-grid').innerHTML=`<div class="plaza-empty" role="alert"><h3>本地存档暂时无法读取</h3><p>${escape(error.message)}</p><button class="primary-button" data-retry-library>重试读取</button></div>`;
        throw error;
      }finally{$('#plaza-loading').hidden=true;}
    },
    async create(name){await flush();const {openEditor,createProject,prepareSession}=await import('./project-session.js');const existing=findLibraryDraft(await projectStore.list(),{name});if(existing){notify('已有同名草稿，已打开原草稿');await activate(openEditor(await prepareSession(existing.session)));return;}await activate(createProject('custom',name));},
    async import(session){await flush();if(findLibraryDraft(await projectStore.list(),session))throw new Error('本地草稿已有同名游戏，请先修改草稿名称再导入');const {openEditor,copyProject,prepareSession}=await import('./project-session.js');await activate(openEditor(copyProject(await prepareSession(session))));},
    edit:session=>openGame(session,session.playOriginKey,true,session.playOriginKey?.startsWith('example:')),
    refresh:()=>api.show(filter)
  };
  $('#plaza-search').addEventListener('input',renderCards);
  $('#plaza').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.plazaFilter){filter=b.dataset.plazaFilter;renderCards();return;}
    const d=b.dataset;
    if(b.hasAttribute('data-retry-library'))run(()=>api.show(filter));
    if(d.plazaExample||d.editExample)run(async()=>{const {createProject}=await import('./project-session.js'),{loadGame}=await import('./game-registry.js');const game=examples.find(g=>g.id===(d.plazaExample||d.editExample));await loadGame(game.id);const source=createProject(game.id,game.title);await openGame(source,'example:'+game.id,!!d.editExample,true);});
    if(d.resumeProject)run(async()=>{await flush();const entry=await projectStore.get(d.resumeProject);if(!entry)throw new Error('进度未找到');await activate(entry.session);});
    if(d.plazaProject)run(async()=>{await flush();const entry=await projectStore.get(d.plazaProject);if(!entry)throw new Error('草稿未找到');const {openEditor,prepareSession}=await import('./project-session.js');await activate(openEditor(await prepareSession(entry.session)));});
    if(d.plazaExhibit||d.editExhibit)run(async()=>{const entry=exhibits.find(x=>x.id===(d.plazaExhibit||d.editExhibit));if(!entry)throw new Error('作品未找到');await openGame(entry.session,'exhibit:'+entry.id,!!d.editExhibit);});
    if(d.unlist)confirmRemoval('exhibits',d.unlist);
    if(d.deleteDraft)confirmRemoval('projects',d.deleteDraft);
    if(b.hasAttribute('data-undo-library'))run(async()=>{if(!lastRemoval)return;await projectStore.restore(lastRemoval.kind,lastRemoval.entries);lastRemoval=null;renderNotice();await api.show(filter);notify('已恢复');});
  });
  $('#modal').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-cancel-play')){pendingPlay=null;$('#modal').close();}
    if(b.hasAttribute('data-continue-play')||b.hasAttribute('data-new-play'))run(async()=>{
      if(!pendingPlay)return;const {source,originKey,newExample,previous}=pendingPlay;pendingPlay=null;
      if(b.hasAttribute('data-continue-play'))await activate({...previous,originKey,playOriginKey:originKey});
      else await beginPlay(source,originKey,newExample);
    });
    if(b.hasAttribute('data-cancel-library-removal')){pendingRemoval=null;$('#modal').close();}
    if(b.hasAttribute('data-confirm-library-removal'))run(async()=>{
      if(!pendingRemoval)return;const {kind,id}=pendingRemoval;await flush();
      const entries=kind==='projects'?await projectStore.removeDraft(id):await projectStore.unlist(id);
      if(!entries.length)throw new Error('记录已不存在，请刷新页面');
      if(kind==='projects')forgetDraft(entries.map(e=>e.id));
      lastRemoval={kind,entries};pendingRemoval=null;$('#modal').close();renderNotice();await api.show(filter);
    });
  });
  return api;
}
