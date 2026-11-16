import {initialCamera, cameraBox, zoomCamera, fitCamera, panCamera, INITIAL_ZOOM, MIN_ZOOM, MAX_ZOOM} from '../camera.js';
import {DEFINITIONS,EPS,area,distance,polygon,relation,analyze,intersection,sameRegion,isSquare,squarePieces,initialPieces,snapCandidates,centroid} from '../geometry.js';
import {History,parseDocument,makeDocument,validatePieces} from '../state.js';

export function runTests(test, assert) {
test('表示倍率の初期値と上下限',()=>{assert.equal(initialCamera().zoom,1.35);assert.equal(zoomCamera(initialCamera(),100).zoom,MAX_ZOOM);assert.equal(zoomCamera(initialCamera(),.001).zoom,MIN_ZOOM);});
test('ズームでカメラ中心と作品データを変えない',()=>{const ps=squarePieces(),before=JSON.stringify(ps),camera=initialCamera(),box=cameraBox(camera),zoomed=zoomCamera(camera,2),next=cameraBox(zoomed);assert.equal(zoomed.x,camera.x);assert.equal(zoomed.y,camera.y);assert.equal(next.width,box.width/2);assert.equal(next.height,box.height/2);assert.equal(JSON.stringify(ps),before);assert.equal(isSquare(ps),true);});
test('横長・縦長・初期全7ピースを余白込みで全体表示',()=>{for(const points of [[{x:0,y:5},{x:20,y:6}],[{x:9,y:0},{x:10,y:12}],initialPieces().flatMap(polygon)]){const box=cameraBox(fitCamera(points));assert.ok(points.every(p=>p.x>=box.x+.69&&p.x<=box.x+box.width-.69&&p.y>=box.y+.69&&p.y<=box.y+box.height-.69));}});
test('表示移動はピースではなくカメラだけを移動',()=>{const original=initialCamera(),moved=panCamera(original,2,-3);assert.equal(moved.x,original.x-2);assert.equal(moved.y,original.y+3);assert.equal(moved.zoom,original.zoom);assert.equal(original.x,9);});
test('全体表示の空入力・1点・最大倍率',()=>{assert.equal(fitCamera([]).zoom,INITIAL_ZOOM);const c=fitCamera([{x:4,y:7}]);assert.equal(c.x,4);assert.equal(c.y,7);assert.equal(c.zoom,MAX_ZOOM);});

const pt=r=>r.map(([x,y])=>({x,y}));
const box=(x=0,y=0,w=1,h=1)=>pt([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
const piece=(id,x,y,angle=0,flipped=false)=>({id,x,y,angle,flipped});
const translate=(ps,dx,dy)=>ps.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
const rotate=(ps,angle)=>ps.map(p=>{const t=angle*Math.PI/180;return {...p,x:p.x*Math.cos(t)-p.y*Math.sin(t),y:p.x*Math.sin(t)+p.y*Math.cos(t),angle:p.angle+angle};});
const cases=[
 ['頂点同士',box(1,1),'touch'],['頂点と辺の途中',pt([[.5,1],[1.5,2],[-.5,2]]),'touch'],
 ['辺全体',box(1,0),'touch'],['辺の一部',box(1,.4,.5,.3),'touch'],
 ['わずかな内部重複',box(1-1e-6,0),'overlap'],['頂点が辺上で内部も重複',pt([[.5,0],[.8,.5],[.2,.5]]),'overlap'],
 ['離れている',box(1.001,0),'separate'],['内包',box(.2,.2,.2,.2),'overlap']
];
for(const [label,b,r] of cases)test(`SAT: ${label}`,()=>{assert.equal(relation(box(),b),r);assert.equal(relation(b,box()),r);});
function transformPoly(ps,angle,flip=false){const t=angle*Math.PI/180;return ps.map(p=>{const x=flip?-p.x:p.x;return {x:x*Math.cos(t)-p.y*Math.sin(t),y:x*Math.sin(t)+p.y*Math.cos(t)};});}
for(const angle of [45,90,135,225,315])for(const flip of [false,true])test(`回転${angle} / 反転${flip}の接触と重なり`,()=>{for(const [,b,r] of cases)assert.equal(relation(transformPoly(box(),angle,flip),transformPoly(b,angle,flip)),r);});
test('形状・面積・中心・剛体変換の不変量',()=>{assert.deepEqual(DEFINITIONS.map(d=>d.area),[4,4,2,2,2,1,1]);for(const d of DEFINITIONS){const c=centroid(d.points);assert.ok(Math.hypot(c.x,c.y)<EPS);for(let angle=0;angle<360;angle+=45)for(const flipped of [false,true]){const ps=polygon(piece(d.id,5,5,angle,flipped));assert.ok(Math.abs(area(ps)-d.area)<EPS);assert.ok(Math.abs(distance(ps[0],ps[1])-distance(d.points[0],d.points[1]))<EPS||flipped);}}});
test('三角形の角は45/45/90、長さは面積比と整合',()=>{for(const d of DEFINITIONS.filter(d=>d.points.length===3)){const ls=d.points.map((p,i)=>distance(p,d.points[(i+1)%3])).sort((a,b)=>a-b);assert.ok(Math.abs(ls[0]-ls[1])<EPS);assert.ok(Math.abs(ls[2]**2-ls[0]**2-ls[1]**2)<EPS);}});
test('7枚の正方形：辺接触による連結・非重複',()=>{assert.deepEqual(analyze(squarePieces()),{overlaps:[],connected:true,area:16});});
test('点接触のみの連結',()=>{const p=piece(3,5,5),q=piece(4,0,0);const a=polygon(p),b=polygon(q);q.x=a[1].x-b[3].x;q.y=a[1].y-b[3].y;assert.equal(relation(polygon(p),polygon(q)),'touch');assert.equal(analyze([p,q]).connected,true);});
test('鎖状接触・非連結',()=>{const ps=squarePieces();assert.equal(analyze(ps).connected,true);assert.equal(analyze(translate([ps[0]],5,0).concat(ps.slice(1))).connected,false);assert.equal(analyze(initialPieces()).connected,false);});
test('凸多角形の交差面積',()=>{assert.equal(area(intersection(box(),box(.5,.5))),.25);assert.equal(area(intersection(box(),box(1,0))),0);assert.equal(area(intersection(box(),box(2,0))),0);});
test('同一配置でシルエット正解',()=>assert.equal(sameRegion(squarePieces(),squarePieces()),true));
test('別解：正方形全体を90度回転して同じ領域を覆う',()=>{const target=squarePieces(),alt=translate(rotate(translate(target,-10,-5),90),10,5);assert.notDeepEqual(alt,target);assert.equal(sameRegion(alt,target),true);});
test('別解：同じ大三角形同士を交換',()=>{const ps=squarePieces(),alt=structuredClone(ps);alt[0]={...ps[1],id:0,angle:270};alt[1]={...ps[0],id:1,angle:90};assert.equal(sameRegion(alt,ps),true);});
test('隙間と領域外のはみ出しは不正解',()=>{const ps=squarePieces(),alt=structuredClone(ps);alt[0].y-=.01;assert.equal(sameRegion(alt,ps),false);});
test('重なりのある解答は不正解',()=>{const ps=squarePieces(),alt=structuredClone(ps);alt[0].y+=.01;assert.equal(sameRegion(alt,ps),false);});
test('同じ外接矩形でも異なる領域なら不正解',()=>{const a=[piece(5,5,5),piece(6,10,5)],b=[piece(5,5,5,180),piece(6,10,5,180)];assert.equal(sameRegion(a,b),false);});
test('点接触を含む領域比較',()=>{const ps=[piece(5,3,3),piece(6,8,8)];assert.equal(sameRegion(ps,structuredClone(ps)),true);});
test('どの向きの正方形でも正解',()=>{for(let a=0;a<360;a+=45)assert.equal(isSquare(rotate(squarePieces(),a)),true);});
test('隙間・重なり・長方形は正方形でない',()=>{assert.equal(isSquare(initialPieces()),false);const ps=squarePieces();ps[0].y+=.001;assert.equal(isSquare(ps),false);assert.equal(isSquare([piece(3,5,5),piece(4,10,5)]),false);});
test('2ピースの正方形',()=>{const ps=[piece(5,5,5),piece(6,5,5+2/3,270)];assert.equal(analyze(ps).overlaps.length,0);assert.equal(isSquare(ps),true);});
test('頂点と辺へのスナップ候補',()=>{const ps=squarePieces(),p={...ps[0],y:ps[0].y-.05};const options=snapCandidates(p,ps.slice(1));assert.ok(options.some(q=>Math.abs(q.y-ps[0].y)<EPS&&analyze([q,...ps.slice(1)]).overlaps.length===0));});
test('2〜7ピースと面積合計',()=>{for(let n=2;n<=7;n++){const ps=initialPieces().slice(0,n);assert.equal(validatePieces(ps).length,n);assert.equal(analyze(ps).area,DEFINITIONS.slice(0,n).reduce((s,d)=>s+d.area,0));}assert.throws(()=>validatePieces(initialPieces().slice(0,1)));});
test('Undo・Redo・分岐・コピー分離',()=>{const h=new History({x:0});h.push({x:1});h.push({x:2});assert.equal(h.undo().x,1);assert.equal(h.redo().x,2);h.undo();h.push({x:3});assert.equal(h.canRedo,false);const v=h.undo();v.x=99;assert.equal(h.redo().x,3);});
test('JSON問題・制作途中・正方形の往復',()=>{for(const kind of ['draft','problem','square']){const doc=makeDocument('面積の研究',squarePieces(),kind);assert.equal(JSON.stringify(parseDocument(JSON.stringify(doc))),JSON.stringify(doc));}const draft=makeDocument('途中',initialPieces());assert.equal(JSON.stringify(parseDocument(JSON.stringify(draft))),JSON.stringify(draft));});
test('不正JSON・重複・非有限・角度・範囲・不連結問題を拒否',()=>{assert.throws(()=>parseDocument('{'));assert.throws(()=>parseDocument('{"format":"unknown"}'));const d=makeDocument('テスト',initialPieces());for(const mutate of [x=>x.pieces[0].id=1,x=>x.pieces[0].x=Infinity,x=>x.pieces[0].angle=5,x=>x.pieces[0].x=-50,x=>x.pieces[0].flipped='yes',x=>x.kind='problem',x=>x.kind='square',x=>x.version=2,x=>x.title='x'.repeat(101)]){const bad=structuredClone(d);mutate(bad);assert.throws(()=>parseDocument(JSON.stringify(bad)));}});
test('JSONの重なり配置を拒否',()=>{const ps=squarePieces();ps[0].y+=.01;assert.throws(()=>parseDocument(JSON.stringify(makeDocument('重複',ps))));});
test('実際の鎖：小三角形→正方形→小三角形',()=>{const a=piece(5,4,4),b=piece(3,6,4),c=piece(6,8,4);const ap=polygon(a),bp=polygon(b);const right=ap.reduce((p,q)=>p.x>q.x?p:q),left=bp.reduce((p,q)=>p.x<q.x?p:q);b.x+=right.x-left.x;b.y+=right.y-left.y;const b2=polygon(b),cp=polygon(c),br=b2.reduce((p,q)=>p.x>q.x?p:q),cl=cp.reduce((p,q)=>p.x<q.x?p:q);c.x+=br.x-cl.x;c.y+=br.y-cl.y;assert.equal(analyze([a,b,c]).overlaps.length,0);assert.equal(analyze([a,b,c]).connected,true);assert.equal(relation(polygon(a),polygon(c)),'separate');});
test('点接触のシルエットも一致・移動すると不一致',()=>{const p=piece(3,5,5),q=piece(4,0,0),a=polygon(p),b=polygon(q);q.x=a[1].x-b[3].x;q.y=a[1].y-b[3].y;assert.equal(analyze([p,q]).connected,true);assert.equal(sameRegion([p,q],[p,q]),true);assert.equal(sameRegion([p,{...q,x:q.x+.001}],[p,q]),false);});
test('反転した全7ピースも面積と領域比較を保つ',()=>{const mirrored=squarePieces().map(p=>({...p,x:20-p.x,angle:-p.angle,flipped:!p.flipped}));assert.equal(isSquare(mirrored),true);assert.equal(sameRegion(mirrored,squarePieces()),true);});
test('過大・空・8枚・異なる型のファイルを拒否',()=>{assert.throws(()=>parseDocument(' '.repeat(100001)));for(const ps of [[],initialPieces().concat(initialPieces()[0]),null])assert.throws(()=>validatePieces(ps));for(const d of [null,[],{format:'tangram-lab',version:1,kind:'draft',title:4,pieces:initialPieces()}])assert.throws(()=>parseDocument(JSON.stringify(d)));});
test('部分辺接触による小三角形と平行四辺形の連結',()=>{const ps=squarePieces().filter(p=>[4,5].includes(p.id));assert.equal(relation(...ps.map(polygon)),'touch');assert.equal(analyze(ps).connected,true);});
test('履歴は最大150件、リセット後はUndo不可',()=>{const h=new History(0);for(let i=1;i<200;i++)h.push(i);assert.equal(h.items.length,150);h.reset(3);assert.equal(h.canUndo,false);assert.equal(h.redo(),3);});

test('2軸の微小なずれでも、頂点スナップで厳密に配置できる',()=>{const target=squarePieces();for(const original of target){const shifted={...original,x:original.x+.0004,y:original.y-.0006};const others=target.filter(p=>p.id!==original.id);const found=snapCandidates(shifted,others,target).find(p=>!analyze([...others,p]).overlaps.length);assert.ok(found);assert.ok(distance(found,original)<EPS);assert.equal(sameRegion([...others,found],target),true);}});
}
