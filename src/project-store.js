import {draftNameConflict,exhibitNameConflict,nameMatches,uniqueLibraryEntries} from './library.js';
const databases=new Map(),PLAY_DATABASE='tablecraft.play-sessions';
function openDatabase(name='tablecraft.projects'){
  if(databases.has(name))return databases.get(name);
  const pending=new Promise((resolve,reject)=>{
    let settled=false,request;
    const fail=message=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error(message));};
    const timer=setTimeout(()=>fail('本地存档读取超时，请关闭该游戏的其他标签页后重试'),10000);
    // Opening the current version avoids an upgrade lock held by older tabs.
    try{request=indexedDB.open(name);}catch{fail('无法打开本地存档，请检查浏览器的存储权限后重试');return;}
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const store of name===PLAY_DATABASE?['sessions']:['projects','exhibits'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id'});
    };
    request.onsuccess=()=>{
      const db=request.result;if(settled){db.close();return;}
      settled=true;clearTimeout(timer);
      const forget=()=>{if(databases.get(name)===pending)databases.delete(name);};
      db.onversionchange=()=>{db.close();forget();};db.onclose=forget;
      resolve(db);
    };
    request.onblocked=()=>fail('本地存档被其他页面占用，请关闭该游戏的其他标签页后重试');
    request.onerror=()=>fail('无法打开本地项目库，请检查浏览器的存储权限后重试');
  });
  databases.set(name,pending);
  pending.catch(()=>{if(databases.get(name)===pending)databases.delete(name);});
  return pending;
}
async function transaction(store,mode,operation,databaseName){
  const db=await openDatabase(databaseName);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),request=operation(tx.objectStore(store));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('本地项目保存失败，请导出备份'));
  });
}
export const projectStore={
  async save(session){
    if(session.playOriginKey){
      if(session.awaitingOpening)return;
      return transaction('sessions','readwrite',store=>store.put({id:session.playOriginKey,updatedAt:session.updatedAt||Date.now(),session}),PLAY_DATABASE);
    }
    return writeUnique('projects',session);
  },
  async getPlay(originKey){
    const saved=await transaction('sessions','readonly',store=>store.get(originKey),PLAY_DATABASE);
    if(saved)return saved;
    // Preserve progress written by the earlier version-two project database.
    const db=await openDatabase();if(!db.objectStoreNames.contains('playSessions'))return;
    const legacy=await transaction('playSessions','readonly',store=>store.get(originKey));
    if(legacy)await transaction('sessions','readwrite',store=>store.put(legacy),PLAY_DATABASE);
    return legacy;
  },
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
