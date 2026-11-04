// Keep image strings out of serialized history. Unchanged asset records are
// shared by snapshots; restored sessions always receive fresh mutable records.
export function createHistoryCodec(){
  let previous=new Map();
  return {
    clear(){previous.clear();},
    capture(session){
      const {assets,...rest}=session,next=new Map();
      const resources=assets.map(asset=>{
        const {front,back,...metadata}=asset,data=JSON.stringify(metadata);
        const old=previous.get(asset.id);
        const resource=old&&old.data===data&&old.front===front&&old.back===back
          ?old:Object.freeze({data,front,back});
        next.set(asset.id,resource);return resource;
      });
      previous=next;
      return {data:JSON.stringify(rest),assets:resources};
    },
    restore(snapshot){
      return {...JSON.parse(snapshot.data),assets:snapshot.assets.map(({data,front,back})=>{
        const asset={...JSON.parse(data),front};if(back!==undefined)asset.back=back;return asset;
      })};
    }
  };
}
