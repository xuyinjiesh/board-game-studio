// Shared templates belong to the workshop, independent of a game's assets.
const root='/assets/shared/kenney/';
const faces=[1,2,3,4,5,6];
export const sharedDice=['White','Red'].flatMap((color)=>[false,true].map(border=>({
  id:`kenney-${color.toLowerCase()}${border?'-border':''}`,
  skin:`kenney-${color.toLowerCase()}${border?'-border':''}`,
  name:`${color==='White'?'瓷白':'朱红'}${border?'描边':'圆角'}骰`,
  color:color==='White'?'ivory':'orange',faces:[...faces],
  images:faces.map(v=>`${root}die${color}${border?'_border':''}${v}.png`)
})));
const palette=[['Blue','湖蓝','#28a5cf'],['Red','朱红','#d85248'],['Green','草绿','#77bf43'],['Yellow','金黄','#e9b923'],['Purple','紫罗兰','#a376d8'],['White','瓷白','#eeeae1'],['Black','墨黑','#363738']];
export const sharedTokens=palette.flatMap(([color,label,hex])=>[
  ['00','棋子'],['05','米宝'],['10','圆片'],['16','旗帜']
].map(([number,name])=>({kind:`shared-${color.toLowerCase()}-${number}`,name:`${label}${name}`,color:hex,description:'Kenney · CC0',image:`${root}piece${color}_multi${number}.png`})));
for(const [color,name] of [['BlackWhite','黑白'],['Blue','蓝色'],['BlueWhite','蓝白'],['Green','绿色'],['GreenWhite','绿白'],['RedWhite','红白'],['White','白色'],['WhiteBlue','白蓝']]){
  sharedTokens.push({kind:`shared-chip-${color.toLowerCase()}`,name:`${name}筹码`,color:'#c79e62',description:'Kenney · CC0',image:`${root}chip${color}_border.png`});
}
export function sharedDieImage(skin,value){return sharedDice.find(d=>d.skin===skin)?.images[value-1];}
export function sharedToken(kind){return sharedTokens.find(t=>t.kind===kind);}
