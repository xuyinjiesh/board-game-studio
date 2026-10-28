import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sharedDice,sharedTokens,sharedDieImage} from '../src/shared-assets.js';
import {createSession,baseObject,rollDieValue,validateSession,createFixedPile} from '../src/model.js';
import {saveEditorDraft,openEditor,startOpening} from '../src/projects.js';
test('shared art resolves to bundled images and one distinct image per die face',async()=>{
 const paths=[...sharedDice.flatMap(d=>d.images),...sharedTokens.map(t=>t.image)];
 assert.equal(new Set(sharedTokens.map(t=>t.kind)).size,36);
 for(const d of sharedDice){assert.equal(new Set(d.images).size,d.faces.length);for(const v of d.faces)assert.ok(sharedDieImage(d.skin,v));}
 assert.equal(sharedDieImage('../unsafe',1),undefined);
 for(const path of paths){const png=await readFile(new URL('../public'+path,import.meta.url));if(path.endsWith('.svg'))assert.match(png.toString(),/^<svg/);else assert.equal(png.subarray(1,4).toString(),'PNG');}
});
test('shared components preserve artwork and gameplay through openings and JSON import',()=>{
 let s=createSession();s.objects=[...sharedDice.map(d=>({...baseObject('die',0,0),color:d.color,skin:d.skin,faces:d.faces,value:5})),...sharedTokens.map(t=>({...baseObject('token',60,0),kind:t.kind,color:t.color,name:t.name})),createFixedPile(120,0)];
 s=saveEditorDraft(s);s=validateSession(JSON.parse(JSON.stringify(s)));const play=startOpening(s);const edit=openEditor(play);
 const withoutIds=objects=>objects.map(({id,...o})=>o);assert.deepEqual(withoutIds(edit.objects),withoutIds(s.objects));assert.equal(edit.assets.length,0);
 const invalid=structuredClone(s);invalid.objects[0].skin='../../unsafe';assert.throws(()=>validateSession(invalid),/骰子外观/);
});

test('the twelve-sided die rolls every face and validates through saved openings',()=>{
 const template=sharedDice.find(d=>d.id==='d12-sand');
 const s=createSession();s.objects=[{...baseObject('die',300,400),skin:template.skin,color:template.color,faces:[...template.faces],value:12}];
 const die=s.objects[0];
 assert.deepEqual(Array.from({length:12},(_,i)=>rollDieValue(die,()=>(i+.5)/12)),[1,2,3,4,5,6,7,8,9,10,11,12]);
 assert.equal(validateSession(JSON.parse(JSON.stringify(s))).objects[0].value,12);
 const invalid=structuredClone(s);invalid.objects[0].value=13;assert.throws(()=>validateSession(invalid),/骰子数据/);
 invalid.objects[0].value=12;invalid.objects[0].skin='kenney-white';assert.throws(()=>validateSession(invalid),/骰子外观/);
});
