import {boardPreviews} from './board-previews.js';
import {assetUrl} from './asset-url.js';

export function boardImageSource(front,{width=240,height=240,zoom=1,pixelRatio=1}={}){
  const preview=Object.hasOwn(boardPreviews,front)?boardPreviews[front]:undefined;
  if(!preview)return front;
  const scale=zoom*Math.min(2,Math.max(1,pixelRatio));
  return width*scale<=preview.width*1.1&&height*scale<=preview.height*1.1?preview.src:front;
}

// Keep the current image visible until a sharper replacement has decoded.
export function updateBoardImage(image,front,options){
  const full=assetUrl(front),source=assetUrl(boardImageSource(front,options));
  if(image.dataset.boardFull===full&&image.dataset.boardResolution==='full')return;
  if(image.dataset.boardRequested===source)return;
  image.dataset.boardFull=full;image.dataset.boardRequested=source;
  const commit=()=>{
    if(image.dataset.boardRequested!==source)return;
    image.src=source;image.dataset.boardResolution=source===full?'full':'preview';
    image.onerror=()=>{if(source!==full&&image.dataset.boardRequested===source){image.dataset.boardRequested=full;image.dataset.boardResolution='full';image.onerror=null;image.src=full;}};
  };
  if(!image.getAttribute('src')||source!==full){commit();return;}
  const replacement=new Image();replacement.src=source;
  replacement.decode().then(()=>{if(image.isConnected)commit();}).catch(()=>{});
}
