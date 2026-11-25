// Coordinates are measured in units whose square has area one small triangle.
export const EPS = 1e-8;
export const AREA_EPS = 1e-7;
export const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function signedArea(p) { return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-a.y*b.x;},0)/2; }
export const area = p => Math.abs(signedArea(p));
export function centroid(p) {const a=signedArea(p);return p.reduce((s,v,i)=>{const w=p[(i+1)%p.length], c=v.x*w.y-w.x*v.y;return {x:s.x+(v.x+w.x)*c/(6*a),y:s.y+(v.y+w.y)*c/(6*a)};},{x:0,y:0});}
const raw = [
 [[0,0],[4,0],[2,2]], [[0,0],[2,2],[0,4]], [[4,2],[4,4],[2,4]],
 [[2,2],[3,1],[4,2],[3,3]], [[0,4],[1,3],[3,3],[2,4]],
 [[2,2],[1,3],[3,3]], [[4,0],[4,2],[3,1]]
];
const names=['大三角形 A','大三角形 B','中三角形','正方形','平行四辺形','小三角形 A','小三角形 B'];
const colors=['#e99142','#eec45a','#5eaaa4','#6b91c2','#b88abb','#df7f83','#8db66e'];
export const DEFINITIONS=raw.map((r,id)=>{let p=r.map(([x,y])=>({x,y}));if(signedArea(p)<0)p.reverse();const c=centroid(p);return {id,name:names[id],color:colors[id],area:area(p),center:c,points:p.map(v=>({x:v.x-c.x,y:v.y-c.y}))};});
export function polygon(piece) {const t=piece.angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);let p=DEFINITIONS[piece.id].points.map(v=>{const x=piece.flipped?-v.x:v.x;return {x:piece.x+x*c-v.y*s,y:piece.y+x*s+v.y*c};});if(signedArea(p)<0)p.reverse();return p;}
export function projection(p,axis) {const values=p.map(v=>v.x*axis.x+v.y*axis.y);return {min:Math.min(...values),max:Math.max(...values)};}
// SAT distinguishes boundary contact from positive-area intersection. Axes are normalized.
export function relation(a,b) {let touch=false;for(const p of [a,b])for(let i=0;i<p.length;i++){const v=p[i],w=p[(i+1)%p.length],len=distance(v,w),axis={x:-(w.y-v.y)/len,y:(w.x-v.x)/len};const x=projection(a,axis),y=projection(b,axis),overlap=Math.min(x.max,y.max)-Math.max(x.min,y.min);if(overlap < -EPS)return 'separate';if(overlap <= EPS)touch=true;}return touch?'touch':'overlap';}
export function analyze(pieces) {const ps=pieces.map(polygon),adj=ps.map(()=>[]),overlaps=[];for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const r=relation(ps[i],ps[j]);if(r==='overlap')overlaps.push([pieces[i].id,pieces[j].id]);if(r!=='separate'){adj[i].push(j);adj[j].push(i);}}const seen=new Set(),visit=i=>{if(seen.has(i))return;seen.add(i);adj[i].forEach(visit);};if(ps.length)visit(0);return {overlaps,connected:ps.length>0&&seen.size===ps.length,area:pieces.reduce((s,p)=>s+DEFINITIONS[p.id].area,0)};}
// Sutherland–Hodgman clipping of two CCW convex polygons.
export function intersection(a,b) {let result=a.map(v=>({...v}));for(let i=0;i<b.length&&result.length;i++){const u=b[i],v=b[(i+1)%b.length],input=result;result=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],dp=cross(u,v,p),dq=cross(u,v,q),ip=dp>=0,iq=dq>=0;if(ip)result.push(p);if(ip!==iq){const t=dp/(dp-dq);result.push({x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y)});}}}return result;}
export function sameRegion(answer,target) {if(!answer.length||!target.length||analyze(answer).overlaps.length||analyze(target).overlaps.length)return false;const a=answer.map(polygon),b=target.map(polygon);const total=a.reduce((s,p)=>s+area(p),0)+b.reduce((s,p)=>s+area(p),0);let shared=0;for(const p of a)for(const q of b)shared+=area(intersection(p,q));return Math.abs(total-2*shared)<=AREA_EPS;}
export function convexHull(points) {const ps=[...points].sort((a,b)=>a.x-b.x||a.y-b.y).filter((v,i,a)=>!i||distance(v,a[i-1])>EPS);if(ps.length<3)return ps;const half=p=>{const h=[];for(const v of p){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],v)<=EPS)h.pop();h.push(v);}return h;};return [...half(ps).slice(0,-1),...half([...ps].reverse()).slice(0,-1)];}
export function isSquare(pieces) {const info=analyze(pieces);if(pieces.length<2||info.overlaps.length)return false;const hull=convexHull(pieces.flatMap(polygon));if(hull.length!==4||Math.abs(area(hull)-info.area)>AREA_EPS)return false;const lengths=hull.map((p,i)=>distance(p,hull[(i+1)%4]));if(Math.max(...lengths)-Math.min(...lengths)>EPS*10)return false;return hull.every((p,i)=>{const a=hull[(i+1)%4],b=hull[(i+2)%4];return Math.abs((a.x-p.x)*(b.x-a.x)+(a.y-p.y)*(b.y-a.y))<AREA_EPS;});}
export function nearestOnSegment(p,a,b) {const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return {x:a.x+t*dx,y:a.y+t*dy};}
// Vertex snaps constrain both coordinates. Prefer them before edge projections,
// which alone can leave a small tangential error and make exact coverage difficult.
export function snapCandidates(piece, others, target = [], radius = .18) {
  const own = polygon(piece);
  const polys = [...others.map(polygon), ...target.map(polygon)];
  const deltas = [];
  function add(a, b, vertex) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d <= radius) deltas.push({ dx, dy, d, vertex });
  }
  for (const p of polys) {
    for (const a of own) {
      for (const b of p) add(a, b, true);
      for (let j = 0; j < p.length; j++)
        add(a, nearestOnSegment(a, p[j], p[(j + 1) % p.length]), false);
    }
    for (const b of p)
      for (let j = 0; j < own.length; j++)
        add(nearestOnSegment(b, own[j], own[(j + 1) % own.length]), b, false);
  }
  return deltas.sort((a, b) => Number(b.vertex) - Number(a.vertex) || a.d - b.d)
    .map(d => ({ ...piece, x: piece.x + d.dx, y: piece.y + d.dy }));
}
export const initialPieces=()=>DEFINITIONS.map((d,i)=>({id:i,x:[3,41/6,61/6,13,3,27/4,121/12][i],y:i<4?3:7,angle:0,flipped:false}));
export const squarePieces=()=>DEFINITIONS.map(d=>({id:d.id,x:d.center.x+8,y:d.center.y+3,angle:0,flipped:false}));
