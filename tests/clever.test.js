import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {assetHTML} from '../src/asset-url.js';
import {validateSession} from '../src/model.js';
import {createProject,startOpening,migrateSession,openEditor,saveEditorDraft,copyProject} from '../src/projects.js';
import {clever,createCleverSession,CLEVER_SHEETS,cleverCells,writeCleverCell,cleverRoll,cleverChoose,cleverPassive,cleverNextRound,cleverScore,cleverBoardOverlay} from '../src/games/clever.js';
import {openingChoicesHTML} from '../src/opening-editor.js';
const board=s=>s.objects.find(o=>o.type==='board');
const dice=s=>s.objects.filter(o=>o.type==='die');
const randomValues=values=>{let i=0;return ()=>((values[i++%values.length]-.5)/6);};
const unchanged=(s,fn)=>{const before=structuredClone(s);assert.throws(fn);assert.deepEqual(s,before);};

test('Clever registers all seven original sheets with the right dice palettes and portable assets',()=>{
  const p=createProject('clever');assert.equal(p.setupProfiles.length,7);
  assert.equal(new Set(p.setupProfiles.map(p=>p.id)).size,7);
  assert.equal(p.activeSetupProfileId,'clever-one');
  for(const sheet of CLEVER_SHEETS){
    const s=startOpening(p,'clever-'+sheet.id);assert.deepEqual(validateSession(s),s);
    assert.equal(board(s).assetId,'clever-'+sheet.id);assert.equal(board(s).locked,true);
    assert.deepEqual(dice(s).map(d=>d.cleverDie),sheet.colors);
    assert.ok(dice(s).every(d=>d.value===1&&d.cleverZone==='pool'));
    assert.deepEqual(board(s).cleverTurn,{round:1,roll:0,phase:'ready',plusUsed:[]});
    assert.equal(board(s).cleverNotes['round-0'],'×');
    const cells=cleverCells(sheet.id);assert.equal(new Set(cells.map(c=>c.key)).size,cells.length);
    assert.ok(cells.length>100);
    assert.ok(cells.every(c=>c.x>0&&c.x<893&&c.y>0&&c.y<1263&&c.w>0&&c.h>0));
    for(const d of dice(s))for(let value=1;value<=6;value++){
      const image=clever.dieImage({...d,value});assert.ok(existsSync(new URL('../public'+image,import.meta.url)));
    }
    assert.ok(cleverBoardOverlay(s,board(s)).includes('data-game-action="clever-cell"'));
  }
  for(const a of p.assets)assert.ok(existsSync(new URL('../public'+a.front,import.meta.url)));
  for(let version=1;version<=4;version++)assert.ok(existsSync(new URL(`../public/assets/clever/rules-${version}-zh.pdf`,import.meta.url)));
  assert.throws(()=>createCleverSession(()=>0,'unknown'));
  assert.equal((openingChoicesHTML(p).match(/<img /g)||[]).length,7);
});

test('paper writing supports crosses, earned/spent resources, zero, large final values, erasing and validation',()=>{
  const s=createCleverSession(),b=board(s);
  writeCleverCell(s,b.id,'yellow-0-0','×');writeCleverCell(s,b.id,'reroll-0','○');
  writeCleverCell(s,b.id,'orange-0','0');writeCleverCell(s,b.id,'orange-1','18');
  assert.equal(b.cleverNotes['orange-0'],'0');assert.equal(b.cleverNotes['orange-1'],'18');
  writeCleverCell(s,b.id,'yellow-0-0','');assert.equal(b.cleverNotes['yellow-0-0'],undefined);
  for(const [id,key,value] of [[b.id,'absent','×'],['absent','orange-0','2'],[b.id,'orange-0','<img>'],[b.id,'orange-0','-1'],[b.id,'orange-0','1.5'],[b.id,'orange-0','1000'],[b.id,'yellow-0-0','5']])
    unchanged(s,()=>writeCleverCell(s,id,key,value));
  s.mode='edit';unchanged(s,()=>writeCleverCell(s,b.id,'orange-0','2'));
});

test('choosing only discards strictly lower dice and never rerolls selected or plated dice',()=>{
  const s=createCleverSession();cleverRoll(s,randomValues([2,3,3,5,6,1]));
  cleverChoose(s,dice(s)[1].id);
  assert.deepEqual(dice(s).map(d=>d.cleverZone),['plate','chosen','pool','pool','pool','plate']);
  const old=dice(s).map(d=>d.value);cleverRoll(s,()=>0);
  assert.deepEqual(dice(s).map(d=>d.value),[old[0],old[1],1,1,1,old[5]]);
  cleverChoose(s,dice(s)[2].id);cleverRoll(s,()=>0);cleverChoose(s,dice(s)[3].id);
  assert.equal(board(s).cleverTurn.roll,3);assert.equal(board(s).cleverTurn.phase,'endActive');
  assert.equal(dice(s).filter(d=>d.cleverZone==='chosen').length,3);
  assert.equal(dice(s).filter(d=>d.cleverZone==='pool').length,0);
  unchanged(s,()=>cleverRoll(s));
});

