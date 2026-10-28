import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sharedDice,sharedTokens,sharedDieImage} from '../src/shared-assets.js';
import {createSession,baseObject,validateSession,createFixedPile} from '../src/model.js';
import {saveEditorDraft,openEditor,startOpening} from '../src/projects.js';
test('shared art resolves to bundled PNGs and six distinct faces per die',async()=>{
 const paths=[...sharedDice.flatMap(d=>d.images),...sharedTokens.map(t=>t.image)];
 assert.equal(new Set(sharedTokens.map(t=>t.kind)).size,36);
 for(const d of sharedDice){assert.equal(new Set(d.images).size,6);for(const v of d.faces)assert.ok(sharedDieImage(d.skin,v));}
 assert.equal(sharedDieImage('../unsafe',1),undefined);
 for(const path of paths){const png=await readFile(new URL('../public'+path,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');}
});
test('shared components preserve artwork and gameplay through openings and JSON import',()=>{
 let s=createSession();s.objects=[...sharedDice.map(d=>({...baseObject('die',0,0),color:d.color,skin:d.skin,faces:d.faces,value:5})),...sharedTokens.map(t=>({...baseObject('token',60,0),kind:t.kind,color:t.color,name:t.name})),createFixedPile(120,0)];
 s=saveEditorDraft(s);s=validateSession(JSON.parse(JSON.stringify(s)));const play=startOpening(s);const edit=openEditor(play);
 const withoutIds=objects=>objects.map(({id,...o})=>o);assert.deepEqual(withoutIds(edit.objects),withoutIds(s.objects));assert.equal(edit.assets.length,0);
 const invalid=structuredClone(s);invalid.objects[0].skin='../../unsafe';assert.throws(()=>validateSession(invalid),/骰子外观/);
});
