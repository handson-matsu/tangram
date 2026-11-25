import {createPuzzleLayout,PUZZLE_LAYOUT_VERSION} from '../puzzle-layout.js';
import {BUILTIN_PROBLEMS,builtinProblem,newAttempt,restorePuzzle} from '../puzzles.js';
import {PROBLEM_DATA} from '../problems-data.js';
import {polygon,analyze,area,distance,initialPieces,squarePieces,sameRegion} from '../geometry.js';
import {simpleOutline,outlineLoops,edgeConnected,silhouetteKey,outlineMetrics} from '../outline.js';
import {parseDocument,makeDocument} from '../state.js';
import {regionPath} from '../silhouette.js';
import {generateProblems} from '../scripts/generate-problems.mjs';
const near=(assert,a,b)=>assert.ok(Math.abs(a-b)<1e-7);
const bounds=ps=>({minX:Math.min(...ps.map(p=>p.x)),maxX:Math.max(...ps.map(p=>p.x)),minY:Math.min(...ps.map(p=>p.y)),maxY:Math.max(...ps.map(p=>p.y))});
export function runPuzzleTests(test,assert) {
  test('初期配置：形状・大きさを保ち、列内の隙間と行間を半分にする',()=>{
    const current=initialPieces(),old=current.map((p,i)=>({...p,x:[3,8,12,16,3,8,13][i],y:i<4?3:8}));
    assert.equal(analyze(current).overlaps.length,0);
    for(const row of [[0,1,2,3],[4,5,6]])for(let i=1;i<row.length;i++){
      const prev=bounds(polygon(current[row[i-1]])),next=bounds(polygon(current[row[i]]));
      const a=bounds(polygon(old[row[i-1]])),b=bounds(polygon(old[row[i]]));
      near(assert,next.minX-prev.maxX,(b.minX-a.maxX)/2);
    }
    const top=bounds(current.slice(0,4).flatMap(polygon)),bottom=bounds(current.slice(4).flatMap(polygon));
    near(assert,bottom.minY-top.maxY,1);
    for(let i=0;i<7;i++){
      const a=polygon(current[i]),b=polygon(old[i]);near(assert,area(a),area(b));
      for(let j=0;j<a.length;j++)near(assert,distance(a[j],a[(j+1)%a.length]),distance(b[j],b[(j+1)%b.length]));
    }
  });
  test('固定問題：20問・各レベル5問・指定枚数・番号だけのタイトル',()=>{
    assert.equal(BUILTIN_PROBLEMS.length,20);
    for(let i=0;i<20;i++){
      const q=BUILTIN_PROBLEMS[i];assert.equal(q.number,i+1);assert.equal(q.level,Math.floor(i/5)+1);
      assert.equal(q.title,`Level ${q.level} · 第${String(i+1).padStart(2,'0')}問`);
      assert.ok(q.level===1?q.pieces.length>=2&&q.pieces.length<=3:q.level===2?q.pieces.length>=4&&q.pieces.length<=5:q.pieces.length===7);
    }
  });
  for(const q of BUILTIN_PROBLEMS) {
    test(`第${String(q.number).padStart(2,'0')}問：解答・和集合シルエット・辺連結・穴なし・JSON・正解判定`,()=>{
      const ps=q.pieces, info=analyze(ps),parsed=parseDocument(JSON.stringify(q));
      assert.equal(info.overlaps.length,0);assert.equal(info.connected,true);assert.ok(edgeConnected(ps));
      const outline=simpleOutline(ps);assert.ok(outline);assert.equal(outlineLoops(ps).length,1);near(assert,area(outline),info.area);
      assert.equal(sameRegion(ps,parsed.pieces),true);
      const path=regionPath(ps),parts=path.split('M').filter(Boolean);
      assert.equal(parts.length,ps.length);
      const regions=parts.map(s=>s.replace('Z','').split('L').map(v=>{const [x,y]=v.split(',').map(Number);return {x,y};}));
      regions.forEach((p,i)=>{assert.equal(p.length,polygon(ps[i]).length);near(assert,area(p),area(polygon(ps[i])));});
      const attempt=newAttempt(q);assert.equal(analyze(attempt.pieces).overlaps.length,0);
      assert.equal(attempt.pieces.map(p=>p.id).join(),ps.map(p=>p.id).join());
      assert.equal(analyze(attempt.pieces).area,info.area);
    });
  }
  test('固定20問は平行移動・45度刻み回転・鏡映を除いてすべて異なる',()=>{
    assert.equal(new Set(BUILTIN_PROBLEMS.map(q=>silhouetteKey(q.pieces))).size,20);
    for(const q of BUILTIN_PROBLEMS){
      const mirrored=q.pieces.map(p=>({...p,x:25-p.x,y:p.y+2,angle:-p.angle,flipped:!p.flipped}));
      const rotated=q.pieces.map(p=>({...p,x:(p.x-p.y)/Math.SQRT2,y:(p.x+p.y)/Math.SQRT2,angle:p.angle+45}));
      assert.equal(silhouetteKey(q.pieces),silhouetteKey(mirrored));assert.equal(silhouetteKey(q.pieces),silhouetteKey(rotated));
    }
  });
  test('輪郭検証：穴と点接触だけの連結を固定問題から除外',()=>{
    const squares=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y)squares.push({id:3,x:x*Math.SQRT2,y:y*Math.SQRT2,angle:45,flipped:false});
    assert.ok(edgeConnected(squares));assert.equal(outlineLoops(squares).length,2);assert.equal(simpleOutline(squares),null);
    const point=[{id:3,x:0,y:0,angle:0,flipped:false},{id:3,x:2,y:0,angle:0,flipped:false}];
    assert.equal(edgeConnected(point),false);assert.equal(simpleOutline(point),null);
  });
  test('発展問題は標準問題より凹凸の多い輪郭を持つ',()=>{
    for(const q of BUILTIN_PROBLEMS.filter(q=>q.level===4)){const m=outlineMetrics(q.pieces);assert.ok(m.concave>=5&&m.corners>=13);}
    for(const q of BUILTIN_PROBLEMS.filter(q=>q.level===3))assert.ok(outlineMetrics(q.pieces).concave<=4);
  });
  test('固定問題の別解：小三角形を異なる配置へ交換しても正解',()=>{
    let count=0;
    for(const q of BUILTIN_PROBLEMS){
      const a=q.pieces.find(p=>p.id===5),b=q.pieces.find(p=>p.id===6);if(!a||!b)continue;
      const fit=(id,target)=>{
        for(let angle=0;angle<360;angle+=45)for(const flipped of [false,true]){
          const candidate={id,x:target.x,y:target.y,angle,flipped};if(sameRegion([candidate],[target]))return candidate;
        }
        throw Error('合同な三角形の交換に失敗');
      };
      const alternative=q.pieces.map(p=>p.id===5?fit(5,b):p.id===6?fit(6,a):{...p});
      assert.equal(sameRegion(alternative,q.pieces),true);count++;
    }
    assert.equal(count,19);
  });
  test('固定問題データは再現可能で、取得した問題の編集が原本を変更しない',()=>{
    assert.equal(JSON.stringify(generateProblems()),JSON.stringify(PROBLEM_DATA));
    const a=builtinProblem(1);a.pieces[0].x=0;a.title='変更';assert.ok(builtinProblem(1).pieces[0].x>0);assert.ok(Object.isFrozen(BUILTIN_PROBLEMS[0].pieces[0]));
    assert.throws(()=>builtinProblem(21));
  });
  test('初回は第01問、旧保存に問題がない場合も第01問',()=>{
    for(const saved of [{},{modes:{puzzle:{title:'旧作業',pieces:initialPieces()}}}]){
      const restored=restorePuzzle(saved);assert.equal(restored.source,'builtin');assert.equal(restored.number,1);assert.equal(restored.attempt.pieces.length,2);
    }
  });
  test('自動復元：固定問題の番号と解答途中の座標を維持',()=>{
    const problem=builtinProblem(20),attempt=newAttempt(problem);attempt.pieces[0].y+=.2;
    const restored=restorePuzzle({puzzleSelection:{source:'builtin',number:20},puzzleLayoutVersion:PUZZLE_LAYOUT_VERSION,problem:createPuzzleLayout(problem).problem,modes:{puzzle:attempt}});
    assert.equal(restored.number,20);assert.equal(restored.source,'builtin');assert.equal(JSON.stringify(restored.attempt.pieces),JSON.stringify(attempt.pieces));
  });
  test('旧版の自作問題・解答を移行し、固定問題と自作問題を分離',()=>{
    const custom=makeDocument('保存していた問題',squarePieces(),'problem'),attempt={title:custom.title,pieces:initialPieces()};attempt.pieces[0].y+=.1;
    const restored=restorePuzzle({problem:custom,modes:{puzzle:attempt}});
    assert.equal(restored.source,'custom');assert.equal(restored.customProblem.title,custom.title);
    const dx=restored.problem.pieces[0].x-custom.pieces[0].x,dy=restored.problem.pieces[0].y-custom.pieces[0].y;
    restored.attempt.pieces.forEach((p,i)=>{near(assert,p.x,attempt.pieces[i].x+dx);near(assert,p.y,attempt.pieces[i].y+dy);});
    const fixed=restorePuzzle({puzzleSelection:{source:'builtin',number:2},customProblem:custom,puzzleLayoutVersion:PUZZLE_LAYOUT_VERSION,problem:createPuzzleLayout(builtinProblem(2)).problem,modes:{puzzle:newAttempt(builtinProblem(2))}});
    assert.equal(fixed.source,'builtin');assert.equal(fixed.problem.title,builtinProblem(2).title);assert.equal(fixed.customProblem.title,custom.title);
  });
  test('未読込の自作モードと不正な復元データを安全に扱う',()=>{
    const empty=restorePuzzle({puzzleSelection:{source:'custom',number:1}});assert.equal(empty.problem,null);assert.equal(empty.attempt.pieces.length,0);
    assert.throws(()=>restorePuzzle({puzzleSelection:{source:'builtin',number:99}}));
    assert.throws(()=>restorePuzzle({puzzleSelection:{source:'unknown',number:1}}));
    assert.throws(()=>restorePuzzle({puzzleSelection:{source:'builtin',number:1},modes:{puzzle:{pieces:initialPieces()}}}));
  });
}
