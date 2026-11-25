// Stable puzzle staging: translations only, one common SVG scale.
import {polygon} from './geometry.js';
import {makeDocument} from './state.js';
export const PUZZLE_LAYOUT_VERSION = 2;
const GAP=.45, SEPARATION=1.2, MARGIN=.8;
export function pieceBounds(pieces) {
  const points=pieces.flatMap(polygon);
  if(!points.length)return {minX:0,minY:0,maxX:0,maxY:0,width:0,height:0};
  const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
  const maxX=Math.max(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.y));
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
}
export function normalizePuzzleProblem(document) {
  if(!document)return null;
  const b=pieceBounds(document.pieces);
  const left=Math.min(MARGIN,Math.max(0,(20-b.width)/2));
  let dx=left-b.minX,dy=(12-b.height)/2-b.minY;
  if(Math.abs(dx)<1e-10)dx=0;if(Math.abs(dy)<1e-10)dy=0;
  return makeDocument(document.title,document.pieces.map(p=>({...p,x:p.x+dx,y:p.y+dy})),'problem');
}
function shelfPack(ids,width) {
  const items=ids.map(id=>{
    const piece={id,x:0,y:0,angle:0,flipped:false},b=pieceBounds([piece]);
    return {piece,b};
  }).sort((a,b)=>b.b.height-a.b.height||b.b.width-a.b.width||a.piece.id-b.piece.id);
  let x=0,y=0,rowHeight=0,maxX=0;
  const placed=[];
  for(const {piece,b} of items) {
    if(x&&x+b.width>width+1e-9){y+=rowHeight+GAP;x=0;rowHeight=0;}
    placed.push({...piece,x:x-b.minX,y:y-b.minY});
    maxX=Math.max(maxX,x+b.width);x+=b.width+GAP;rowHeight=Math.max(rowHeight,b.height);
  }
  return {pieces:placed,width:maxX,height:y+rowHeight};
}
export function createPuzzleLayout(document) {
  const problem=normalizePuzzleProblem(document);
  if(!problem)return {problem:null,attempt:{title:'シルエット問題',pieces:[]},bounds:{minX:0,minY:0,maxX:20,maxY:12}};
  const target=pieceBounds(problem.pieces),ids=problem.pieces.map(p=>p.id);
  const smallest=Math.max(...ids.map(id=>pieceBounds([{id,x:0,y:0,angle:0,flipped:false}]).width));
  let best=null;
  for(let width=smallest;width<=16;width+=.25) {
    const packed=shelfPack(ids,width);
    if(packed.height>12-2*MARGIN+1e-8)continue;
    const score=Math.max((target.width+SEPARATION+packed.width+2*MARGIN)/20,(Math.max(target.height,packed.height)+2*MARGIN)/12);
    if(!best||score<best.score-1e-9)best={...packed,score};
  }
  if(!best)throw Error('使用ピースの配置を作成できません。');
  const offsetX=target.maxX+SEPARATION,offsetY=(12-best.height)/2;
  const pieces=best.pieces.map(p=>({...p,x:p.x+offsetX,y:p.y+offsetY})).sort((a,b)=>a.id-b.id);
  return {
    problem,attempt:{title:problem.title,pieces},
    bounds:{minX:0,minY:0,maxX:Math.max(20,offsetX+best.width+MARGIN),maxY:12}
  };
}
// Retain an in-progress legacy answer, including pieces moved outside the new tray.
export function includeAttemptBounds(base,pieces) {
  const b=pieceBounds(pieces);
  const result={minX:Math.min(base.minX,b.minX-MARGIN),minY:Math.min(base.minY,b.minY-MARGIN),maxX:Math.max(base.maxX,b.maxX+MARGIN),maxY:Math.max(base.maxY,b.maxY+MARGIN)};
  if(result.maxX-result.minX>50||result.maxY-result.minY>30)throw Error('保存された解答の表示範囲が大きすぎます。');
  return result;
}
