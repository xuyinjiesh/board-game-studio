import {assetFor,dimensions,pointOnObject} from '../model.js';

// Measured on the original 819 × 1104 map crops. Rows alternate two / three
// point-up hexes. Keeping image coordinates also supports resized/rotated maps.
const IMAGE_W=819,IMAGE_H=1104,ROW_STEP=210.5;
export const POCKET_MAP_STEP=4*ROW_STEP/IMAGE_H*377.44;
const isMap=(s,o)=>o.type==='card'&&assetFor(s,o.assetId)?.group==='map';
const isPawn=(s,o)=>o.type==='card'&&['hero','enemy'].includes(assetFor(s,o.assetId)?.group);
export function pocketHexes(s,map){
  const {w,h}=dimensions(s,map),a=map.rotation*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),hexes=[];
  for(let row=0;row<=(map.faceUp===false?4:5);row++){
    const columns=row%2?[167,410,653]:[288.5,531.5];
    // Row 5 has three partial hexes, just like the other odd rows.
    for(const [col,px] of columns.entries()){
      const py=26+row*ROW_STEP,dx=(px/IMAGE_W-.5)*w,dy=(py/IMAGE_H-.5)*h;
      hexes.push({row,col,x:map.x+dx*c-dy*sn,y:map.y+dx*sn+dy*c,px:dx,py:dy});
    }
  }
  return hexes;
}
export function pocketPawnPlacement(s,o){
  if(!isPawn(s,o))return null;
  // The top card's opaque paper masks every part of the card underneath it,
  // including black corners. Never attract a pawn to an obscured lower hex.
  const map=s.objects.filter(m=>isMap(s,m)&&pointOnObject(s,m,o.x,o.y).inside).sort((a,b)=>b.z-a.z)[0];
  if(!map)return null;
  const p=pointOnObject(s,map,o.x,o.y),{w,h}=dimensions(s,map);
  const hex=pocketHexes(s,map).find(hex=>{
    const dx=Math.abs(p.px-hex.px)/(121.5/IMAGE_W*w),dy=Math.abs(p.py-hex.py)/(140.333/IMAGE_H*h);
    return dx<=1&&dx+2*dy<=2;
  });
  return hex?{x:hex.x,y:hex.y,rotation:o.rotation}:null;
}
export function pocketMapDrop(s,o){
  if(isMap(s,o)){
    const {w,h}=dimensions(s,o);
    for(const other of s.objects.filter(m=>m.id!==o.id&&isMap(s,m))){
      const size=dimensions(s,other);
      if(Math.abs(w-size.w)>.1||Math.abs(h-size.h)>.1||Math.abs((o.rotation-other.rotation)%360)>.01)continue;
      const a=other.rotation*Math.PI/180,step=4*ROW_STEP/IMAGE_H*h;
      for(const direction of [-1,1]){
        const x=other.x-direction*step*Math.sin(a),y=other.y+direction*step*Math.cos(a);
        if(Math.hypot(o.x-x,o.y-y)>w*.22)continue;
        Object.assign(o,{x,y});
        const upper=direction<0?o:other,lower=direction<0?other:o;
        upper.z=1;lower.z=2;return;
      }
    }
    return;
  }
  const p=pocketPawnPlacement(s,o);if(p)Object.assign(o,p);
  // Cards away from the map stay where dropped, rather than using a square grid.
}
const near=(o,x,y)=>Math.abs(o.x-x)<.1&&Math.abs(o.y-y)<.1;
export function upgradePocketMaps(s){
  if(s.pocketMapVersion===2)return;
  const tables=new Set([s.objects,s.initialSetup?.objects,s.setup?.objects,...(s.setupProfiles||[]).map(p=>p.setup.objects)].filter(Boolean));
  for(const objects of tables){
    const context={...s,objects},maps=objects.filter(o=>isMap(s,o));
    for(const map of maps)map.snapCards=false;
    // Repair the provisional hex-layout revision's B-banner column too.
    if(s.pocketMapVersion===1){
      for(const map of maps.filter(o=>o.assetId==='pp-map-B')){
        const hexes=pocketHexes(context,map),oldHex=hexes.find(h=>h.row===2&&h.col===0),banner=hexes.find(h=>h.row===2&&h.col===1);
        for(const pawn of objects.filter(o=>o.ppOffer===false&&(o.type==='deal'||isPawn(s,o))&&near(o,oldHex.x,oldHex.y)))Object.assign(pawn,{x:banner.x,y:banner.y});
      }
    }
    const bottom=maps.find(o=>near(o,698,675)),top=maps.find(o=>near(o,740,388));
    if(!bottom||!top||bottom.rotation||top.rotation||bottom.width||bottom.height||top.width||top.height)continue;
    top.x=bottom.x;top.y=bottom.y-POCKET_MAP_STEP;top.z=1;bottom.z=2;
    const hero=objects.find(o=>o.assetId==='pp-hero'&&near(o,658,845));
    if(hero){const hex=pocketHexes(context,bottom).find(p=>p.row===5&&p.col===1);Object.assign(hero,{x:hex.x,y:hex.y});}
    for(const [map,oldX,oldY] of [[bottom,698,675],[top,740,388]]){
      const a=map.assetId==='pp-map-A',positions=a?[[oldX-41,oldY+88,4,0],[oldX+84,oldY+29,3,2]]:[[oldX-42,oldY-36,2,1]];
      for(const [x,y,row,col] of positions){
        const pawn=objects.find(o=>(o.type==='deal'||isPawn(s,o))&&o.ppOffer===false&&near(o,x,y));
        const hex=pocketHexes(context,map).find(p=>p.row===row&&p.col===col);
        if(pawn&&hex)Object.assign(pawn,{x:hex.x,y:hex.y});
      }
    }
  }
  s.pocketMapVersion=2;
}
