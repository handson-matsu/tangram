// Boundary analysis for authored problems, independent of the game's contact rules.
import {polygon, cross, distance, signedArea, area} from './geometry.js';
const TOL = 1e-7;
const key = p => `${Math.round(p.x * 1e7)},${Math.round(p.y * 1e7)}`;
export function sharedEdgeLength(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const u = a[i], v = a[(i + 1) % a.length], length = distance(u, v);
    for (let j = 0; j < b.length; j++) {
      const p = b[j], q = b[(j + 1) % b.length];
      if (Math.abs(cross(u, v, p)) / length > TOL || Math.abs(cross(u, v, q)) / length > TOL) continue;
      const t = r => ((r.x-u.x)*(v.x-u.x)+(r.y-u.y)*(v.y-u.y))/length;
      total += Math.max(0, Math.min(length, Math.max(t(p),t(q))) - Math.max(0, Math.min(t(p),t(q))));
    }
  }
  return total;
}
export function edgeConnected(pieces) {
  const polygons = pieces.map(polygon), seen = new Set();
  const visit = i => {if (seen.has(i)) return; seen.add(i); polygons.forEach((p,j) => {if (i!==j && sharedEdgeLength(polygons[i],p)>TOL) visit(j);});};
  if (pieces.length) visit(0);
  return seen.size === pieces.length && pieces.length > 0;
}
export function outlineLoops(pieces) {
  const polygons = pieces.map(polygon), vertices = polygons.flat(), segments = new Map();
  for (const poly of polygons) for (let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length], length=distance(a,b);
    const t = p => ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(length*length);
    const cuts = [a,b,...vertices.filter(p=>Math.abs(cross(a,b,p))/length<TOL && t(p)>TOL && t(p)<1-TOL)]
      .sort((p,q)=>t(p)-t(q)).filter((p,j,ps)=>!j||distance(p,ps[j-1])>TOL);
    for(let j=0;j<cuts.length-1;j++) {
      const u=cuts[j],v=cuts[j+1],ku=key(u),kv=key(v),id=[ku,kv].sort().join('|');
      if(segments.has(id)) segments.delete(id); else segments.set(id,[u,v]);
    }
  }
  const edges=[...segments.values()], outgoing=new Map(), incoming=new Map();
  for(const [a,b] of edges) {
    const ka=key(a),kb=key(b);
    // Reject pinched/self-touching boundaries as well as point-only joins.
    if(outgoing.has(ka)||incoming.has(kb)) return null;
    outgoing.set(ka,[a,b]);incoming.set(kb,true);
  }
  const loops=[];
  while(outgoing.size) {
    const start=outgoing.keys().next().value, loop=[];let current=start;
    do {
      const edge=outgoing.get(current);if(!edge)return null;
      outgoing.delete(current);loop.push(edge[0]);current=key(edge[1]);
    } while(current!==start);
    // Remove collinear subdivisions introduced by T junctions.
    let changed=true;
    while(changed&&loop.length>3) {
      changed=false;
      for(let i=0;i<loop.length;i++) if(Math.abs(cross(loop[(i+loop.length-1)%loop.length],loop[i],loop[(i+1)%loop.length]))<TOL) {loop.splice(i,1);changed=true;break;}
    }
    loops.push(loop);
  }
  return loops;
}
export function simpleOutline(pieces) {
  const loops=outlineLoops(pieces);
  if(!loops||loops.length!==1||signedArea(loops[0])<=0)return null;
  if(Math.abs(area(loops[0])-pieces.map(polygon).reduce((s,p)=>s+area(p),0))>1e-6)return null;
  return loops[0];
}
export function silhouetteKey(pieces) {
  const outline=simpleOutline(pieces);if(!outline)throw Error('単一の穴なし輪郭ではありません');
  const variants=[];
  for(const flip of [-1,1])for(let angle=0;angle<8;angle++) {
    const c=Math.cos(angle*Math.PI/4),s=Math.sin(angle*Math.PI/4);
    const ps=outline.map(p=>({x:flip*p.x*c-p.y*s,y:flip*p.x*s+p.y*c}));
    const minX=Math.min(...ps.map(p=>p.x)),minY=Math.min(...ps.map(p=>p.y));
    variants.push(ps.map(p=>`${Math.round((p.x-minX)*1e6)},${Math.round((p.y-minY)*1e6)}`).sort().join('|'));
  }
  return variants.sort()[0];
}
export function outlineMetrics(pieces) {
  const p=simpleOutline(pieces);if(!p)return null;
  let concave=0,perimeter=0;
  for(let i=0;i<p.length;i++){if(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length])< -TOL)concave++;perimeter+=distance(p[i],p[(i+1)%p.length]);}
  return {corners:p.length,concave,perimeter,area:area(p)};
}
