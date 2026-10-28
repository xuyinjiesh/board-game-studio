import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {ironHelmDlcAssets} from '../src/games/iron-helm-dlc-assets.js';
import {ironHelmAssets} from '../src/games/iron-helm-assets.js';
import {EXPANSIONS,expansionOptions} from '../src/games/iron-helm-expansions.js';
import {createIronHelmSession,configureOpening,availableHeroes,value,ironHelm} from '../src/games/iron-helm.js';
import {createProject,startOpening,copyProject,migrateSession} from '../src/projects.js';
import {validateSession,drawFromDeck,dimensions} from '../src/model.js';
const deck=(s,role)=>s.objects.find(o=>o.ihRole===role&&o.type==='deck');
const cards=s=>s.objects.flatMap(o=>o.type==='card'?[o.assetId]:o.type==='deck'?o.cards:o.ihBlessingSupply||[]).sort();
const expected=s=>s.assets.filter(a=>a.type==='card'&&a.group!=='track').map(a=>a.id).sort();
const allPacks=EXPANSIONS.map(p=>p.id);

test('every expansion is selectable and its duplex assets are bundled locally',()=>{
  assert.equal(EXPANSIONS.length,16);assert.equal(ironHelmDlcAssets.length,353);
  assert.equal(new Set(ironHelmDlcAssets.map(a=>a.id)).size,353);
  for(const p of EXPANSIONS){assert.ok(ironHelmDlcAssets.some(a=>a.expansion===p.id));assert.ok(existsSync(new URL('../public'+p.cover,import.meta.url)));}
  for(const a of ironHelmDlcAssets){assert.ok(EXPANSIONS.some(p=>p.id===a.expansion));for(const path of [a.front,a.back])assert.ok(existsSync(new URL('../public'+path,import.meta.url)),path);}
  assert.equal(ironHelmDlcAssets.filter(a=>a.expansion==='dungeon2'&&a.group==='dungeon').length,18);
  assert.equal(ironHelmDlcAssets.filter(a=>a.group==='event').length,6);
});
test('no expansion means the unchanged base set and four base heroes',()=>{
  const s=createProject('iron-helm');assert.deepEqual(s.ironHelmOptions,{packs:[],adventure:'base',dungeon:'base'});
  assert.equal(s.assets.filter(a=>a.expansion).length,0);assert.equal(s.setupProfiles.length,4);
  assert.deepEqual(cards(s),ironHelmAssets.filter(a=>a.group!=='track').map(a=>a.id).sort());
  assert.deepEqual(configureOpening(s,{}),s);
});
test('each pack alone conserves all enabled cards, and does not pollute another fresh project',()=>{
  for(const pack of EXPANSIONS){
    const options={packs:[pack.id],adventure:pack.kind==='adventure'?pack.id:'base',dungeon:pack.id==='dungeon2'?'dungeon2':'base'};
    const s=configureOpening(createProject('iron-helm'),options);validateSession(s);
    assert.deepEqual(cards(s),expected(s),pack.id);assert.equal(s.setupProfiles.length,availableHeroes(options).length);
    assert.ok(s.assets.filter(a=>a.expansion&&a.expansion!==pack.id).every(a=>a.id==='ih-dlc-ap6-p49c9'),'only cross-pack starting gear may be supplied');
  }
  assert.equal(createProject('iron-helm').assets.some(a=>a.expansion),false);
});
test('multiple modules mix into the correct decks while adventure enemies and plots stay separate',()=>{
  const options={packs:['ap1','ap2','loot-lore','beasts','realms','random-events'],adventure:'ap1'};
  const s=createIronHelmSession(()=>.3,'1',options);
  assert.ok(deck(s,'enemy').cards.every(id=>!id.startsWith('ih-enemy-')&&!id.includes('-ap2-')));
  assert.ok(deck(s,'enemy').cards.some(id=>id.includes('-ap1-')));assert.ok(deck(s,'enemy').cards.some(id=>id.includes('-beasts-')));
  assert.ok(deck(s,'dlc-enemy').cards.some(id=>id.includes('-ap2-')));
  assert.ok(deck(s,'dlc-calamity'));assert.ok(deck(s,'dlc-environment'));assert.ok(deck(s,'dlc-artifact'));assert.equal(deck(s,'dlc-event').cards.length,6);
  assert.deepEqual(cards(s),expected(s));assert.equal(deck(s,'dungeon').cards.length,16);
});
test('alternative dungeon replaces rather than mixes with the base deck',()=>{
  const s=createIronHelmSession(()=>.4,'1',{packs:['dungeon2'],dungeon:'dungeon2'});
  assert.equal(deck(s,'dungeon').cards.length,18);assert.ok(deck(s,'dungeon').cards.every(id=>id.includes('-dungeon2-')));
  assert.equal(deck(s,'dlc-dungeon').cards.length,16);assert.deepEqual(cards(s),expected(s));
});
test('every expansion hero gets its printed resources and all its starting cards exactly once',()=>{
  const options={packs:allPacks,adventure:'ap7',dungeon:'dungeon2'};
  const s=configureOpening(createProject('iron-helm'),options);assert.equal(s.setupProfiles.length,23);
  for(const h of availableHeroes(options)){
    const started=startOpening(s,h.assetId||`ih-hero-${h.id}`,()=>.6);validateSession(started);
    assert.equal(value(started,'health'),h.health,h.name);assert.equal(value(started,'energy'),h.energy,h.name);
    assert.equal(value(started,'gold'),h.gold,h.name);assert.equal(value(started,'rations'),h.rations,h.name);
    const hero=started.objects.find(o=>o.ihRole==='hero');assert.equal(hero.cards.at(-1),h.assetId||`ih-hero-${h.id}`);
    assert.deepEqual(cards(started),expected(started),h.name);
    const carried=started.objects.filter(o=>o.ihRole==='inventory'||o.ihSlot&&['main','off','head','body','accessory'].includes(o.ihSlot)).flatMap(o=>o.type==='deck'?o.cards:[o.assetId]);
    for(const id of h.items.map(id=>id.startsWith('ih-')?id:`ih-trapping-${id}`))assert.ok(carried.includes(id),h.name+' starting gear');
  }
});
test('canceling a configuration is read-only; same configuration retains authored openings',()=>{
  const s=createProject('iron-helm');s.setupProfiles[0].setup.objects[0].x=1234;const baseline=structuredClone(s);
  const draft=configureOpening(s,{packs:['ap1','realms']});assert.deepEqual(s,baseline);assert.deepEqual(configureOpening(s,{}),s);
  const before=structuredClone(draft);assert.deepEqual(configureOpening(draft,draft.ironHelmOptions),before);
  const reset=configureOpening(draft,{});assert.equal(reset.setupProfiles.length,4);assert.equal(reset.assets.some(a=>a.expansion),false);
});
test('progress, enabled packs and profiles survive save, copy, import and restart',()=>{
  const s=configureOpening(createProject('iron-helm'),{packs:['loot-lore','dungeon2','iron-chest'],dungeon:'dungeon2'});
  const started=startOpening(s,'ih-dlc-loot-lore-p55c6',()=>.7);const drawn=drawFromDeck(started,deck(started,'dungeon'));drawn.x=1777;
  const restored=migrateSession(JSON.parse(JSON.stringify(started)));assert.deepEqual(restored.ironHelmOptions,s.ironHelmOptions);assert.equal(restored.objects.find(o=>o.id===drawn.id).x,1777);
  assert.deepEqual(cards(restored),expected(restored));const copy=copyProject(restored);assert.notEqual(copy.projectId,restored.projectId);
  const restart=startOpening(copy);assert.equal(deck(restart,'dungeon').cards.length,18);assert.deepEqual(cards(restart),expected(restart));
});
test('invalid options cannot enter the game, and checkbox selection is always opt-in',()=>{
  for(const options of [{packs:['missing']},{packs:['ap1','ap1']},{packs:[],adventure:'ap1'},{packs:[],dungeon:'dungeon2'},{packs:['loot-lore'],adventure:'loot-lore'},null])assert.throws(()=>expansionOptions(options));
  const s=createProject('iron-helm'),html=ironHelm.expansionChoiceHTML(s);assert.equal((html.match(/data-ih-expansion=/g)||[]).length,16);assert.doesNotMatch(html,/checked/);
  const bad=structuredClone(s);bad.ironHelmOptions={packs:['missing']};assert.throws(()=>migrateSession(bad));
});

