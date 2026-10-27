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
  save:session=>transaction('projects','readwrite',store=>store.put({id:session.projectId,updatedAt:session.updatedAt||Date.now(),session})),
  get:id=>transaction('projects','readonly',store=>store.get(id)),
  async archive(id,archived){const entry=await this.get(id);if(!entry)throw new Error('项目未找到');entry.session.archived=archived;await this.save(entry.session);},
  list:()=>transaction('projects','readonly',store=>store.getAll()),
  exhibit:entry=>transaction('exhibits','readwrite',store=>store.put(entry)),
  exhibits:()=>transaction('exhibits','readonly',store=>store.getAll()),
  unlist:id=>transaction('exhibits','readwrite',store=>store.delete(id))
};
