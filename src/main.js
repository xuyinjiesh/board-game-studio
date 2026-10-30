import {createPlaza} from './plaza.js';
import {projectStore} from './project-store.js';
import {notify} from './notify.js';
import {bindModalControls} from './modal-controls.js';

bindModalControls(document.querySelector('#modal'));

let workspace,loading;
const loadWorkspace=()=>loading??=import('./app.js').then(module=>{
  workspace=module;module.connectPlaza(plaza);return module;
}).catch(error=>{loading=null;throw error;});
const plaza=createPlaza({
  flush:()=>workspace?.saveNow(),
  activate:async(session,options)=>{
    const {prepareSession}=await import('./project-session.js');
    const prepared=await prepareSession(session);
    return (await loadWorkspace()).activateSession(prepared,options);
  },
  forgetDraft:ids=>workspace?.forgetDraft(ids),notify
});

document.addEventListener('click',async event=>{
  if(workspace)return;
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='import-session'){document.querySelector('#session-input').click();return;}
  if(action!=='new-project')return;
  try{(await loadWorkspace()).runAction(action);}catch(error){notify(error.message);}
});

document.querySelector('#session-input').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{
    if(file.size>50*1024*1024)throw new Error('存档请小于 50 MB');
    const {prepareSession}=await import('./project-session.js');
    await plaza.import(await prepareSession(JSON.parse(await file.text())));
    notify('项目已导入，原项目也会保留');
  }catch(error){notify(`无法载入：${error.message}`);}
});

async function initialize(){
  try{
    try{
      const recovery=localStorage.getItem('tablecraft.recovery.v2');
      if(recovery){
        const {prepareSession}=await import('./project-session.js'),recovered=await prepareSession(JSON.parse(recovery));
        const record=await (recovered.playOriginKey?projectStore.getPlay(recovered.playOriginKey):projectStore.get(recovered.projectId));
        if(!record||recovered.updatedAt>record.updatedAt)await projectStore.save(recovered);
        localStorage.removeItem('tablecraft.recovery.v2');
      }
    }catch(error){notify(`恢复存档未能读取，原文件已保留：${error.message}`);}
    try{
      const legacy=localStorage.getItem('tablecraft.workspace.v1');
      if(legacy&&!localStorage.getItem('tablecraft.legacy-migrated')){
        const {prepareSession}=await import('./project-session.js');
        await projectStore.save(await prepareSession(JSON.parse(legacy)));localStorage.setItem('tablecraft.legacy-migrated','yes');
      }
    }catch(error){notify(`旧桌面未能迁移，原存档已保留：${error.message}`);}
    await plaza.show('all');
  }catch(error){notify(`本地项目库未能读取：${error.message}`);}
}
initialize();
