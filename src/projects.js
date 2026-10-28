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
  gameFor(session.gameId)?.prepareSession?.(session);
  session.initialSetup||=gameFor(session.gameId)?.create(()=>.5).initialSetup||captureSetup(session);
  const provider=gameFor(session.gameId);
  if(!session.setupProfiles&&provider?.openingProfiles){
    session.setupProfiles=provider.openingProfiles(session);
    session.activeSetupProfileId=provider.openingProfileId(session);
    const active=session.setupProfiles.find(p=>p.id===session.activeSetupProfileId);
    if(active)active.setup=structuredClone(session.setup||session.initialSetup);
  }
  delete session.blank;
  return validateSession(session);
}

export function createProject(templateId,name){
  const state=gameFor(templateId)?.create()||createSession(name||'未命名游戏');
  if(name)state.name=name;
  return migrateSession(state);
}

export function copyProject(session,{fromSetup=false}={}){
  const copy=migrateSession(session);
  copy.projectId=uid();copy.createdAt=Date.now();copy.updatedAt=Date.now();
  delete copy.archived;
  if(fromSetup){copy.name=`${copy.name.slice(0,90)} · 副本`;if(copy.setupProfiles?.length>1)return {...copy,mode:'play',objects:[],awaitingOpening:true};return startOpening(copy,copy.activeSetupProfileId);}
  return copy;
}

// The edited table itself is the opening; play progress never replaces it.
export function saveEditorDraft(session){
  const draft=structuredClone(session);
  if(draft.mode==='edit'){
    delete draft.awaitingOpening;
    const previous=draft.setup||draft.initialSetup;
    for(const o of draft.objects){
      if(o.type==='deck')o.setupKey||=uid();
      if(o.type==='deck'&&o.setupOrder===undefined&&!previous?.randomizeCards)o.setupOrder=previous?.shuffleDecks?'shuffle':'fixed';
      if(['card','deck','token','die'].includes(o.type))o.setupFace??=o.type==='die'&&previous?.rollDice?'random':'fixed';
    }
    const active=draft.setupProfiles?.find(p=>p.id===draft.activeSetupProfileId);
    draft.setup=captureSetup(draft,{name:active?.name||draft.name,randomizeCards:previous?.randomizeCards||false});
    if(active)active.setup=structuredClone(draft.setup);
    delete draft.setupDraft;
  }
  return validateSession(draft);
}

export function openEditor(session){
  const draft=migrateSession(session);
  if(draft.mode==='play')draft.objects=editorObjects(draft.setupProfiles?.find(p=>p.id===draft.activeSetupProfileId)?.setup||draft.setup||draft.initialSetup);
  draft.mode='edit';
  delete draft.awaitingOpening;
  return draft;
}

const editorObjects=setup=>setup.objects.map(o=>({...structuredClone(o),id:uid()}));
export function addSetupProfile(session,name){
  if(typeof name!=='string'||!name.trim()||name.length>100)throw new Error('请填写 1–100 字的角色方案名称');
  const draft=saveEditorDraft(session);
  if(!draft.setupProfiles){const id=uid();draft.setupProfiles=[{id,name:'默认开局',setup:structuredClone(draft.setup||draft.initialSetup)}];draft.activeSetupProfileId=id;}
  if(draft.setupProfiles.length>=64)throw new Error('最多保存 64 个角色开局方案');
  if(draft.setupProfiles.some(p=>p.name===name.trim()))throw new Error('这个角色方案名称已存在');
  const active=draft.setupProfiles.find(p=>p.id===draft.activeSetupProfileId);
  const profile={...structuredClone(active),id:uid(),name:name.trim(),setup:{...structuredClone(draft.setup||draft.initialSetup),name:name.trim()}};
  draft.setupProfiles.push(profile);draft.activeSetupProfileId=profile.id;draft.setup=structuredClone(profile.setup);draft.mode='edit';draft.objects=editorObjects(profile.setup);
  return validateSession(draft);
}
export function switchSetupProfile(session,id){
  const draft=session.mode==='edit'?saveEditorDraft(session):migrateSession(session),profile=draft.setupProfiles?.find(p=>p.id===id);
  if(!profile)throw new Error('角色开局方案不存在');
  draft.activeSetupProfileId=id;draft.setup=structuredClone(profile.setup);draft.objects=editorObjects(profile.setup);draft.mode='edit';
  return validateSession(draft);
}
export function renameSetupProfile(session,name){
  if(typeof name!=='string'||!name.trim()||name.length>100)throw new Error('请填写 1–100 字的角色方案名称');
  const draft=saveEditorDraft(session),profile=draft.setupProfiles?.find(p=>p.id===draft.activeSetupProfileId);
  if(!profile)throw new Error('请先创建角色开局方案');
  if(draft.setupProfiles.some(p=>p.id!==profile.id&&p.name===name.trim()))throw new Error('这个角色方案名称已存在');
  profile.name=name.trim();profile.setup.name=name.trim();draft.setup.name=name.trim();return validateSession(draft);
}
export function updateSetupProfile(session,{name,coverAssetId,description}){
  const draft=renameSetupProfile(session,name),profile=draft.setupProfiles.find(p=>p.id===draft.activeSetupProfileId);
  if(coverAssetId!==undefined&&coverAssetId!==''&&!draft.assets.some(a=>a.id===coverAssetId&&a.type==='card'))throw new Error('请选择有效的卡牌封面');
  if(typeof description!=='string'||description.length>300)throw new Error('开局说明最多 300 字');
  if(coverAssetId===undefined)delete profile.coverAssetId;else profile.coverAssetId=coverAssetId;
  profile.description=description.trim();
  return validateSession(draft);
}
export function removeSetupProfile(session){
  const draft=saveEditorDraft(session);if(!draft.setupProfiles||draft.setupProfiles.length<2)throw new Error('请至少保留一个开局方案');
  draft.setupProfiles=draft.setupProfiles.filter(p=>p.id!==draft.activeSetupProfileId);
  const next=draft.setupProfiles[0];draft.activeSetupProfileId=next.id;draft.setup=structuredClone(next.setup);draft.objects=editorObjects(next.setup);
  return validateSession(draft);
}
export function startOpening(session,profileId=session.activeSetupProfileId,random=Math.random){
  const draft=session.mode==='edit'?saveEditorDraft(session):migrateSession(session);
  const profile=draft.setupProfiles?.find(p=>p.id===profileId);
  if(draft.setupProfiles&&!profile)throw new Error('请选择角色开局方案');
  if(profile){draft.activeSetupProfileId=profile.id;draft.setup=structuredClone(profile.setup);}
  delete draft.awaitingOpening;
  return {...applySetup(draft,draft.setup||draft.initialSetup,random),mode:'play'};
}

export function makeExhibit(session){
  const valid=validateSession(session);
  if(!valid.setup&&!valid.initialSetup?.objects.length)throw new Error('请先在初始设置中保存一个开局，再展示作品');
  const snapshot=structuredClone(valid);
  delete snapshot.setupDraft;
  delete snapshot.awaitingOpening;
  const setup=snapshot.setup||snapshot.initialSetup;
  // Exhibitions represent the authored opening, never a half-played game.
  snapshot.objects=setup.objects.map(o=>({...structuredClone(o),id:uid()}));
  snapshot.mode='play';
  return {id:valid.projectId,publishedAt:Date.now(),session:snapshot};
}
