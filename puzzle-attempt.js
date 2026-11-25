// The answer tray can extend beyond the JSON document's original 20 x 12 area.
// Keep the public file validator unchanged, including compatibility with cached modules.
import {validatePieces} from './state.js';
import {polygon} from './geometry.js';
export function validatePuzzleAttempt(value,bounds) {
  if(!Array.isArray(value))throw Error('解答のピースが不正です。');
  // Reuse the public ID / count / angle / reflection validation at a neutral position.
  const metadata=validatePieces(value.map(p=>({...p,x:4,y:4})));
  return metadata.map((p,i)=>{
    const {x,y}=value[i];
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>100||Math.abs(y)>100)throw Error('解答の位置が不正です。');
    const piece={...p,x,y};
    if(polygon(piece).some(v=>v.x<bounds.minX-1e-8||v.x>bounds.maxX+1e-8||v.y<bounds.minY-1e-8||v.y>bounds.maxY+1e-8))throw Error('解答が操作範囲外です。');
    return piece;
  });
}