test('auxiliary piles have readable identities and do not collide with reserves or dice',()=>{
  const s=createIronHelmSession(()=>.5,'1',{packs:allPacks});
  for(const a of s.objects.filter(o=>o.ihRole?.startsWith('dlc-'))){
    assert.ok(a.name);
    const da=dimensions(s,a);
    for(const b of s.objects.filter(o=>o!==a&&(o.type==='deck'||o.type==='die'))){
      const db=dimensions(s,b);
      assert.ok(Math.abs(a.x-b.x)>=(da.w+db.w)/2||Math.abs(a.y-b.y)>=(da.h+db.h)/2,`${a.name} overlaps ${b.name}`);
    }
  }
});

test('authored profiles and independent cover assets survive changing enabled packs',()=>{
  const s=createProject('iron-helm'),custom=structuredClone(s.setupProfiles[0]);
  custom.id='my-hero';custom.name='我的方案';custom.coverAssetId='ih-dlc-loot-lore-p55c5';
  s.assets.push(structuredClone(ironHelmDlcAssets.find(a=>a.id===custom.coverAssetId)));s.setupProfiles.push(custom);
  const next=configureOpening(s,{packs:['realms']});assert.deepEqual(next.setupProfiles.find(p=>p.id==='my-hero'),custom);validateSession(next);
});
