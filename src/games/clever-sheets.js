// Hit areas in the supplied PDFs, measured on their 893 × 1263 previews.
// Keep printed artwork and annotations separate so a sheet can be moved/scaled.
export const CLEVER_SHEETS=[
  {id:'one',name:'绝顶聪明',version:1,colors:['yellow','blue','green','orange','purple','white'],areas:['黄色','蓝色','绿色','橙色','紫色']},
  {id:'two',name:'双倍聪明',version:2,colors:['yellow','blue','green','pink','silver','white'],areas:['银色','黄色','蓝色','绿色','粉色']},
  {id:'three',name:'三倍聪明',version:3,colors:['yellow','teal','blue','brown','pink','white'],areas:['黄色','青绿','蓝色','棕色','粉色']},
  {id:'four',name:'四倍聪明',version:4,colors:['yellow','blue','silver','green','pink','white'],areas:['黄色','蓝色','灰色','绿色','粉色']},
  {id:'challenge-one',name:'绝顶聪明 · 挑战模式 1',version:1,colors:['yellow','blue','green','orange','purple','white'],areas:['黄色','蓝色','绿色','橙色','紫色']},
  {id:'challenge-two',name:'双倍聪明 · 挑战模式 2',version:2,colors:['yellow','blue','green','pink','silver','white'],areas:['银色','黄色','蓝色','绿色','粉色']},
  {id:'challenge-three',name:'三倍聪明 · 挑战模式 3',version:3,colors:['yellow','teal','blue','brown','pink','white'],areas:['黄色','青绿','蓝色','棕色','粉色']}
];
export function cleverSheet(id){const sheet=CLEVER_SHEETS.find(s=>s.id===id);if(!sheet)throw new Error('请选择有效的聪明系列计分纸');return sheet;}

