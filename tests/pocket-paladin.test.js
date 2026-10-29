import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createProject,startOpening,openEditor,saveEditorDraft} from '../src/projects.js';
import {validateSession,assetFor,rotateHeldObject} from '../src/model.js';
import {canRollPocketSource,rollPocketSource,adjustPocketToken,preparePocketSession,dropPocketMarker,pocketMarkerAnchors} from '../src/games/pocket-paladin.js';
import {pocketPaladin} from '../src/games/pocket-paladin.js';
import {POCKET_MAP_STEP,pocketHexes,pocketPawnPlacement,pocketMapDrop,upgradePocketMaps} from '../src/games/pocket-paladin-map.js';
import {cardDropPlan,findCardSnapTarget,snapCardOnto} from '../src/interactions.js';
const allEnemies=s=>s.objects.flatMap(o=>o.type==='deck'?o.cards:o.type==='card'?[o.assetId]:[]).filter(id=>id.startsWith('pp-enemy-')).sort();
test('all openings leave clear rows around the left ability panel and right status track without a mat',()=>{
 const project=createProject('pocket-paladin');
 for(const profile of project.setupProfiles){
  const s=startOpening(project,profile.id),ability=s.objects.find(o=>o.assetId==='pp-ability'),track=s.objects.find(o=>o.assetId==='pp-tracks');
  assert.equal(s.objects.some(o=>o.assetId==='pp-table'),false);assert.equal(s.assets.some(a=>a.id==='pp-table'),false);
  assert.ok(ability.x<550&&track.x>950);
  for(const [label,panel] of [['个人面板',ability],['个人状态滑轨',track]]){
   const zone=pocketPaladin.zones.find(z=>z.label===label);
   assert.ok(panel.y-132-(zone.box[1]+zone.box[3])>=18,'panel clears its entire title row');
  }
  const sourceZone=pocketPaladin.zones.find(z=>z.label==='水晶源');
  for(const offer of s.objects.filter(o=>o.ppOffer))assert.ok(sourceZone.box[0]-(offer.x+34)>=70,'offer clears the right column title');
  for(const key of ['blue','black','purple']){
   const crystal=s.objects.find(o=>o.assetId==='pp-'+key),counter=s.objects.find(o=>o.kind==='pp-'+key);
   assert.ok(crystal.y+36<counter.y-13);assert.ok(counter.y+13<track.y-132);
  }
 }
});

test('legacy layout migrates progress and openings once, carries track markers and preserves custom placements',()=>{
 const s=createProject('pocket-paladin');delete s.pocketLayoutVersion;
 s.assets.push({id:'pp-table',type:'board',name:'冒险桌垫',width:1540,height:1100,front:'/assets/pocket-paladin/table.webp'});
 const tables=[s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)];
 for(const objects of tables){
  objects.push({type:'board',assetId:'pp-table',x:770,y:550});
  for(const [id,x,y] of [['ability',1035,430],['tracks',235,360]]){
   const panel=objects.find(o=>o.assetId==='pp-'+id),dx=x-panel.x,dy=y-panel.y;
   for(const marker of objects.filter(o=>id==='ability'?o.kind==='pp-ability':['pp-round','pp-turn','pp-wounds','pp-level'].includes(o.kind))){marker.x+=dx;marker.y+=dy;}
   Object.assign(panel,{x,y});
  }
 }
 const marker=s.objects.find(o=>o.kind==='pp-turn'),offset=[marker.x-235,marker.y-360];
 const custom=tables.at(-1).find(o=>o.assetId==='pp-ability');custom.x=1500;
 const enemies=allEnemies(s);preparePocketSession(s);
 assert.deepEqual([marker.x-1250,marker.y-550],offset);assert.equal(custom.x,1500);assert.deepEqual(allEnemies(s),enemies);
 assert.ok(tables.every(objects=>!objects.some(o=>o.assetId==='pp-table')));
 const migrated=structuredClone(s);preparePocketSession(s);assert.deepEqual(s,migrated);validateSession(s);
});
test('previous mat-free saves gain title clearance without resetting marker positions or crystal values',()=>{
 const s=createProject('pocket-paladin');s.pocketLayoutVersion=2;
 const tables=[s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)];
 for(const objects of tables){
  for(const id of ['tracks','blue','black','purple','source']){
   const panel=objects.find(o=>o.assetId==='pp-'+id);panel.x-=80;if(id==='tracks')panel.y-=50;
  }
  for(const marker of objects.filter(o=>o.kind?.startsWith('pp-')&&o.kind!=='pp-ability')){
   marker.x-=80;if(['pp-round','pp-turn','pp-wounds','pp-level'].includes(marker.kind))marker.y-=50;
  }
  objects.find(o=>o.kind==='pp-blue').value=4;
 }
 const marker=s.objects.find(o=>o.kind==='pp-wounds');marker.x+=9;marker.y-=7;
 const previous=[marker.x,marker.y];const ability=structuredClone(s.objects.find(o=>o.assetId==='pp-ability'));
 preparePocketSession(s);
 assert.deepEqual([marker.x,marker.y],[previous[0]+80,previous[1]+50]);
 assert.deepEqual(s.objects.find(o=>o.assetId==='pp-ability'),ability);
 for(const objects of tables){
  assert.equal(objects.find(o=>o.kind==='pp-blue').value,4);
  assert.equal(objects.find(o=>o.assetId==='pp-tracks').y,550);
 }
 const migrated=structuredClone(s);preparePocketSession(s);assert.deepEqual(s,migrated);validateSession(s);
});

