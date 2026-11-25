import {validatePuzzleAttempt} from '../puzzle-attempt.js';
import {BUILTIN_PROBLEMS,builtinProblem,newAttempt,restorePuzzle} from '../puzzles.js';
import {createPuzzleLayout,pieceBounds,PUZZLE_LAYOUT_VERSION} from '../puzzle-layout.js';
import {polygon,analyze,sameRegion,initialPieces} from '../geometry.js';
import {parseDocument,makeDocument} from '../state.js';
import {fitCamera,cameraBox} from '../camera.js';
const near=(assert,a,b)=>assert.ok(Math.abs(a-b)<1e-7);
export function customChain(ids,angles,axis) {
  const pieces=[];let end=null;
  for(let i=0;i<ids.length;i++){
    let p={id:ids[i],x:0,y:0,angle:angles[i],flipped:false};const vs=polygon(p);
    const lo=vs.reduce((a,b)=>a[axis]<b[axis]?a:b),hi=vs.reduce((a,b)=>a[axis]>b[axis]?a:b);
    if(end){p.x=end.x-lo.x;p.y=end.y-lo.y;}
    pieces.push(p);end={x:hi.x+p.x,y:hi.y+p.y};
  }
  const b=pieceBounds(pieces),dx=axis==='x'?-b.minX:2-b.minX,dy=axis==='y'?-b.minY:2-b.minY;
  return makeDocument('自作配置検証',pieces.map(p=>({...p,x:p.x+dx,y:p.y+dy})),'problem');
}
export function assertStaged(assert,source) {
  const snapshot=JSON.stringify(source),layout=createPuzzleLayout(source),target=pieceBounds(layout.problem.pieces),tray=pieceBounds(layout.attempt.pieces);
  assert.equal(JSON.stringify(source),snapshot);
  assert.ok(target.maxX+1.19<tray.minX);
  assert.equal(analyze(layout.attempt.pieces).overlaps.length,0);
  assert.equal(analyze([...layout.problem.pieces,...layout.attempt.pieces]).overlaps.length,0);
  assert.equal(validatePuzzleAttempt(layout.attempt.pieces,layout.bounds).length,source.pieces.length);
  assert.equal(parseDocument(JSON.stringify(layout.problem)).pieces.length,source.pieces.length);
  near(assert,target.width,pieceBounds(source.pieces).width);near(assert,target.height,pieceBounds(source.pieces).height);
  for(const p of layout.attempt.pieces){
    const q=source.pieces.find(q=>q.id===p.id),a=polygon(p),b=polygon({...q,x:0,y:0,angle:0,flipped:false});
    near(assert,Math.abs((a[1].x-a[0].x)**2+(a[1].y-a[0].y)**2),Math.abs((b[1].x-b[0].x)**2+(b[1].y-b[0].y)**2));
  }
  const points=[...layout.problem.pieces,...layout.attempt.pieces].flatMap(polygon),box=cameraBox(fitCamera(points));
  assert.ok(points.every(p=>p.x>box.x+.69&&p.x<box.x+box.width-.69&&p.y>box.y+.69&&p.y<box.y+box.height-.69));
  assert.equal(JSON.stringify(createPuzzleLayout(layout.problem)),JSON.stringify(layout));
  return layout;
}
export function runLayoutTests(test,assert) {
  for(const q of BUILTIN_PROBLEMS)test(`第${String(q.number).padStart(2,'0')}問：左シルエット・右の使用ピース・同一縮尺・全体収容`,()=>assertStaged(assert,q));
  test('2枚・3枚の使用ピースだけを詰め、未使用7枚分の場所を残さない',()=>{
    for(const ids of [[5,6],[0,6],[3,5,6],[1,2,4]]){
      const source={...builtinProblem(1),pieces:initialPieces().filter(p=>ids.includes(p.id))};
      const layout=createPuzzleLayout(source),b=pieceBounds(layout.attempt.pieces);
      assert.equal(layout.attempt.pieces.length,ids.length);assert.ok(b.width<=8&&b.height<=8);
    }
  });
  test('右上端・左下端の自作問題も外接矩形で同じ左配置になる',()=>{
    const base=builtinProblem(11),b=pieceBounds(base.pieces);
    const corner=(x,y)=>({...base,pieces:base.pieces.map(p=>({...p,x:p.x+x-b.minX,y:p.y+y-b.minY}))});
    const a=assertStaged(assert,corner(0,0)),c=assertStaged(assert,corner(16,8));
    assert.ok(sameRegion(a.problem.pieces,c.problem.pieces));
  });
  test('横長の自作問題は縮尺を変えずに右の操作余白を確保し、JSONも互換',()=>{
    const custom=customChain([0,1,2,3,4,5,6],[0,90,45,0,0,0,90],'x');
    parseDocument(JSON.stringify(custom));const layout=assertStaged(assert,custom);
    assert.ok(layout.bounds.maxX>20);
  });
  test('高さ12の縦長の自作問題も全体表示し、上下を切らない',()=>{
    const custom=customChain([0,1,5,6],[90,0,90,0],'y');
    parseDocument(JSON.stringify(custom));assertStaged(assert,custom);
  });
  test('新しい保存の解答途中・正解配置を平行移動せずに再復元',()=>{
    const source=builtinProblem(20),layout=createPuzzleLayout(source);
    for(const pieces of [layout.attempt.pieces,layout.problem.pieces]){
      const saved={puzzleSelection:{source:'builtin',number:20},puzzleLayoutVersion:PUZZLE_LAYOUT_VERSION,problem:layout.problem,modes:{puzzle:{title:source.title,pieces}}};
      const restored=restorePuzzle(saved);assert.equal(JSON.stringify(restored.attempt.pieces),JSON.stringify(pieces));assert.equal(JSON.stringify(restored.problem),JSON.stringify(layout.problem));
    }
  });
  test('旧配置の未操作状態は左右レイアウトへ移行する',()=>{
    const source=builtinProblem(20),ids=new Set(source.pieces.map(p=>p.id));
    const old=initialPieces().filter(p=>ids.has(p.id));
    const restored=restorePuzzle({problem:source,puzzleSelection:{source:'builtin',number:20},modes:{puzzle:{title:source.title,pieces:old}}});
    assert.equal(JSON.stringify(restored.attempt),JSON.stringify(newAttempt(source)));
  });
  test('旧版の途中配置は問題との相対関係を保って移行し、その後は安定',()=>{
    const source=builtinProblem(20),old=initialPieces();old[0].y+=.2;
    const restored=restorePuzzle({problem:source,puzzleSelection:{source:'builtin',number:20},modes:{puzzle:{title:source.title,pieces:old}}});
    const dx=restored.problem.pieces[0].x-source.pieces[0].x,dy=restored.problem.pieces[0].y-source.pieces[0].y;
    restored.attempt.pieces.forEach((p,i)=>{near(assert,p.x,old[i].x+dx);near(assert,p.y,old[i].y+dy);});
    const again=restorePuzzle({problem:restored.problem,puzzleSelection:{source:'builtin',number:20},puzzleLayoutVersion:PUZZLE_LAYOUT_VERSION,modes:{puzzle:restored.attempt}});
    assert.equal(JSON.stringify(again.attempt),JSON.stringify(restored.attempt));
  });
}
