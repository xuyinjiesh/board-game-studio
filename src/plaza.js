import {examples,createProject,copyProject} from './projects.js';
import {projectStore} from './project-store.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=selector=>document.querySelector(selector);
export function createPlaza({flush,activate,notify}){
  let filter='all',projects=[],exhibits=[],busy=false;
  const featured=examples[0],featuredSession=featured?.create(()=>.5);
  if(featuredSession){const front=featuredSession.assets[0],back=featuredSession.assets[2];$('#plaza-featured').innerHTML=`<div class="hero-orbit"></div><img class="hero-card hero-card-back" src="${escape(back.back||back.front)}" alt="${escape(back.name)}"><img class="hero-card hero-card-front" src="${escape(front.front)}" alt="${escape(front.name)}"><div class="hero-caption"><span>01 / THE FIRST TABLE</span><strong>${escape(featured.title)} <small>${escape(featured.subtitle)}</small></strong><p>${escape(featured.tagline)}</p></div><span class="hero-star">✳</span>`;}
  function cover(session,example=false){
    const cards=session.assets.filter(a=>a.type==='card').slice(0,3);
    if(cards.length)return `<div class="plaza-art ${example?'example-art':''}">${cards.map(a=>`<img src="${escape(a.front)}" alt="${escape(a.name)}" loading="lazy">`).join('')}</div>`;
    const image=session.assets.find(a=>a.type==='board'||a.type==='token');
    return image?`<div class="plaza-art single-art"><img src="${escape(image.front)}" alt="${escape(image.name)}"></div>`:'<div class="plaza-art empty-art"><span>◇</span><i>YOUR NEXT GAME</i></div>';
  }
  function card(session,type,id){
    const label={example:'示例游戏',project:'我的项目',exhibit:'本地作品',archived:'已归档项目'}[type];
    const action={example:'从示例开始',project:'继续项目',exhibit:'打开游玩副本',archived:'恢复项目'}[type];
    return `<article class="plaza-card">${cover(session,type==='example')}<div class="plaza-card-body"><div class="plaza-card-kicker"><span>${label}</span><span>${session.assets.length} 份资产</span></div><h3>${escape(session.name)}</h3><p>${escape(session.meta?.description||'一张桌面，一场等待开始的游戏。')}</p><div class="plaza-card-meta"><span>${escape(session.meta?.players||'自由人数')}</span><i>·</i><span>${escape(session.meta?.duration||'自由时长')}</span></div><button data-plaza-${type}="${escape(id)}">${action}<span>↗</span></button>${type==='exhibit'?`<button class="unlist-exhibit" data-unlist="${escape(id)}">撤下展示</button>`:type==='project'?`<button class="unlist-exhibit" data-archive="${escape(id)}">归档项目</button>`:''}</div></article>`;
  }
  function renderCards(){
    const query=$('#plaza-search').value.trim().toLowerCase();
    $('.plaza-hero').hidden=filter!=='all'||!!query;
    const matches=s=>[s.name,s.meta?.description].join(' ').toLowerCase().includes(query);
    const cards=[];
    if(filter==='all'||filter==='examples')for(const game of examples){const s=game.create(()=>.5);s.name=game.title;if(matches(s))cards.push(card(s,'example',game.id));}
    if(filter==='all'||filter==='exhibits')for(const entry of exhibits)if(matches(entry.session))cards.push(card(entry.session,'exhibit',entry.id));
    if(filter==='mine'||filter==='archived')for(const entry of projects)if(!!entry.session.archived===(filter==='archived')&&matches(entry.session))cards.push(card(entry.session,filter==='archived'?'archived':'project',entry.id));
    $('#plaza-grid').innerHTML=cards.join('')||(query?'<div class="plaza-empty"><span>⌕</span><h3>还没有找到这个游戏</h3><p>试试其他名称，或创建自己的项目。</p></div>':`<div class="plaza-empty"><span>◇</span><h3>${filter==='mine'?'第一张桌面，等你开始。':'把你的第一部作品摆上来。'}</h3><p>${filter==='mine'?'新建一个项目，导入素材，再编写开局。':'在编辑界面保存初始设置，再选择「展示到广场」。'}</p></div>`);
    $('#plaza-result-count').textContent=`${cards.length} ${filter==='mine'||filter==='archived'?'个项目':'个游戏'}`;
    document.querySelectorAll('[data-plaza-filter]').forEach(b=>{const active=b.dataset.plazaFilter===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('#plaza-section-title').textContent={all:'值得摆上桌的好游戏',examples:'从一个例子开始',exhibits:'你的作品，在这里相遇',mine:'每个灵感，都有一张桌面',archived:'暂时收好的灵感'}[filter];
    $('#plaza-project-count').textContent=String(projects.filter(p=>!p.session.archived).length);
  }
  async function run(operation){
    if(busy)return;busy=true;$('#plaza').setAttribute('aria-busy','true');
    try{await operation();}catch(error){notify(error.message);}finally{busy=false;$('#plaza').removeAttribute('aria-busy');}
  }
  const api={
    async show(nextFilter=filter){
      await flush();filter=nextFilter;
      $('#app').hidden=true;$('#plaza').hidden=false;
      $('#plaza-loading').hidden=false;
      try{[projects,exhibits]=await Promise.all([projectStore.list(),projectStore.exhibits()]);projects.sort((a,b)=>b.updatedAt-a.updatedAt);exhibits.sort((a,b)=>b.publishedAt-a.publishedAt);renderCards();}
      finally{$('#plaza-loading').hidden=true;}
    },
    async create(name){await flush();await activate(createProject('custom',name));},
    async import(session){await flush();await activate(copyProject(session));},
    refresh:()=>api.show(filter)
  };
  $('#plaza-search').addEventListener('input',renderCards);
  $('#plaza').addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.plazaFilter){filter=button.dataset.plazaFilter;renderCards();return;}
    if(button.dataset.plazaExample)run(async()=>{await flush();await activate(createProject(button.dataset.plazaExample),{newExample:true});});
    if(button.dataset.plazaProject)run(async()=>{await flush();const entry=await projectStore.get(button.dataset.plazaProject);if(!entry)throw new Error('项目未找到');await activate(entry.session);});
    if(button.dataset.plazaExhibit)run(async()=>{await flush();const entry=exhibits.find(x=>x.id===button.dataset.plazaExhibit);if(!entry)throw new Error('作品未找到');await activate(copyProject(entry.session,{fromSetup:true}));});
    if(button.dataset.unlist)run(async()=>{await projectStore.unlist(button.dataset.unlist);await api.show(filter);notify('已撤下展示，原项目仍保留在我的工坊');});
    if(button.dataset.archive)run(async()=>{await projectStore.archive(button.dataset.archive,true);await api.show(filter);notify('已归档，可在「已归档」中恢复');});
    if(button.dataset.plazaArchived)run(async()=>{await projectStore.archive(button.dataset.plazaArchived,false);await api.show('mine');notify('项目已恢复');});
  });
  return api;
}