test('all four openings conserve 16 unique double-sided tokens and deal three wandering enemies and three offers',()=>{
 const project=createProject('pocket-paladin');assert.equal(project.setupProfiles.length,4);
 for(const p of project.setupProfiles){
  const s=startOpening(project,p.id,()=>.37);validateSession(s);
  assert.equal(allEnemies(s).length,16);assert.equal(new Set(allEnemies(s)).size,16);
  assert.equal(s.objects.filter(o=>o.ppOffer).length,3);
  const wandering=s.objects.filter(o=>o.type==='card'&&o.ppOffer===false);assert.equal(wandering.length,3);
  assert.equal(wandering.filter(o=>assetFor(s,o.assetId).enemyType==='monster').length,2);
  assert.equal(wandering.filter(o=>assetFor(s,o.assetId).enemyType==='mage').length,1);
  assert.equal(s.objects.find(o=>o.assetId==='pp-hero').faceUp,p.id.includes('red'));
 }
 for(const a of project.assets){assert.ok(existsSync('public'+a.front));if(a.back)assert.ok(existsSync('public'+a.back));}
});

test('a Pocket Paladin enemy chit returns to its enemy pile bottom without changing the next enemy',()=>{
 const s=startOpening(createProject('pocket-paladin')),enemy=s.objects.find(o=>o.ppOffer===false),type=assetFor(s,enemy.assetId).enemyType;
 const pile=s.objects.find(o=>o.ppPool===type),oldTop=pile.cards.at(-1),all=allEnemies(s);
 assert.equal(snapCardOnto(s,enemy,pile,{position:'bottom'}),true);
 assert.equal(pile.cards[0],enemy.assetId);assert.equal(pile.cards.at(-1),oldTop);assert.deepEqual(allEnemies(s),all);validateSession(s);
});
test('source rolls to all six directions without automating any game action',()=>{
 const s=startOpening(createProject('pocket-paladin')),source=s.objects.find(o=>o.assetId==='pp-source');
 assert.equal(pocketPaladin.toolbar,undefined);assert.equal(pocketPaladin.act,undefined);
 for(let i=0;i<6;i++){
  const before=structuredClone(s);assert.equal(rollPocketSource(s,source,()=>i/6+.01),true);
  assert.equal(source.rotation,i*60);before.objects.find(o=>o.id===source.id).rotation=i*60;assert.deepEqual(s,before);
 }
 const map=s.objects.find(o=>o.assetId==='pp-map-A');assert.equal(canRollPocketSource(s,map),false);assert.equal(rollPocketSource(s,map),false);
 source.locked=true;const before=structuredClone(s);assert.equal(rollPocketSource(s,source),false);assert.deepEqual(s,before);
 validateSession(JSON.parse(JSON.stringify(s)));
 const editor=saveEditorDraft(openEditor(s));rollPocketSource(editor,editor.objects.find(o=>o.assetId==='pp-source'),()=>.2);validateSession(editor);
});