const cache=new Map();
export function cleverCells(id){
  if(cache.has(id))return cache.get(id);
  const s=cleverSheet(id),cells=[];
  const add=(key,label,x,y,w=44,h=w,type='mark')=>cells.push({key,label,x,y,w,h,type});
  const row=(key,label,xs,y,type='number',w=46,h=w)=>xs.forEach((x,i)=>add(`${key}-${i}`,`${label} ${i+1}`,x,y,w,h,type));
  const grid=(key,label,xs,ys,type='mark',w=44,skip=[])=>ys.forEach((y,r)=>xs.forEach((x,c)=>{if(!skip.some(([a,b])=>r===a&&c===b))add(`${key}-${r}-${c}`,`${label} 第${r+1}行第${c+1}格`,x,y,w,w,type);}));
  const line=(start,step,n)=>Array.from({length:n},(_,i)=>start+step*i);
  const challenge=id.startsWith('challenge');
  if(s.version===1){
    row('round','轮数',line(211,122,6),63,'mark',56);
    row('reroll','重投奖励',line(306,84,7),219,'resource',52);
    row('plus','额外骰奖励',line(306,84,7),354,'resource',52);
    grid('yellow','黄色',[82,158,234,310],challenge?[510,583,655,728]:[483,555,627,700],'mark',52,
      challenge?[[0,1],[1,3],[2,0],[3,2]]:[[0,3],[1,2],[2,1],[3,0]]);
    if(challenge)grid('blue','蓝色',[508,585,663,741],[566,638,710],'mark',52);
    else {
      row('blue-top','蓝色上排',[585,663,741],565,'mark',52);
      grid('blue','蓝色',[508,585,663,741],[638,710],'mark',52);
    }
    row('green','绿色',line(147,67,11),920,'mark',52);
    row('orange','橙色',line(147,67,11),1045,'number',52);
    row('purple','紫色',line(147,67,11),1170,'number',52);
    // A check over an icon records that its immediate/chain reward was resolved.
    for(const [key,xs,y] of [['yellow',[393],challenge?510:483],['yellow',[393],challenge?583:555],['yellow',[393],challenge?655:627],['yellow',[393],challenge?728:700],['blue',[824],565],['blue',[824],638],['blue',[824],710],['green',line(348,67,8),956],['orange',line(281,67,9),1080],['purple',line(281,67,9),1206]])
      xs.forEach((x,i)=>add(`bonus-${key}-${y}-${i}`,`${({yellow:'黄色',blue:'蓝色',green:'绿色',orange:'橙色',purple:'紫色'})[key]}区奖励已结算`,x,y,30,30));
  }else if(s.version===2){
    const cy=challenge, xs=cy?line(355,76,6):line(358,84,6);
    row('round','轮数',cy?line(230,113,6):line(290,101,6),cy?54:100,'mark',52);
    row('reroll','重投奖励',xs,cy?192:244,'resource',46);
    row('plus','额外骰奖励',xs,cy?307:373,'resource',46);
    row('retrieve','取回骰奖励',xs,cy?432:308,'resource',46);
    grid('silver','银色',cy?line(99,60,6):line(116,56,6),cy?[617,676,736,795]:[514,568,623,678],'mark',46);
    const yellow=cy?[[532,655],[532,731],[597,617],[597,693],[597,768],[663,655],[663,731],[731,617],[731,693],[731,768]]:
      [[516,552],[516,623],[584,515],[584,587],[584,659],[652,552],[652,623],[720,515],[720,587],[720,659]];
    yellow.forEach(([x,y],i)=>add(`yellow-${i}`,`黄色 ${i+1}（先圈后叉）`,x,y,52,52,'resource'));
    row('blue','蓝色',cy?line(140,60,12):line(118,62,12),cy?947:846,'number',48);
    row('green','绿色',cy?line(140,60,12):line(118,62,12),cy?1068:966,'number',48);
    row('pink','粉色',cy?line(140,60,12):line(118,62,12),cy?1187:1068,'number',48);
    row('silver-bonus','银色列奖励',cy?line(99,60,6):line(116,56,6),cy?544:443,'mark',30);
    row('blue-bonus','蓝色奖励',cy?line(199,59,11):line(180,62,11),cy?981:880,'mark',27);
    row('green-bonus','绿色奖励',cy?line(199,59,11):line(180,62,11),cy?1102:1000,'mark',27);
    row('pink-bonus','粉色奖励',cy?line(258,59,10):line(242,62,10),cy?1220:1101,'mark',27);
  }else if(s.version===3){
    const cy=challenge;
    row('round','轮数',cy?line(292,100,6):line(237,108,6),cy?105:56,'mark',50);
    row('reroll','重投奖励',cy?line(365,70,7):line(320,75,7),cy?228:194,'resource',45);
    row('wild','任意点数奖励',cy?line(365,70,7):line(320,75,7),cy?307:317,'resource',45);
    row('plus','额外骰奖励',cy?line(365,70,7):line(320,75,7),cy?385:439,'resource',45);
    grid('yellow','黄色',cy?[134,190,247,303,359,415]:[139,194,249,305,359,414],cy?[538,646,753]:[606,714,821],'mark',43);
    grid('teal','青绿',cy?[508,556,605,654,703,752]:[510,559,607,655,703,751],cy?[524,572,621,670,719]:[593,641,689,737,785],'mark',38);
    const blues=cy?[98,157,215,273,332,390,500,559,618,677,736,795]:[100,160,220,280,340,400,500,560,620,680,740,800];
    row('blue','蓝色（从 7 向两边填）',blues,cy?865:928,'number',45);
    row('brown','棕色',cy?line(146,59,12):line(147,59,12),cy?1031:1090,'mark',43);
    row('pink','粉色',cy?line(141,59,12):line(146,59,12),cy?1130:1187,'number',43);
    grid('yellow-bonus','黄色奖励',cy?[134,190,247,303,359,415]:[139,194,249,305,359,414],cy?[588,698]:[660,768],'mark',28);
    row('teal-bonus','青绿列奖励',cy?[508,556,605,654,703,752]:[510,559,607,655,703,751],cy?776:838,'mark',27);
    row('pink-bonus','粉色奖励',cy?line(200,59,11):line(205,59,11),cy?1162:1217,'mark',27);
  }else{
    row('round','轮数',line(230,112,6),84,'mark',51);
    const resx=[291,329,367,405,443,481,519];
    resx.forEach((x,i)=>add(`reroll-${i}`,`重投奖励 ${i+1}`,x,i%2?253:229,35,35,'resource'));
    resx.forEach((x,i)=>add(`plus-${i}`,`额外骰奖励 ${i+1}`,x,i%2?375:351,35,35,'resource'));
    grid('polish','擦亮骰奖励',[682,734,786],[301,363],'resource',35);
    row('plus-extra','额外骰加赠',[682,734,786],240,'resource',35);
    grid('yellow','黄色',[138,193,247,301,355],[503,582,663],'number',43);
    grid('blue','蓝色',[532,576,620,664,708,752],[469,513,556,599,643,686],'mark',33);
    grid('silver','灰色',line(111,34.4,16),[813,846,879,913],'mark',28);
    // Each green square contains an upper and a lower triangle.
    row('green-upper','绿色上三角',line(150,62,11),1009,'number',37,27);
    row('green-lower','绿色下三角',line(150,62,11),1036,'number',37,27);
    row('pink','粉色',line(146,58,12),1126,'number',44);
    row('yellow-bonus','黄色奖励',[193,247,301,355],532,'mark',27);
    row('yellow-bonus2','黄色奖励',[138,193,247,301,355],611,'mark',27);
    row('green-bonus','绿色奖励',line(150,62,11),1052,'mark',24);
    row('pink-bonus','粉色奖励',line(146,58,12),1154,'mark',24);
  }
  cache.set(id,cells);
  return cells;
}
