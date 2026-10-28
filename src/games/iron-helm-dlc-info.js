// Source titles and equipment traits, verified from the printed fronts.
const a=(p,n,c)=>`ih-dlc-${p}-p${n}c${c}`;
const rows=[
 ['ap1',29,3,'斧技精通'],['ap1',29,4,'战斧',4,3,'main'],['ap1',29,5,'忏悔胸针'],
 ['ap2',33,4,'驯鹰'],['ap2',33,5,'炼金腰包',2,1,'accessory'],['ap2',33,6,'弯刀'],
 ['ap3',37,4,'第六感'],['ap3',37,5,'胡尔诺特之酿'],['ap3',37,6,'月刃匕首',2,1,'main'],['ap3',37,7,'大型背包'],
 ['ap4',41,6,'战术'],['ap4',41,7,'羊毛斗篷',1,1,'accessory'],['ap4',41,8,'矮人利刃',3,2,'main'],
 ['ap5',45,7,'疾行'],['ap5',45,8,'水壶',1,1,'accessory'],['ap5',45,9,'朝圣者之杖',3,2,'main'],
 ['ap6',49,8,'生命汲取'],['ap6',49,9,'乌鸦法杖',2,1,'main'],['ap6',51,1,'女巫面包'],
 ['loot-lore',57,7,'坚韧'],['loot-lore',57,8,'寻宝者'],['loot-lore',57,9,'徒手格斗'],
 ['loot-lore',59,1,'战矛',4,3,'main'],['loot-lore',59,2,'头骨',2,1,'off'],['loot-lore',59,3,'荧光蘑菇',2,1,'accessory'],
 ['fanny',71,3,'幸运药水'],['fanny',71,4,'腰包',2,1,'accessory'],['fanny',71,5,'魔法橡果'],
 ['henchmen',73,9,'信仰念珠'],['henchmen',75,1,'磨刀石'],['henchmen',75,2,'毒镖'],['henchmen',75,3,'大蒜'],['henchmen',75,4,'火焰法典'],['henchmen',75,5,'寒冰法典'],['henchmen',75,6,'拳刃'],['henchmen',75,7,'铆接兜帽'],
 ['anemic',99,7,'毒血'],['anemic',99,8,'利事佬'],['anemic',99,9,'黑暗技艺'],['anemic',101,1,'迅不可视'],['anemic',101,2,'相位移动'],['anemic',101,3,'狂怒拳'],['anemic',101,4,'野兽歌词'],
 ['anemic',101,5,'斧头吉他',5,3,'main'],['anemic',101,6,'钉饰夹克',3,2,'body'],['anemic',101,7,'神之炸弹'],['anemic',101,8,'阿普尔顿之剑',12,3,'main'],['anemic',101,9,'武士刀',5,2,'main'],
 ...['矮人','鱼人','半身人','森林精灵','半兽人','侏儒','鸦人','人类'].map((name,i)=>['iron-chest',81,i+2,`${name} / 职业（双面）`])
];
export const DLC_CARD_INFO=Object.fromEntries(rows.map(([p,n,c,name,cost,weight,slot])=>[a(p,n,c),{name,...(cost!==undefined?{cost,weight,slot}:{})}]));