test('held crystal rotation follows 60-degree edges and keeps the resource count in sync',()=>{
 const s=startOpening(createProject('pocket-paladin'));
 for(const key of ['blue','black','purple']){
  const shard=s.objects.find(o=>o.assetId==='pp-'+key),counter=s.objects.find(o=>o.kind==='pp-'+key),position=[shard.x,shard.y];
  assert.equal(pocketPaladin.rotationStep(s,shard),60);
  for(let i=1;i<=6;i++){
   rotateHeldObject(shard,1,pocketPaladin.rotationStep(s,shard));pocketPaladin.onRotate(s,shard);
   assert.equal(shard.rotation,(i*60)%360);assert.equal(counter.value,(6-i)%6);
  }
  rotateHeldObject(shard,-1,60);pocketPaladin.onRotate(s,shard);assert.equal(counter.value,1);assert.deepEqual([shard.x,shard.y],position);
 }
 assert.equal(pocketPaladin.rotationStep(s,s.objects.find(o=>o.assetId==='pp-source')),60);
 assert.equal(pocketPaladin.rotationStep(s,s.objects.find(o=>o.assetId==='pp-map-A')),90);
 validateSession(JSON.parse(JSON.stringify(s)));
});

test('legacy tilted crystals follow stored counts while source and direct rotations align to 60 degrees',()=>{
 const s=createProject('pocket-paladin'),tables=[s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)];
 for(const objects of tables){
  for(const [i,key]of ['blue','black','purple'].entries()){
   const shard=objects.find(o=>o.assetId==='pp-'+key);shard.rotation=45+i*37;
   objects.find(o=>o.kind==='pp-'+key).value=i;shard.x+=11;
  }
  objects.find(o=>o.assetId==='pp-source').rotation=91;
 }
 preparePocketSession(s);
 for(const objects of tables){
  for(const [i,key]of ['blue','black','purple'].entries())assert.equal(objects.find(o=>o.assetId==='pp-'+key).rotation,-60*i);
  assert.equal(objects.find(o=>o.assetId==='pp-source').rotation,120);
 }
 const shard=s.objects.find(o=>o.assetId==='pp-black');shard.rotation=90;pocketPaladin.onRotate(s,shard);
 assert.equal(shard.rotation,120);assert.equal(s.objects.find(o=>o.kind==='pp-black').value,4);
 const snapshot=structuredClone(s);preparePocketSession(s);preparePocketSession(s);
 assert.equal(s.objects.find(o=>o.assetId==='pp-black').rotation,-240);assert.deepEqual(s.objects.map(o=>[o.x,o.y]),snapshot.objects.map(o=>[o.x,o.y]));
 validateSession(s);
});

test('tracking bounds, crystal orientation and authored openings survive save/restart',()=>{
 let s=startOpening(createProject('pocket-paladin'));const blue=s.objects.find(o=>o.kind==='pp-blue');
 adjustPocketToken(s,blue,8);assert.equal(blue.value,5);assert.equal(s.objects.find(o=>o.assetId==='pp-blue').rotation,-300);
 adjustPocketToken(s,blue,-9);assert.equal(blue.value,0);
 const wounds=s.objects.find(o=>o.kind==='pp-wounds'),before=structuredClone(wounds);adjustPocketToken(s,wounds,99);assert.deepEqual(wounds,before);assert.equal(wounds.value,undefined);
 s=openEditor(s);s.objects.find(o=>o.kind==='pp-blue').value=3;s=saveEditorDraft(s);s=startOpening(s);
 assert.equal(s.objects.find(o=>o.kind==='pp-blue').value,3);assert.equal(allEnemies(s).length,16);
});

test('maps share a column with the southern card on top; pawns start at printed hex centers',()=>{
 const project=createProject('pocket-paladin');
 for(const p of project.setupProfiles){
  const s=startOpening(project,p.id),maps=s.objects.filter(o=>assetFor(s,o.assetId)?.group==='map').sort((a,b)=>a.y-b.y),[top,bottom]=maps;
  assert.equal(top.x,bottom.x);assert.ok(Math.abs(bottom.y-top.y-POCKET_MAP_STEP)<1e-8);assert.ok(bottom.z>top.z);
  assert.ok(maps.every(m=>m.snapCards===false));
  // The two bottom grassland hexes of the northern card align with the two
  // top partial hexes of the southern card, which supplies the visible paper.
  for(let col=0;col<2;col++){
   const a=pocketHexes(s,top).find(p=>p.row===4&&p.col===col),b=pocketHexes(s,bottom).find(p=>p.row===0&&p.col===col);
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);
  }
  const hero=s.objects.find(o=>o.assetId==='pp-hero'),center=pocketHexes(s,bottom).find(h=>h.row===5&&h.col===1);
  assert.deepEqual([hero.x,hero.y],[center.x,center.y]);
  for(const pawn of s.objects.filter(o=>o.ppOffer===false)){const p=pocketPawnPlacement(s,pawn);assert.ok(p&&Math.hypot(p.x-pawn.x,p.y-pawn.y)<1e-8);}
  const mapB=maps.find(m=>m.assetId==='pp-map-B'),forest=pocketHexes(s,mapB).find(h=>h.row===2&&h.col===1);
  assert.ok(s.objects.some(o=>o.ppOffer===false&&assetFor(s,o.assetId)?.enemyType==='monster'&&Math.hypot(o.x-forest.x,o.y-forest.y)<1e-8));
 }
});