test('a high die can end active play early and skipped throws still consume one of three rolls',()=>{
  const s=createCleverSession();cleverRoll(s,randomValues([6,1,2,3,4,5]));cleverChoose(s,dice(s)[0].id);
  assert.equal(board(s).cleverTurn.phase,'endActive');assert.equal(board(s).cleverTurn.roll,1);
  assert.equal(dice(s).filter(d=>d.cleverZone==='plate').length,5);
  const skip=createCleverSession();for(let i=0;i<3;i++){cleverRoll(skip,()=>0);clever.act(skip,'clever-skip','');}
  assert.equal(board(skip).cleverTurn.roll,3);assert.equal(board(skip).cleverTurn.phase,'endActive');
  assert.equal(dice(skip).filter(d=>d.cleverZone==='plate').length,6);
});

test('reroll spends a circled reward without increasing the regular roll count',()=>{
  const s=createCleverSession();cleverRoll(s,()=>0);
  unchanged(s,()=>cleverRoll(s,()=>.9,{reroll:true}));
  writeCleverCell(s,board(s).id,'reroll-0','○');cleverRoll(s,()=>.9,{reroll:true});
  assert.equal(board(s).cleverNotes['reroll-0'],'×');assert.equal(board(s).cleverTurn.roll,1);
  assert.ok(dice(s).every(d=>d.value===6));
  unchanged(s,()=>cleverRoll(s,()=>0,{reroll:true}));
});

test('passive phase rolls six dice, exposes the lowest three and uses distance to break ties',()=>{
  const s=createCleverSession();cleverRoll(s,()=>0);cleverChoose(s,dice(s)[0].id);
  dice(s).forEach((d,i)=>{d.x=930;d.y=100+i*90;});
  cleverPassive(s,randomValues([1,3,3,3,6,6]));
  assert.deepEqual(dice(s).filter(d=>d.cleverZone==='plate').map(d=>d.cleverDie),['yellow','green','orange']);
  assert.equal(board(s).cleverTurn.phase,'passivePick');
  unchanged(s,()=>cleverChoose(s,dice(s)[4].id));unchanged(s,()=>cleverRoll(s));
  cleverChoose(s,dice(s)[2].id);assert.equal(board(s).cleverTurn.phase,'endRound');
  assert.equal(dice(s).filter(d=>d.cleverZone==='chosen').length,1);
});

test('all seven sheets can finish six rounds and cannot advance or reroll after completion',()=>{
  for(const sheet of CLEVER_SHEETS){
    const s=createCleverSession(()=>0,sheet.id);
    for(let round=1;round<=6;round++){
      assert.equal(board(s).cleverTurn.round,round);cleverRoll(s,()=>0);
      cleverChoose(s,dice(s)[0].id);cleverPassive(s,()=>0);
      clever.act(s,'clever-skip','');cleverNextRound(s);
    }
    assert.equal(board(s).cleverTurn.phase,'done');
    for(const fn of [()=>cleverRoll(s),()=>cleverPassive(s),()=>cleverNextRound(s)])unchanged(s,fn);
    assert.deepEqual(validateSession(s),s);
  }
});

test('Twice Clever return action is before the next throw, and restores an empty pool',()=>{
  const s=createCleverSession(()=>0,'two'),b=board(s);
  writeCleverCell(s,b.id,'retrieve-0','○');cleverRoll(s,randomValues([6,1,2,3,4,5]));
  unchanged(s,()=>clever.act(s,'clever-retrieve','',[dice(s)[1].id]));
  cleverChoose(s,dice(s)[0].id);assert.equal(b.cleverTurn.phase,'endActive');
  clever.act(s,'clever-retrieve','',[dice(s)[1].id]);assert.equal(b.cleverTurn.phase,'roll');
  assert.equal(b.cleverNotes['retrieve-0'],'×');cleverRoll(s,()=>.9);
  assert.equal(dice(s)[1].value,6);assert.equal(b.cleverTurn.roll,2);
});

