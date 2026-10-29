import {assetUrl} from './asset-url.js';
import {examples,createProject,copyProject,openEditor,startOpening} from './projects.js';
import {projectStore} from './project-store.js';
import {findLibraryDraft,libraryName} from './library.js';
import {uid} from './model.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
export function createPlaza({flush,activate,notify,forgetDraft=()=>{}}){
  let filter='all',projects=[],exhibits=[],busy=false,pendingRemoval=null,lastRemoval=null;
  const notice=document.createElement('div');notice.className='library-notice';notice.hidden=true;notice.setAttribute('role','status');$('#plaza-grid').before(notice);
  function renderNotice(){notice.hidden=!lastRemoval;notice.innerHTML=lastRemoval?`<span>${lastRemoval.kind==='projects'?'已删除草稿':'已撤销发布'}「${escape(lastRemoval.entries[0].session.name)}」</span><button data-undo-library>撤销</button>`:'';}
  function confirmRemoval(kind,id){
    const entry=(kind==='projects'?projects:exhibits).find(e=>e.id===id);if(!entry)return;
    pendingRemoval={kind,id};
    const modal=$('#modal');modal.dataset.kind='library-removal';$('#modal-content').innerHTML=`<h2>${kind==='projects'?'删除草稿':'撤销发布'}？</h2><p class="modal-lead">${escape(entry.session.name)}<br>${kind==='projects'?'只删除本地草稿，作品广场已发布的版本会保留。':'只从作品广场撤下，本地草稿会保留。'}操作后可在当前页面撤销。</p><button class="primary-button" data-confirm-library-removal>${kind==='projects'?'删除草稿':'撤销发布'}</button><button class="full-width quiet" data-cancel-library-removal>取消</button>`;modal.classList.remove('wide');modal.showModal();
  }
  function card(session,type,id){
    const cards=session.assets.filter(a=>a.type==='card').slice(0,3),image=session.assets.find(a=>a.type==='board'||a.type==='token');
    const art=cards.length?cards.map(a=>'<img src="'+escape(assetUrl(a.front))+'" alt="" loading="lazy">').join(''):image?'<img class="single-cover" src="'+escape(assetUrl(image.front))+'" alt="" loading="lazy">':'<span>◇</span>';
    const attrs='="'+escape(id)+'"';
    const buttons=type==='project'?'<button data-plaza-project'+attrs+'>编辑草稿 <span>↗</span></button>'+(session.mode==='play'?'<button class="secondary" data-resume-project'+attrs+'>继续游玩</button>':''):'<button data-plaza-'+type+attrs+'>开始游玩 <span>↗</span></button><button class="secondary" data-edit-'+type+attrs+'>编辑游戏</button>';
    return '<article class="plaza-card"><div class="plaza-art">'+art+'</div><div class="plaza-card-body"><h2>'+escape(session.name)+'</h2><p>'+escape(session.meta?.description||'自由摆放，随时开始。')+'</p><div class="plaza-card-meta">'+escape([session.meta?.players,session.meta?.duration].filter(Boolean).join(' · '))+'</div><div class="plaza-card-actions">'+buttons+'</div>'+(type==='exhibit'?'<button class="unlist-exhibit" data-unlist'+attrs+'>撤销发布</button>':type==='project'?'<button class="delete-draft" data-delete-draft'+attrs+'>删除草稿</button>':'')+'</div></article>';
  }
  function renderCards(){
    const query=$('#plaza-search').value.trim().toLowerCase(),matches=s=>[s.name,s.meta?.description].join(' ').toLowerCase().includes(query),cards=[];
    if(filter==='all'){
      for(const game of examples){if(exhibits.some(e=>libraryName(e.session.name)===libraryName(game.title)))continue;const s=game.create(()=>.5);s.name=game.title;if(matches(s))cards.push(card(s,'example',game.id));}
      for(const entry of exhibits)if(matches(entry.session))cards.push(card(entry.session,'exhibit',entry.id));
    }else for(const entry of projects)if(matches(entry.session))cards.push(card(entry.session,'project',entry.id));
    $('#plaza-grid').innerHTML=cards.join('')||'<div class="plaza-empty"><h2>'+ (query?'没有找到相关游戏':'还没有本地草稿')+'</h2><p>'+(query?'换个关键词试试。':'新建游戏，或从作品广场编辑游戏。')+'</p></div>';
    document.querySelectorAll('[data-plaza-filter]').forEach(b=>{const active=b.dataset.plazaFilter===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('#plaza-section-title').textContent=filter==='all'?'作品广场':'本地草稿';
    $('#plaza-section-note').textContent=filter==='all'?'选择一个游戏，开始游玩或编辑。':'直接摆放、设置开局，修改自动保存在这里。';
    $('#plaza-project-count').textContent=String(projects.length);
  }
  async function openGame(source,originKey,edit,newExample=false){
    await flush();
    const legacyNames=newExample?[examples.find(g=>g.id===source.gameId)?.create(()=>.5).name].filter(Boolean):[];
    const existing=findLibraryDraft(await projectStore.list(),source,originKey,legacyNames);
    const session=existing?.session||{...structuredClone(source),projectId:uid(),originKey};
    if(edit){await activate(openEditor(session));return;}
    if(existing?.session.mode==='play'){await activate(session);return;}
    const opening=session.setupProfiles?.length>1?{...session,mode:'play',objects:[],awaitingOpening:true}:startOpening(session);
    await activate(opening,{newExample:!existing&&newExample,chooseProfile:!existing});
  }
  async function run(operation){if(busy)return;busy=true;$('#plaza').setAttribute('aria-busy','true');try{await operation();}catch(error){notify(error.message);}finally{busy=false;$('#plaza').removeAttribute('aria-busy');}}
  const api={
    async show(nextFilter=filter){await flush();filter=nextFilter==='mine'?'mine':'all';$('#app').hidden=true;$('#plaza').hidden=false;$('#plaza-loading').hidden=false;try{[projects,exhibits]=await Promise.all([projectStore.list(),projectStore.exhibits()]);projects.sort((a,b)=>b.updatedAt-a.updatedAt);exhibits.sort((a,b)=>b.publishedAt-a.publishedAt);renderCards();}finally{$('#plaza-loading').hidden=true;}},
    async create(name){await flush();const existing=findLibraryDraft(await projectStore.list(),{name});if(existing){notify('已有同名草稿，已打开原草稿');await activate(openEditor(existing.session));return;}await activate(createProject('custom',name));},
    async import(session){await flush();if(findLibraryDraft(await projectStore.list(),session))throw new Error('本地草稿已有同名游戏，请先修改草稿名称再导入');await activate(openEditor(copyProject(session)));},
    refresh:()=>api.show(filter)
  };
  $('#plaza-search').addEventListener('input',renderCards);
  $('#plaza').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.plazaFilter){filter=b.dataset.plazaFilter;renderCards();return;}
    const d=b.dataset;
    if(d.plazaExample||d.editExample)run(async()=>{const game=examples.find(g=>g.id===(d.plazaExample||d.editExample));const source=createProject(game.id,game.title);await openGame(source,'example:'+game.id,!!d.editExample,true);});
    if(d.resumeProject)run(async()=>{await flush();const entry=await projectStore.get(d.resumeProject);if(!entry)throw new Error('进度未找到');await activate(entry.session);});
    if(d.plazaProject)run(async()=>{await flush();const entry=await projectStore.get(d.plazaProject);if(!entry)throw new Error('草稿未找到');await activate(openEditor(entry.session));});
    if(d.plazaExhibit||d.editExhibit)run(async()=>{const entry=exhibits.find(x=>x.id===(d.plazaExhibit||d.editExhibit));if(!entry)throw new Error('作品未找到');await openGame(entry.session,'exhibit:'+entry.id,!!d.editExhibit);});
    if(d.unlist)confirmRemoval('exhibits',d.unlist);
    if(d.deleteDraft)confirmRemoval('projects',d.deleteDraft);
    if(b.hasAttribute('data-undo-library'))run(async()=>{if(!lastRemoval)return;await projectStore.restore(lastRemoval.kind,lastRemoval.entries);lastRemoval=null;renderNotice();await api.show(filter);notify('已恢复');});
  });
  $('#modal').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
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