test('dragging a pawn on the map uses hex centers instead of either card-center or square snapping',()=>{
 const s=startOpening(createProject('pocket-paladin')),hero=s.objects.find(o=>o.assetId==='pp-hero'),map=s.objects.find(o=>o.assetId==='pp-map-A');
 const hex=pocketHexes(s,map).find(p=>p.row===3&&p.col===1);Object.assign(hero,{x:hex.x+9,y:hex.y-12});
 const before=structuredClone(s),plan=cardDropPlan(s,hero,[hero.id],{placementFor:pocketPaladin.cardPlacement});
 assert.equal(plan.target,null);assert.deepEqual(plan.placement,{x:hex.x,y:hex.y,rotation:hero.rotation});assert.deepEqual(s,before);
 pocketMapDrop(s,hero);assert.equal(hero.x,hex.x);assert.equal(hero.y,hex.y);
 // An otherwise empty map's center is never a generic card magnet.
 s.objects=s.objects.filter(o=>o===map||o===hero);Object.assign(hero,{x:map.x,y:map.y});assert.equal(findCardSnapTarget(s,hero),null);
 s.settings.snap=false;assert.equal(cardDropPlan(s,hero,[hero.id],{placementFor:pocketPaladin.cardPlacement}).placement,null);
 assert.equal(pocketPawnPlacement(s,{...hero,assetId:'pp-source'}),null);
});

test('hex placement follows scaled and rotated maps, excludes black corners and missing castle-side bottom row',()=>{
 const s=startOpening(createProject('pocket-paladin')),map=s.objects.find(o=>o.assetId==='pp-map-A'),hero=s.objects.find(o=>o.assetId==='pp-hero');s.objects=[map,hero];
 for(const rotation of [0,90,180,270,23]){
  Object.assign(map,{x:1432,y:811,width:420,height:566.16,rotation});
  const hex=pocketHexes(s,map).find(h=>h.row===3&&h.col===2);Object.assign(hero,{x:hex.x+2,y:hex.y-2});
  assert.deepEqual(pocketPawnPlacement(s,hero),{x:hex.x,y:hex.y,rotation:hero.rotation});
 }
 Object.assign(map,{x:700,y:600,rotation:0});hero.x=map.x-205;hero.y=map.y-275;assert.equal(pocketPawnPlacement(s,hero),null);
 const bottom=pocketHexes(s,map).find(h=>h.row===5&&h.col===1);map.faceUp=false;Object.assign(hero,{x:bottom.x,y:bottom.y});assert.equal(pocketPawnPlacement(s,hero),null);
});

test('map overlap magnet restores exact edges and southern-over-northern order',()=>{
 const s=startOpening(createProject('pocket-paladin')),[bottom,top]=s.objects.filter(o=>assetFor(s,o.assetId)?.group==='map');
 top.x+=17;top.y-=10;top.z=90;pocketMapDrop(s,top);
 assert.equal(top.x,bottom.x);assert.ok(Math.abs(top.y-(bottom.y-POCKET_MAP_STEP))<1e-8);assert.ok(bottom.z>top.z);
 bottom.x-=12;bottom.y+=11;pocketMapDrop(s,bottom);
 assert.equal(top.x,bottom.x);assert.ok(Math.abs(bottom.y-(top.y+POCKET_MAP_STEP))<1e-8);assert.ok(bottom.z>top.z);
});

test('legacy untouched layouts upgrade once; moved pieces and authored maps stay intact',()=>{
 const s=createProject('pocket-paladin');delete s.pocketMapVersion;
 const makeLegacy=objects=>{const maps=objects.filter(o=>assetFor(s,o.assetId)?.group==='map');maps[0].x=698;maps[0].y=675;maps[0].z=2;maps[1].x=740;maps[1].y=388;maps[1].z=3;for(const m of maps)delete m.snapCards;const hero=objects.find(o=>o.assetId==='pp-hero');hero.x=658;hero.y=845;};
 makeLegacy(s.objects);makeLegacy(s.initialSetup.objects);for(const p of s.setupProfiles)makeLegacy(p.setup.objects);
 const custom=structuredClone(s.setupProfiles[0]);custom.id='custom';custom.setup.objects.find(o=>o.assetId==='pp-map-A').x=1200;s.setupProfiles.push(custom);
 upgradePocketMaps(s);
 assert.equal(s.objects.find(o=>o.assetId==='pp-map-B').x,698);assert.equal(s.initialSetup.objects.find(o=>o.assetId==='pp-map-B').x,698);
 assert.equal(custom.setup.objects.find(o=>o.assetId==='pp-map-A').x,1200);
 const migrated=structuredClone(s);upgradePocketMaps(s);assert.deepEqual(s,migrated);validateSession(s);
});


