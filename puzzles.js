import {PROBLEM_DATA} from './problems-data.js';
import {initialPieces, analyze, sameRegion} from './geometry.js';
import {createPuzzleLayout, includeAttemptBounds, PUZZLE_LAYOUT_VERSION} from './puzzle-layout.js';
import {makeDocument, parseDocument} from './state.js';
import {validatePuzzleAttempt} from './puzzle-attempt.js';
const freeze = object => {Object.values(object).forEach(value=>{if(value&&typeof value==='object')freeze(value);});return Object.freeze(object);};
export const BUILTIN_PROBLEMS = freeze(PROBLEM_DATA.map(q=>({
  number:q.number, level:q.level,
  ...makeDocument(`Level ${q.level} · 第${String(q.number).padStart(2,'0')}問`,q.pieces,'problem')
})));
export function builtinProblem(number=1) {
  const q=BUILTIN_PROBLEMS.find(q=>q.number===number);
  if(!q)throw Error('問題番号が不正です。');
  return makeDocument(q.title,q.pieces,'problem');
}
export function newAttempt(problem) {
  return createPuzzleLayout(problem).attempt;
}
// Migrate old saves without discarding a teacher's custom question or answer.
export function restorePuzzle(saved) {
  const selection=saved.puzzleSelection;
  const legacy=!selection&&saved.problem;
  const customData=saved.customProblem || (legacy?saved.problem:null);
  const customProblem=customData?parseDocument(JSON.stringify(customData)):null;
  if(customProblem&&customProblem.kind!=='problem')throw Error('保存された問題の種別が不正です。');
  const source=selection?.source || (legacy?'custom':'builtin');
  if(!['builtin','custom'].includes(source))throw Error('問題の選択元が不正です。');
  const number=selection?.number??1;
  if(!Number.isInteger(number)||number<1||number>20)throw Error('保存された問題番号が不正です。');
  const sourceProblem=source==='builtin'?builtinProblem(number):customProblem;
  const layout=createPuzzleLayout(sourceProblem);
  const problem=layout.problem;
  let attempt=layout.attempt,bounds=layout.bounds;
  if(problem&&(selection||legacy)&&saved.modes?.puzzle) {
    const raw=validatePuzzleAttempt(saved.modes.puzzle.pieces,{minX:-103,minY:-103,maxX:103,maxY:103});
    const ids=p=>p.map(v=>v.id).sort().join();
    if(ids(raw)!==ids(problem.pieces)||analyze(raw).overlaps.length)throw Error('保存された解答配置が不正です。');
    const previous=saved.problem?parseDocument(JSON.stringify(saved.problem)):sourceProblem;
    const first=problem.pieces[0],old=previous.pieces.find(p=>p.id===first.id);
    if(!old)throw Error('保存された問題が一致しません。');
    const dx=first.x-old.x,dy=first.y-old.y;
    const shifted=ps=>ps.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
    if(!sameRegion(shifted(previous.pieces),problem.pieces))throw Error('保存された問題が一致しません。');
    const oldWide=initialPieces().map((p,i)=>({...p,x:[3,8,12,16,3,8,13][i],y:i<4?3:8}));
    const untouched=template=>raw.every(p=>{const q=template.find(q=>q.id===p.id);return q&&Math.abs(p.x-q.x)<1e-8&&Math.abs(p.y-q.y)<1e-8&&p.angle===0&&!p.flipped;});
    if(saved.puzzleLayoutVersion===PUZZLE_LAYOUT_VERSION||(!untouched(initialPieces())&&!untouched(oldWide))) {
      const pieces=shifted(raw);
      bounds=includeAttemptBounds(bounds,pieces);
      validatePuzzleAttempt(pieces,bounds);
      attempt={title:problem.title,pieces};
    }
  }
  return {source,number,customProblem,problem,attempt,bounds};
}
