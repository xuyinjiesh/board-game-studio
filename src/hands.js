import {assetFor} from './model.js';

// Hand membership and order are independent of a card's tabletop coordinates.
// The same objects move between the hand and table, so faces and IDs survive.
export const isHandCard=(s,o)=>o?.type==='card'&&!!s.handZone&&o.handId===s.handZone.id;
export const handCards=s=>s.objects.filter(o=>isHandCard(s,o)).sort((a,b)=>(a.handOrder??0)-(b.handOrder??0));
export const acceptsHandCard=(s,o)=>!!s.handZone&&o?.type==='card'&&!o.locked&&(!s.handZone.acceptGroup||assetFor(s,o.assetId)?.group===s.handZone.acceptGroup);

export function leaveHand(s,o){
  if(!isHandCard(s,o)||o.locked)return false;
  delete o.handId;delete o.handOrder;
  return true;
}
export function insertHandCard(s,o,index=handCards(s).length){
  if(!acceptsHandCard(s,o))return false;
  const cards=handCards(s).filter(c=>c!==o);
  cards.splice(Math.max(0,Math.min(cards.length,Math.round(index))),0,o);
  cards.forEach((card,i)=>{card.handId=s.handZone.id;card.handOrder=i;});
  return true;
}
export function sortHand(s,by='suit'){
  const cards=handCards(s),suits=s.handZone?.suits||[];
  const suit=a=>suits.includes(a.suit)?suits.indexOf(a.suit):suits.length;
  const number=a=>Number.isFinite(a.number)?a.number:0;
  cards.sort((a,b)=>{
    const aa=assetFor(s,a.assetId),bb=assetFor(s,b.assetId);
    return (by==='number'?number(aa)-number(bb):suit(aa)-suit(bb))||(by==='number'?suit(aa)-suit(bb):number(aa)-number(bb))||(a.handOrder??0)-(b.handOrder??0);
  });
  cards.forEach((o,i)=>o.handOrder=i);
}

export function handFan(count,availableWidth){
  const width=Math.max(160,availableWidth),cardWidth=Math.min(128,Math.max(86,width*.24));
  const step=count>1?Math.min(cardWidth*.63,(width-cardWidth-16)/(count-1)):0;
  return Array.from({length:count},(_,i)=>{
    const t=count>1?(i-(count-1)/2)/((count-1)/2):0;
    return {x:(i-(count-1)/2)*step,y:14+t*t*11,angle:t*Math.min(7,(count-1)*1.5),width:cardWidth,height:cardWidth*1.397,z:10+i};
  });
}
