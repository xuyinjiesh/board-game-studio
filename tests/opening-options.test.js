import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,openEditor,updateSetupProfile,saveEditorDraft,startOpening,migrateSession,makeExhibit,copyProject,addSetupProfile} from '../src/projects.js';
import {validateSession} from '../src/model.js';
import {openingChoicesHTML} from '../src/opening-editor.js';

test('edited opening choices match play choices and persist through save, import and sharing',()=>{
  let s=openEditor(createProject('iron-helm'));
  s.objects.find(o=>o.kind==='ih-health').value=7;
  s.objects.find(o=>o.ihRole==='hero').cards=['ih-hero-4'];
  s=updateSetupProfile(s,{name:'自定义冒险者',coverAssetId:'ih-hero-3',description:'带上火把\n深入地城'});
  const saved=migrateSession(JSON.parse(JSON.stringify(saveEditorDraft(s))));
  for(const state of [saved,copyProject(makeExhibit(saved).session)]){
    const edit=openingChoicesHTML(state,{editing:true}),play=openingChoicesHTML(state);
    for(const html of [edit,play]){
      assert.ok(html.includes('自定义冒险者'));assert.ok(html.includes('/assets/iron-helm/hero-3.webp'));
      assert.doesNotMatch(html,/生命 |能量 /);assert.ok(html.includes('带上火把\n深入地城'));
    }
    const played=startOpening(state);
    assert.equal(played.objects.find(o=>o.kind==='ih-health').value,7);
    assert.equal(played.objects.find(o=>o.ihRole==='hero').cards.at(-1),'ih-hero-4');
    assert.deepEqual(played.setupProfiles,state.setupProfiles);
  }
  const copy=addSetupProfile(saved,'复制角色');
  assert.equal(copy.setupProfiles.at(-1).coverAssetId,'ih-hero-3');
  assert.equal(copy.setupProfiles.at(-1).description,'带上火把\n深入地城');
});

test('automatic and hidden covers work and invalid metadata cannot overwrite the draft',()=>{
  const s=openEditor(createProject('iron-helm')),before=structuredClone(s);
  assert.throws(()=>updateSetupProfile(s,{name:'角色',coverAssetId:'missing',description:''}));
  assert.throws(()=>updateSetupProfile(s,{name:'角色',description:'x'.repeat(301)}));
  assert.deepEqual(s,before);
  const hidden=updateSetupProfile(s,{name:'角色',coverAssetId:'',description:'<script>'});
  assert.equal(hidden.setupProfiles[0].coverAssetId,'');
  assert.doesNotMatch(openingChoicesHTML({...hidden,setupProfiles:[hidden.setupProfiles[0]]}),/<img/);
  assert.match(openingChoicesHTML(hidden),/&lt;script&gt;/);
  const auto=updateSetupProfile(hidden,{name:'角色',description:''});
  assert.equal(auto.setupProfiles[0].coverAssetId,undefined);
  assert.match(openingChoicesHTML(auto),/hero-1.webp/);
  const corrupt=structuredClone(s);corrupt.setupProfiles[0].coverAssetId='ih-playmat';
  assert.throws(()=>validateSession(corrupt));
});