test('position markers have no counter values; legacy progress and openings retain their exact placements',()=>{
 const s=createProject('pocket-paladin'),keys=['round','turn','wounds','level','ability'];
 const tables=[s.objects,s.initialSetup.objects,...s.setupProfiles.map(p=>p.setup.objects)];
 for(const objects of tables)for(const key of keys){
  const marker=objects.find(o=>o.kind==='pp-'+key);assert.equal(marker.value,undefined);
  marker.value=key==='wounds'?0:1;marker.x+=13;marker.y-=19;
 }
 const before=structuredClone(tables);preparePocketSession(s);
 for(const [i,objects]of tables.entries())for(const key of keys){
  const marker=objects.find(o=>o.kind==='pp-'+key),old=before[i].find(o=>o.kind===marker.kind);delete old.value;
  assert.deepEqual(marker,old);assert.match(pocketPaladin.tokenIcon(marker.kind,{value:10}),/><\/span>$/);
 }
 assert.ok(pocketPaladin.tokens.filter(t=>keys.includes(t.kind.slice(3))).every(t=>t.value===undefined));
 const hydrated=JSON.parse(JSON.stringify(s));preparePocketSession(hydrated);assert.deepEqual(hydrated,s);validateSession(hydrated);
});


test('blank markers snap to their printed track centers on moved, resized, rotated cards and either face',()=>{
 const s=startOpening(createProject('pocket-paladin'));
 for(const key of ['round','turn','level','wounds','ability']){
  const marker=s.objects.find(o=>o.kind==='pp-'+key),card=s.objects.find(o=>o.assetId===(key==='ability'?'pp-ability':'pp-tracks'));
  for(const faceUp of [true,false])for(const rotation of [0,90,180,270,27]){
   Object.assign(card,{x:813,y:712,width:540,height:396,rotation,faceUp});
   const anchors=pocketMarkerAnchors(s,card,key);assert.equal(anchors.length,({round:6,turn:6,level:8,wounds:11,ability:9})[key]);
   for(const a of anchors){
    marker.x=a.x+3;marker.y=a.y-4;dropPocketMarker(s,marker);
    assert.ok(Math.hypot(marker.x-a.x,marker.y-a.y)<1e-8);assert.equal(marker.value,undefined);
   }
  }
 }
});

test('track snapping respects disabled snapping, locks, staging positions and marker type',()=>{
 const s=startOpening(createProject('pocket-paladin')),marker=s.objects.find(o=>o.kind==='pp-turn'),card=s.objects.find(o=>o.assetId==='pp-tracks'),a=pocketMarkerAnchors(s,card,'turn')[4];
 Object.assign(marker,{x:a.x+8,y:a.y-3});let before=structuredClone(marker);s.settings.snap=false;dropPocketMarker(s,marker);assert.deepEqual(marker,before);
 s.settings.snap=true;marker.locked=true;before=structuredClone(marker);dropPocketMarker(s,marker);assert.deepEqual(marker,before);
 marker.locked=false;marker.x=-400;marker.y=-400;before=structuredClone(marker);dropPocketMarker(s,marker);assert.deepEqual(marker,before);
 const crystal=s.objects.find(o=>o.kind==='pp-blue');Object.assign(crystal,{x:a.x+8,y:a.y-3});before=structuredClone(crystal);dropPocketMarker(s,crystal);assert.deepEqual(crystal,before);
});

test('red and purple ability markers start on their respective printed stars',()=>{
 for(const [hero,index]of [['red',3],['purple',6]]){
  const s=startOpening(createProject('pocket-paladin'),'pp-'+hero+'-A'),card=s.objects.find(o=>o.assetId==='pp-ability'),marker=s.objects.find(o=>o.kind==='pp-ability');
  const star=pocketMarkerAnchors(s,card,'ability')[index];assert.deepEqual([marker.x,marker.y],[star.x,star.y]);
 }
});
