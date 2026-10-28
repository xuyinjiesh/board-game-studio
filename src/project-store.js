import {draftNameConflict,exhibitNameConflict,nameMatches,uniqueLibraryEntries} from './library.js';
let database;
function openDatabase(){
  return database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('tablecraft.projects',1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore('projects',{keyPath:'id'});
      db.createObjectStore('exhibits',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('无法打开本地项目库，请导出桌面备份'));
  });
}
async function transaction(store,mode,operation){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),request=operation(tx.objectStore(store));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('本地项目保存失败，请导出备份'));
  });
}
export const projectStore={
  async save(session){return writeUnique('projects',session);},
  get:id=>transaction('projects','readonly',store=>store.get(id)),
  async archive(id,archived){const entry=await this.get(id);if(!entry)throw new Error('项目未找到');entry.session.archived=archived;await this.save(entry.session);},
  async list(){return uniqueLibraryEntries(await transaction('projects','readonly',store=>store.getAll()));},
  exhibit:(entry,options)=>writeUnique('exhibits',entry,options),
  async exhibits(){return uniqueLibraryEntries(await transaction('exhibits','readonly',store=>store.getAll()));},
  removeDraft:id=>removeNamedEntries('projects',id),
  unlist:id=>removeNamedEntries('exhibits',id),
  restore:(kind,entries)=>restoreEntries(kind,entries)
};

async function removeNamedEntries(kind,id){
  const db=await openDatabase();return new Promise((resolve,reject)=>{
    const tx=db.transaction(kind,'readwrite'),store=tx.objectStore(kind),request=store.getAll();let removed=[];
    request.onsuccess=()=>{const entry=request.result.find(e=>e.id===id);if(entry){removed=nameMatches(request.result,entry.session.name);for(const duplicate of removed)store.delete(duplicate.id);}};
    tx.oncomplete=()=>resolve(removed);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('操作失败，请重试'));
  });
}
async function restoreEntries(kind,entries){
  if(!['projects','exhibits'].includes(kind)||!Array.isArray(entries)||!entries.length)throw new Error('没有可恢复的记录');
  const db=await openDatabase();return new Promise((resolve,reject)=>{
    const tx=db.transaction(kind,'readwrite'),store=tx.objectStore(kind),request=store.getAll();let failure;
    request.onsuccess=()=>{
      if(entries.some(e=>request.result.some(current=>current.id===e.id)||nameMatches(request.result,e.session.name).length)){
        failure=new Error('已有同名游戏，请先为它改名，再撤销本次操作');tx.abort();return;
      }
      for(const entry of entries)store.put(entry);
    };
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('恢复失败，请重试'));
  });
}

async function writeUnique(kind,value,{replaceId}={}){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(kind,'readwrite'),store=tx.objectStore(kind),request=store.getAll();let failure;
    request.onsuccess=()=>{
      const entries=request.result,session=kind==='projects'?value:value.session;
      const conflicts=nameMatches(entries,session.name);
      if(kind==='projects'?draftNameConflict(entries,session):exhibitNameConflict(entries,session.name,replaceId)){
        failure=Object.assign(new Error(kind==='projects'?'本地草稿已有同名游戏，请修改名称后保存':'广场已有同名游戏，请确认覆盖或改名导出'),{code:kind==='projects'?'DRAFT_NAME_CONFLICT':'EXHIBIT_NAME_CONFLICT'});tx.abort();return;
      }
      if(kind==='exhibits'){
        // Only an explicitly confirmed replacement may remove another entry.
        for(const entry of conflicts)store.delete(entry.id);
        store.put(value);
      }else store.put({id:session.projectId,updatedAt:session.updatedAt||Date.now(),session});
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('保存失败，请重试'));
  });
}
