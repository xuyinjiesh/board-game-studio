import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryName,uniqueLibraryEntries,findLibraryDraft,draftNameConflict,nameMatches,exhibitNameConflict} from '../src/library.js';
const entry=(id,name,time=1,originKey)=>({id,updatedAt:time,session:{projectId:id,name,originKey}});
test('each list keeps the newest entry per normalized name without discarding source data',()=>{
  const all=[entry('old','桌游 A',1),entry('other','桌游 B',2),entry('latest',' 桌游  A ',3)];
  const before=structuredClone(all),unique=uniqueLibraryEntries(all);
  assert.equal(unique.length,2);assert.equal(unique.find(e=>libraryName(e.session.name)==='桌游 a').id,'latest');
  assert.deepEqual(all,before);
  assert.equal(libraryName('ＡＢＣ'),'abc');
  assert.equal(uniqueLibraryEntries([{...entry('a','A'),updatedAt:undefined,publishedAt:1},{...entry('b','a'),updatedAt:undefined,publishedAt:2}])[0].id,'b');
});
test('opening the same gallery game reuses the draft by identity, name, or remembered source',()=>{
  const draft=entry('draft','新名称',2,'example:grove');
  assert.equal(findLibraryDraft([draft],{name:'新名称'}),draft);
  assert.equal(findLibraryDraft([draft],{name:'旧名称'},'example:grove'),draft);
  assert.equal(findLibraryDraft([draft],{name:'导出使用的名字',projectId:'draft'}),draft);
  assert.equal(findLibraryDraft([draft],{name:'完全不同的游戏'}),undefined);
  const legacy=entry('legacy','果丛 · 我的桌面');legacy.session.gameId='grove';
  assert.equal(findLibraryDraft([legacy],{name:'果丛',gameId:'grove'},'example:grove',['果丛 · 我的桌面']),legacy);
});
test('new and renamed drafts cannot overwrite a different draft with the same name',()=>{
  const all=[entry('one','A'),entry('two','B'),entry('legacy','A',0)];
  assert.equal(draftNameConflict(all,{projectId:'one',name:' A '}),false);
  assert.equal(draftNameConflict(all,{projectId:'new',name:'a'}),true);
  assert.equal(draftNameConflict(all,{projectId:'two',name:'A'}),true);
  assert.equal(draftNameConflict(all,{projectId:'new',name:'C'}),false);
  // Re-exporting the same project is still a name collision and must be confirmed.
  assert.equal(nameMatches(all,'a').length,2);
});
test('export requires explicit confirmation for an existing name, including the same project',()=>{
  const all=[entry('same-project','A'),entry('legacy',' a ')];
  assert.equal(exhibitNameConflict(all,'A'),true);
  assert.equal(exhibitNameConflict(all,'A','wrong-project'),true);
  assert.equal(exhibitNameConflict(all,'A','same-project'),false);
  assert.equal(exhibitNameConflict(all,'new name'),false);
  assert.equal(exhibitNameConflict([],'A'),false);
});
