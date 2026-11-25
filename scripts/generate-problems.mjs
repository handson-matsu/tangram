// Original, seeded edge-attachment construction. No external puzzle sources.
import {polygon, analyze, squarePieces} from '../geometry.js';
import {simpleOutline, silhouetteKey, outlineMetrics, edgeConnected} from '../outline.js';
export function generateProblems() {
  let seed=20261125;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pick=a=>a[Math.floor(random()*a.length)];
  const keys=new Set(), result=[];
  function position(ps) {
    let points=ps.flatMap(polygon),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    if(maxX-minX>8.2||maxY-minY>5.7)return null;
    const dx=14.8-(minX+maxX)/2,dy=8-(minY+maxY)/2;
    return ps.map(p=>({...p,x:Number((p.x+dx).toFixed(12)),y:Number((p.y+dy).toFixed(12))})).sort((a,b)=>a.id-b.id);
  }
  function grow(ids) {
    const order=[...ids];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const pieces=[{id:order[0],x:0,y:0,angle:0,flipped:false}];
    for(const id of order.slice(1)) {
      let found=false;
      for(let attempt=0;attempt<240;attempt++) {
        const boundary=simpleOutline(pieces);if(!boundary)return null;
        const ai=Math.floor(random()*boundary.length),a=boundary[ai],b=boundary[(ai+1)%boundary.length];
        let next={id,x:0,y:0,angle:0,flipped:random()<.5},ps=polygon(next),i=Math.floor(random()*ps.length),u=ps[i],v=ps[(i+1)%ps.length];
        const angle=(Math.atan2(a.y-b.y,a.x-b.x)-Math.atan2(v.y-u.y,v.x-u.x))*180/Math.PI;
        next.angle=((Math.round(angle/45)*45)%360+360)%360;ps=polygon(next);u=ps[i];v=ps[(i+1)%ps.length];
        const align=pick([0,1,.5]);
        next.x=(1-align)*b.x+align*a.x-((1-align)*u.x+align*v.x);
        next.y=(1-align)*b.y+align*a.y-((1-align)*u.y+align*v.y);
        const candidate=[...pieces,next];
        if(analyze(candidate).overlaps.length||!edgeConnected(candidate)||!simpleOutline(candidate))continue;
        pieces.push(next);found=true;break;
      }
      if(!found)return null;
    }
    return position(pieces);
  }
  function add(level,ps) {
    const placed=position(ps);if(!placed)return false;
    const key=silhouetteKey(placed);if(keys.has(key))return false;
    keys.add(key);result.push({number:result.length+1,level,pieces:placed});return true;
  }
  // First problem: independently assemble two small triangles along their hypotenuses.
  add(1,[{id:5,x:0,y:0,angle:0,flipped:false},{id:6,x:0,y:2/3,angle:270,flipped:false}]);
  const sets=[[3,5],[2,5,6],[4,5,6],[0,5,6],[2,3,5,6],[0,2,5,6],[0,2,3,5,6],[0,3,4,5,6],[1,2,4,5,6]];
  for(const ids of sets) {
    let done=false;
    for(let n=0;n<2000&&!done;n++){const ps=grow(ids);if(ps&&outlineMetrics(ps).corners<=10)done=add(result.length<5?1:2,ps);}
    if(!done)throw Error('初級問題の構成失敗');
  }
  // One familiar convex target starts Level 3; other targets vary in concavity.
  add(3,squarePieces());
  for(const level of [3,4]) {
    let tries=0;
    while(result.length<(level===3?15:20)&&tries++<20000) {
      const ps=grow([0,1,2,3,4,5,6]);if(!ps)continue;
      const m=outlineMetrics(ps);
      if(level===3&&(m.concave<2||m.concave>4||m.corners>12))continue;
      if(level===4&&(m.concave<5||m.corners<13))continue;
      add(level,ps);
    }
    if(result.length<(level===3?15:20))throw Error('上級問題の構成失敗');
  }
  return result;
}
