export const libraryName=name=>String(name??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();
export function uniqueLibraryEntries(entries){
  const names=new Map();
  for(const entry of entries){
    const key=libraryName(entry.session.name),previous=names.get(key);
    if(!previous||(entry.updatedAt??entry.publishedAt??0)>(previous.updatedAt??previous.publishedAt??0))names.set(key,entry);
  }
  return [...names.values()];
}
export const nameMatches=(entries,name)=>entries.filter(e=>libraryName(e.session.name)===libraryName(name));
export function exhibitNameConflict(entries,name,replaceId){
  const matches=nameMatches(entries,name);
  return matches.length>0&&!matches.some(e=>e.id===replaceId);
}
export function draftNameConflict(entries,session){
  const own=entries.find(e=>e.id===session.projectId);
  if(own&&libraryName(own.session.name)===libraryName(session.name))return false;
  return nameMatches(entries,session.name).length>0;
}
export function findLibraryDraft(entries,session,originKey,legacyNames=[]){
  return uniqueLibraryEntries(entries).find(e=>e.id===session.projectId)
    ||uniqueLibraryEntries(entries).find(e=>libraryName(e.session.name)===libraryName(session.name))
    ||uniqueLibraryEntries(entries).find(e=>originKey&&e.session.originKey===originKey)
    ||uniqueLibraryEntries(entries).find(e=>e.session.gameId===session.gameId&&legacyNames.some(name=>libraryName(e.session.name)===libraryName(name)));
}