test('extra die spends a resource only once per die and is disabled for the supplied first-edition solo rules',()=>{
  const s=createCleverSession(()=>0,'three'),b=board(s);cleverRoll(s,randomValues([6,1,2,3,4,5]));cleverChoose(s,dice(s)[0].id);
  writeCleverCell(s,b.id,'plus-0','○');writeCleverCell(s,b.id,'plus-1','○');
  clever.act(s,'clever-plus','',[dice(s)[0].id]);assert.equal(b.cleverNotes['plus-0'],'×');
  unchanged(s,()=>clever.act(s,'clever-plus','',[dice(s)[0].id]));
  clever.act(s,'clever-plus','',[dice(s)[1].id]);assert.equal(b.cleverNotes['plus-1'],'×');
  const one=createCleverSession();unchanged(one,()=>clever.act(one,'clever-plus','',[dice(one)[0].id]));
});

test('first-edition scores match printed tracks and foxes, with explicit manual overrides for every edition',()=>{
  const s=createCleverSession(),b=board(s);
  for(const c of cleverCells('one'))if(c.key.startsWith('yellow-')||c.key.startsWith('blue-')||c.key.startsWith('green-'))writeCleverCell(s,b.id,c.key,'×');
  for(let i=0;i<11;i++){writeCleverCell(s,b.id,`orange-${i}`,'6');writeCleverCell(s,b.id,`purple-${i}`,'6');}
  assert.deepEqual(cleverScore(s),{scores:[60,56,66,66,66],foxes:5,foxScore:280,total:594,automatic:true});
  for(const sheet of CLEVER_SHEETS){
    const s=createCleverSession(()=>0,sheet.id),id=board(s).id;
    [10,20,30,40,50].forEach((n,i)=>clever.act(s,'clever-score',`${id}|${i}|${n}`));
    clever.act(s,'clever-score',`${id}|foxes|3`);assert.equal(cleverScore(s).total,180);
    clever.act(s,'clever-score',`${id}|0|-2`);assert.equal(cleverScore(s).foxScore,-6);
    for(const input of ['0|','0|NaN','0|1.5','0|1000','foxes|-1','foxes|100','bad|2'])unchanged(s,()=>clever.act(s,'clever-score',`${id}|${input}`));
  }
});

test('notes, dice, scores and turn state survive save/export while restart and profile switches restore openings',()=>{
  const p=createProject('clever'),s=startOpening(p,'clever-four'),b=board(s);
  writeCleverCell(s,b.id,'green-upper-0','5');writeCleverCell(s,b.id,'green-lower-0','2');
  cleverRoll(s,()=>0);cleverChoose(s,dice(s)[0].id);clever.act(s,'clever-score',`${b.id}|0|45`);
  const saved=migrateSession(JSON.parse(JSON.stringify(saveEditorDraft(s))));assert.deepEqual(saved,s);
  const restarted=startOpening(saved);assert.deepEqual(board(restarted).cleverNotes,{'round-0':'×'});assert.equal(board(restarted).cleverTurn.roll,0);
  const other=startOpening(saved,'clever-challenge-three');assert.equal(board(other).assetId,'clever-challenge-three');
  const edited=openEditor(saved);assert.deepEqual(board(edited).cleverNotes,{'round-0':'×'});
  const copied=copyProject(saved);assert.deepEqual(board(copied).cleverNotes,b.cleverNotes);assert.notEqual(copied.projectId,s.projectId);
  board(copied).cleverNotes['green-upper-0']='99';assert.equal(b.cleverNotes['green-upper-0'],'5');
});

test('rendered notes are escaped and all four rule links resolve under project hosting paths',()=>{
  const s=createCleverSession(),b=board(s);b.cleverNotes['orange-0']='<script>alert(1)</script>';
  assert.doesNotMatch(cleverBoardOverlay(s,b),/<script>/);assert.match(cleverBoardOverlay(s,b),/&lt;script&gt;/);
  const journal=assetHTML(clever.journal(s),'/board-game-studio/');
  for(let i=1;i<=4;i++)assert.ok(journal.includes(`/board-game-studio/assets/clever/rules-${i}-zh.pdf`));
});

test('malformed imported paper notes, scores and turn data are rejected in progress and all saved openings',()=>{
  const base=createProject('clever');
  for(const modify of [
    o=>o.cleverNotes=[],o=>o.cleverNotes={unknown:'×'},o=>o.cleverNotes={'orange-0':'<script>'},
    o=>o.cleverScores={foxes:-1},o=>o.cleverScores={'0':1.5},o=>o.cleverScores={unknown:3},
    o=>o.cleverTurn.round=7,o=>o.cleverTurn.phase='unknown',o=>o.cleverTurn.plusUsed=['invalid']
  ])for(const get of [s=>s.objects[0],s=>s.initialSetup.objects[0],s=>s.setupProfiles[0].setup.objects[0]]){
    const s=structuredClone(base);modify(get(s));assert.throws(()=>migrateSession(s));
  }
});
