import {createSession,validateSession,captureSetup,applySetup,uid} from './model.js';
import {grove,builtinAssets} from './games/grove.js';
import {ironHelm} from './games/iron-helm.js';

export const examples=[grove,ironHelm];
export const gameFor=id=>examples.find(game=>game.id===id);

// Old workspaces had an implicit shared Grove asset library. Make it explicit
// once, preserving every placed piece, custom image, and setup.
export function migrateSession(raw){
  const session=structuredClone(raw);
  if(!session.gameId){
    session.gameId=session.blank?'custom':'grove';
    const references=objects=>(objects||[]).flatMap(o=>o.type==='deck'?o.cards:o.assetId?[o.assetId]:[]);
    const referenced=new Set([...references(session.objects),...references(session.setup?.objects)]);
    const known=new Set(session.assets?.map(a=>a.id));
    session.assets=[...builtinAssets.filter(a=>!known.has(a.id)&&(session.gameId==='grove'||referenced.has(a.id))),...(session.assets||[])];
  }
  session.projectId||=uid();
  session.meta||={description:'',players:'',duration:'',rules:''};
  session.initialSetup||=gameFor(session.gameId)?.create(()=>.5).initialSetup||captureSetup(session);
  delete session.blank;
  return validateSession(session);
}

export function createProject(templateId,name){
  const state=gameFor(templateId)?.create()||createSession(name||'未命名游戏');
  if(name)state.name=name;
  return state;
}

export function copyProject(session,{fromSetup=false}={}){
  const copy=migrateSession(session);
  copy.projectId=uid();copy.createdAt=Date.now();copy.updatedAt=Date.now();
  delete copy.archived;
  if(fromSetup){copy.name=`${copy.name.slice(0,90)} · 副本`;return applySetup(copy,copy.setup||copy.initialSetup);}
  return copy;
}

export function makeExhibit(session){
  const valid=validateSession(session);
  if(!valid.setup&&!valid.initialSetup?.objects.length)throw new Error('请先在初始设置中保存一个开局，再展示作品');
  const snapshot=structuredClone(valid);
  delete snapshot.setupDraft;
  const setup=snapshot.setup||snapshot.initialSetup;
  // Exhibitions represent the authored opening, never a half-played game.
  snapshot.objects=setup.objects.map(o=>({...structuredClone(o),id:uid()}));
  snapshot.mode='play';
  return {id:valid.projectId,publishedAt:Date.now(),session:snapshot};
}
