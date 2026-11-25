import {createPuzzleLayout, includeAttemptBounds, PUZZLE_LAYOUT_VERSION} from './puzzle-layout.js';
import {BUILTIN_PROBLEMS, builtinProblem, restorePuzzle} from './puzzles.js?v=20261125-layout2';
import {regionPath} from './silhouette.js';
import {recordAccessOnce} from './access-counter.js';
import {initialCamera, cameraBox, zoomCamera, fitCamera, panCamera, INITIAL_ZOOM, MIN_ZOOM, MAX_ZOOM} from './camera.js';
import {DEFINITIONS,polygon,analyze,sameRegion,isSquare,initialPieces,squarePieces,snapCandidates} from './geometry.js';
import {History,parseDocument,makeDocument,validatePieces} from './state.js';
const $=s=>document.querySelector(s), NS='http://www.w3.org/2000/svg';
const firstPuzzle=createPuzzleLayout(builtinProblem(1));
const modes={create:{title:'名前のない作品',pieces:initialPieces()},square:{title:'正方形の研究',pieces:initialPieces()},puzzle:firstPuzzle.attempt};
let mode='create',selected=null,problem=firstPuzzle.problem,drag=null,showAnswer=false;
let puzzleArea=firstPuzzle.bounds;
let puzzleSource='builtin', builtinNumber=1, customProblem=null, loadForPuzzle=false;
const histories=Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,new History(v)]));
const state=()=>modes[mode], pieces=()=>state().pieces;
const cameras = Object.fromEntries(Object.keys(modes).map(key => [key, initialCamera()]));
let pan = null, panEnabled = false;
function applyCamera() {
  const camera = cameras[mode], box = cameraBox(camera);
  const bounds=mode==='puzzle'?puzzleArea:{minX:0,minY:0,maxX:20,maxY:12};
  const border=$('#workspace-boundary');
  border.setAttribute('x',bounds.minX);border.setAttribute('y',bounds.minY);
  border.setAttribute('width',bounds.maxX-bounds.minX);border.setAttribute('height',bounds.maxY-bounds.minY);
  $('#board').setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  $('#zoom-level').textContent = `${Math.round(camera.zoom * 100)}%`;
  $('#zoom-out').disabled = camera.zoom <= MIN_ZOOM;
  $('#zoom-in').disabled = camera.zoom >= MAX_ZOOM;
  $('#board').classList.toggle('pan-enabled', panEnabled);
  $('#pan-view').setAttribute('aria-pressed', String(panEnabled));
  updatePieceTools();
}
function changeView(update) {
  if (drag || pan) return;
  cameras[mode] = update(cameras[mode]);
  applyCamera();
}
function viewPoints() {
  const visible = mode === 'puzzle' && problem ? [...pieces(), ...problem.pieces] : pieces();
  return visible.flatMap(polygon);
}
$('#zoom-in').onclick = () => changeView(camera => zoomCamera(camera, 1.2));
$('#zoom-out').onclick = () => changeView(camera => zoomCamera(camera, 1 / 1.2));
$('#zoom-fit').onclick = () => changeView(() => fitCamera(viewPoints()));
$('#zoom-reset').onclick = () => changeView(() => ({...fitCamera(viewPoints()), zoom: INITIAL_ZOOM}));
$('#pan-view').onclick = () => {
  if (drag || pan) return;
  panEnabled = !panEnabled;
  applyCamera();
};
function message(text, error = false) {
  const panel = $('#message');
  panel.classList.remove('success');
  panel.classList.toggle('error', error);
  panel.textContent = text;
}
function successMessage(title, detail) {
  const panel = $('#message');
  const check = document.createElement('span');
  check.className = 'success-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const description = document.createElement('span');
  description.textContent = detail;
  content.append(heading, description);
  panel.replaceChildren(check, content);
  panel.classList.remove('error');
  panel.classList.add('success');
}
// Keep success visible without a timer, until the next intentional operation.
function clearSuccess(event) {
  if (!$('#message').classList.contains('success')) return;
  if (event.type === 'keydown' && !['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'e', 'f', 'z'].includes(event.key)) return;
  if (event.target.closest('button, input, #board')) message('続けて操作できます。');
}
document.addEventListener('pointerdown', clearSuccess, true);
document.addEventListener('keydown', clearSuccess, true);
function pieceIcon(definition) {
  const icon = document.createElementNS(NS, 'svg');
  icon.setAttribute('class', 'swatch');
  // All icons share one coordinate scale, preserving the actual 4:2:1 areas.
  icon.setAttribute('viewBox', '-2.3 -2.3 4.6 4.6');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.append(svgPolygon(definition.points, {fill: definition.color}));
  return icon;
}
function persist(){try{localStorage.setItem('tangram-lab-v1',JSON.stringify({mode,modes,problem,puzzleSelection:{source:puzzleSource,number:builtinNumber},customProblem,puzzleLayoutVersion:PUZZLE_LAYOUT_VERSION}));}catch{message('ブラウザへの自動保存ができません。JSON保存をご利用ください。',true);}}
function restore() {
  try {
    const raw = localStorage.getItem('tangram-lab-v1');
    if (!raw) return;
    const saved = JSON.parse(raw);
    const restored = {};
    for (const key of ['create','square']) {
      const entry = saved.modes[key];
      if (typeof entry.title !== 'string' || entry.title.length > 100) throw Error();
      const ps = validatePieces(entry.pieces);
      if (analyze(ps).overlaps.length) throw Error();
      restored[key] = {title: entry.title, pieces: ps};
    }
    const restoredPuzzle=restorePuzzle(saved);
    problem=restoredPuzzle.problem;
    puzzleArea=restoredPuzzle.bounds;
    puzzleSource=restoredPuzzle.source;
    builtinNumber=restoredPuzzle.number;
    customProblem=restoredPuzzle.customProblem;
    restored.puzzle=restoredPuzzle.attempt;
    for (const key of Object.keys(modes)) {
      modes[key] = restored[key];
      histories[key].reset(modes[key]);
    }
    if (Object.hasOwn(modes, saved.mode)) mode = saved.mode;
  } catch {
    message('自動保存データを復元できませんでした。初期状態で開始します。', true);
  }
}
function commit(){histories[mode].push(state());persist();render();}
function pointsAttr(p){return p.map(v=>`${v.x},${v.y}`).join(' ');}
function svgPolygon(p,attrs={}){const el=document.createElementNS(NS,'polygon');el.setAttribute('points',pointsAttr(p));for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;}
function drawTarget(){const group=$('#target');group.replaceChildren();if(mode==='puzzle'&&problem){const path=document.createElementNS(NS,'path');path.setAttribute('d',regionPath(problem.pieces));path.setAttribute('fill','#202923');group.append(path);}}
function render(){const st=state(),info=analyze(st.pieces);document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});$('#title').value=st.title;$('#title').disabled=mode==='puzzle';$('#mode-description').textContent={create:'ピースをつないで、オリジナルの形を。',puzzle:'黒いシルエットを、ぴったり覆おう。',square:'選んだピースで正方形をつくろう。'}[mode];$('#board-title').textContent={create:'自由に形をつくる',puzzle:problem?problem.title:'問題を用意する',square:'どのピースで、正方形になる？'}[mode];$('#register').hidden=mode!=='create';$('#check').hidden=mode==='create';$('#check').disabled=mode==='puzzle'&&!problem;$('#show-answer').hidden=mode!=='puzzle'||!problem;$('#example').hidden=mode==='puzzle';$('#puzzle-note').hidden=mode!=='puzzle'||!!problem;$('#document-kind').textContent=mode==='puzzle'?'解答中':mode==='square'&&isSquare(st.pieces)?'正方形完成':mode==='create'&&customProblem&&sameConfiguration(st,customProblem)?'登録済みの問題':'制作途中';
const list=$('#piece-list');
const visibleDefinitions=mode==='puzzle'?DEFINITIONS.filter(d=>st.pieces.some(p=>p.id===d.id)):DEFINITIONS;
list.replaceChildren();for(const d of visibleDefinitions){const label=document.createElement('label'),input=document.createElement('input'),swatch=pieceIcon(d),name=document.createElement('span'),a=document.createElement('span');input.type='checkbox';input.checked=st.pieces.some(p=>p.id===d.id);input.disabled=mode==='puzzle';input.addEventListener('change',()=>togglePiece(d.id,input.checked));name.textContent=d.name;a.className='piece-area';a.textContent=`面積 ${d.area}`;label.append(input,swatch,name,a);list.append(label);}$('#piece-count').textContent=st.pieces.length;$('#area-count').textContent=info.area;$('#area-text').textContent=`面積：小さい三角形${info.area}個分`;$('#overlap-status').textContent=info.overlaps.length?'内部の重なりあり':'✓ 内部の重なりなし';$('#overlap-status').classList.toggle('bad',!!info.overlaps.length);$('#connected-status').textContent=info.connected?'✓ 全体が連結':'○ まだ離れています';$('#connected-status').classList.toggle('bad',!info.connected);$('#undo').disabled=!histories[mode].canUndo;$('#redo').disabled=!histories[mode].canRedo;renderPuzzleControls();drawTarget();renderPieces();renderAnswer();applyCamera();}
function sameConfiguration(a,b){return a.title===b.title&&JSON.stringify(a.pieces)===JSON.stringify(b.pieces);}
function renderPieces(){const group=$('#pieces');group.replaceChildren();const ordered=[...pieces()].sort((a,b)=>(a.id===selected)-(b.id===selected));for(const p of ordered){const el=svgPolygon(polygon(p),{fill:DEFINITIONS[p.id].color,'data-id':p.id,tabindex:0,role:'button','aria-label':`${DEFINITIONS[p.id].name}、面積${DEFINITIONS[p.id].area}。矢印キーで移動、QとEで回転、Fで反転。`});if(p.id===selected)el.classList.add('selected');if(drag&&p.id===drag.id&&!valid(p))el.classList.add('invalid');group.append(el);}updatePieceTools();}
function updatePieceTools() {
  const piece=pieces().find(p=>p.id===selected);
  $('#selected-name').textContent=piece?DEFINITIONS[piece.id].name:'ピース未選択';
  const disabled=!piece||!!drag||!!pan||showAnswer||panEnabled;
  for(const id of ['rotate-left','rotate-right','flip'])$('#'+id).disabled=disabled;
}
function renderAnswer(){const g=$('#answer');g.replaceChildren();$('#answer-label').hidden=!showAnswer;if(showAnswer&&problem){for(const p of problem.pieces)g.append(svgPolygon(polygon(p),{fill:DEFINITIONS[p.id].color,stroke:'#fff','stroke-width':'.025'}));}updatePieceTools();}
function inside(p){const b=mode==='puzzle'?puzzleArea:{minX:0,minY:0,maxX:20,maxY:12};return polygon(p).every(v=>v.x>=b.minX-1e-8&&v.x<=b.maxX+1e-8&&v.y>=b.minY-1e-8&&v.y<=b.maxY+1e-8);}
function valid(p){return inside(p)&&!analyze([...pieces().filter(q=>q.id!==p.id),p]).overlaps.length;}
function snapped(p){if(!$('#snap').checked)return p;const others=pieces().filter(q=>q.id!==p.id),target=mode==='puzzle'&&problem?problem.pieces:[];return snapCandidates(p,others,target).find(valid)||p;}
function togglePiece(id,on){if(!on&&pieces().length<=2){message('2枚以上のピースを選んでください。',true);render();return;}if(on){let candidate=null;const base=initialPieces()[id];if(valid(base))candidate=base;else for(let y=2;y<11&&!candidate;y+=.5)for(let x=2;x<19&&!candidate;x+=.5){const p={...base,x,y};if(valid(p))candidate=p;}if(!candidate){message('新しいピースを置く空間がありません。',true);render();return;}pieces().push(candidate);}else{state().pieces=pieces().filter(p=>p.id!==id);if(selected===id)selected=null;}commit();message('使用ピースを変更しました。');}
function transform(fn){if(selected===null||drag||pan||panEnabled||showAnswer)return;const i=pieces().findIndex(p=>p.id===selected);if(i<0)return;const p=fn({...pieces()[i]});if(!valid(p)){message('重なり、または作業台の外になるため操作を戻しました。',true);return;}pieces()[i]=p;commit();message('配置を更新しました。');}
function localPoint(e){const pt=$('#board').createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform($('#board').getScreenCTM().inverse());}
$('#board').addEventListener('pointerdown', e => {
  if (drag || pan || e.button !== 0) return;
  const el = e.target.closest('[data-id]');
  if (panEnabled) {
    e.preventDefault();
    pan = {pointerId: e.pointerId, start: {x: e.clientX, y: e.clientY}, camera: {...cameras[mode]}, inverse: $('#board').getScreenCTM().inverse()};
    $('#board').setPointerCapture(e.pointerId);
    $('#board').classList.add('panning');
    updatePieceTools();
    return;
  }
  if (!el) {selected=null;renderPieces();return;}
  if (showAnswer) return;
  e.preventDefault();
  selected = Number(el.dataset.id);
  const p = pieces().find(p => p.id === selected), point = localPoint(e);
  drag = {id: selected, pointerId: e.pointerId, start: {...p}, lastValid: {...p}, offset: {x: point.x - p.x, y: point.y - p.y}};
  $('#board').setPointerCapture(e.pointerId);
  renderPieces();
});
$('#board').addEventListener('pointermove', e => {
  if (pan && e.pointerId === pan.pointerId) {
    e.preventDefault();
    const dx = e.clientX - pan.start.x, dy = e.clientY - pan.start.y, m = pan.inverse;
    cameras[mode] = panCamera(pan.camera, m.a * dx + m.c * dy, m.b * dx + m.d * dy);
    applyCamera();
    return;
  }
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  const pos = localPoint(e), p = pieces().find(p => p.id === drag.id);
  p.x = pos.x - drag.offset.x;
  p.y = pos.y - drag.offset.y;
  if (valid(p)) drag.lastValid = {...p};
  renderPieces();
});
function finishDrag(e, cancel = false) {
  if (pan && e.pointerId === pan.pointerId) {
    if (cancel) cameras[mode] = pan.camera;
    pan = null;
    $('#board').classList.remove('panning');
    if ($('#board').hasPointerCapture(e.pointerId)) $('#board').releasePointerCapture(e.pointerId);
    applyCamera();
    return;
  }
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag, index = pieces().findIndex(p => p.id === d.id);
  let p = cancel ? d.start : snapped(pieces()[index]);
  const ok = !cancel && valid(p);
  if (!ok) p = cancel ? d.start : d.lastValid;
  pieces()[index] = p;
  drag = null;
  if ($('#board').hasPointerCapture(e.pointerId)) $('#board').releasePointerCapture(e.pointerId);
  commit();
  message(cancel ? '移動を取り消しました。' : ok ? '配置しました。' : '内部の重なり、または作業台外のため、直前の有効な位置に戻しました。', !cancel && !ok);
}
$('#board').addEventListener('pointerup', e => finishDrag(e));
$('#board').addEventListener('pointercancel', e => finishDrag(e, true));
$('#board').addEventListener('lostpointercapture', e => {if (drag || pan) finishDrag(e, true);});
$('#pieces').addEventListener('focusin',e=>{const id=e.target.dataset.id;if(id!==undefined){selected=Number(id);$('#pieces').querySelectorAll('polygon').forEach(p=>p.classList.toggle('selected',Number(p.dataset.id)===selected));updatePieceTools();}});
$('#rotate-left').onclick=()=>transform(p=>({...p,angle:(p.angle+315)%360}));$('#rotate-right').onclick=()=>transform(p=>({...p,angle:(p.angle+45)%360}));$('#flip').onclick=()=>transform(p=>({...p,flipped:!p.flipped}));
function navigateHistory(redo){if(drag||pan)return;modes[mode]=redo?histories[mode].redo():histories[mode].undo();selected=null;showAnswer=false;if(mode==='puzzle')puzzleArea=includeAttemptBounds(createPuzzleLayout(problem).bounds,pieces());persist();render();message(redo?'やり直しました。':'元に戻しました。');}
$('#undo').onclick=()=>navigateHistory(false);$('#redo').onclick=()=>navigateHistory(true);
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||$('#help-dialog').open||drag)return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();navigateHistory(e.shiftKey);return;}if(e.metaKey||e.ctrlKey||e.altKey)return;const key=e.key.toLowerCase();if(selected===null)return;if(['arrowup','arrowdown','arrowleft','arrowright','q','e','f'].includes(key)){e.preventDefault();const step=e.shiftKey?.01:.1;if(key.startsWith('arrow'))transform(p=>({...p,x:p.x+(key==='arrowright'?step:key==='arrowleft'?-step:0),y:p.y+(key==='arrowdown'?step:key==='arrowup'?-step:0)}));else if(key==='f')$('#flip').click();else $(key==='q'?'#rotate-left':'#rotate-right').click();}});
function switchMode(next){if(drag||pan)return;mode=next;selected=null;showAnswer=false;persist();render();message(mode==='puzzle'&&!problem?'まず自由制作で問題を登録してください。':'モードを切り替えました。');}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
function renderPuzzleControls() {
  $('#puzzle-library').hidden=mode!=='puzzle';
  for(const button of document.querySelectorAll('[data-puzzle-source]'))button.setAttribute('aria-pressed',String(button.dataset.puzzleSource===puzzleSource));
  $('#builtin-controls').hidden=puzzleSource!=='builtin';
  $('#custom-controls').hidden=puzzleSource!=='custom';
  const selectedQuestion=BUILTIN_PROBLEMS[builtinNumber-1];
  $('#problem-summary').textContent=selectedQuestion.title+' · 問題を選ぶ';
  for(const button of document.querySelectorAll('[data-problem]'))button.setAttribute('aria-pressed',String(Number(button.dataset.problem)===builtinNumber));
  $('#previous-problem').disabled=builtinNumber===1;
  $('#next-problem').disabled=builtinNumber===20;
  $('#custom-problem-status').textContent=customProblem?customProblem.title:'問題として保存したJSONを選んでください。';
  $('#retry-custom').disabled=!customProblem;
}
function activatePuzzle(source,number=builtinNumber) {
  if(drag||pan)return;
  puzzleSource=source;builtinNumber=number;
  const layout=createPuzzleLayout(source==='builtin'?builtinProblem(number):customProblem);
  problem=layout.problem;puzzleArea=layout.bounds;
  modes.puzzle=layout.attempt;
  histories.puzzle.reset(modes.puzzle);
  selected=null;showAnswer=false;panEnabled=false;
  $('#problem-picker').open=false;
  cameras.puzzle=fitCamera([...modes.puzzle.pieces,...(problem?.pieces||[])].flatMap(polygon));
  switchMode('puzzle');
  message(problem?`${problem.title}：ピースを並べてみましょう。`:'問題JSONを読み込んでください。');
}
for(const level of [1,2,3,4]) {
  const row=document.createElement('div');row.className='problem-level';
  const label=document.createElement('span');label.textContent=`Level ${level}`;row.append(label);
  for(const q of BUILTIN_PROBLEMS.filter(q=>q.level===level)){
    const button=document.createElement('button');button.textContent=String(q.number).padStart(2,'0');
    button.dataset.problem=q.number;button.setAttribute('aria-label',q.title);button.setAttribute('aria-pressed','false');
    row.append(button);
  }
  $('#problem-list').append(row);
}
$('#problem-list').onclick=e=>{const button=e.target.closest('[data-problem]');if(button)activatePuzzle('builtin',Number(button.dataset.problem));};
for(const button of document.querySelectorAll('[data-puzzle-source]'))button.onclick=()=>{
  if(button.dataset.puzzleSource!==puzzleSource)activatePuzzle(button.dataset.puzzleSource);
};
$('#previous-problem').onclick=()=>activatePuzzle('builtin',Math.max(1,builtinNumber-1));
$('#next-problem').onclick=()=>activatePuzzle('builtin',Math.min(20,builtinNumber+1));
$('#retry-problem').onclick=()=>activatePuzzle('builtin');
$('#retry-custom').onclick=()=>activatePuzzle('custom');
$('#title').addEventListener('change',()=>{state().title=$('#title').value.trim()||'名前のない作品';commit();});
$('#reset').onclick=()=>{
  if(drag||pan)return;
  if(mode==='puzzle'){
    const layout=createPuzzleLayout(problem);
    state().pieces=layout.attempt.pieces;puzzleArea=layout.bounds;
  }else{
    const ids=new Set(pieces().map(p=>p.id));state().pieces=initialPieces().filter(p=>ids.has(p.id));
  }
  selected=null;showAnswer=false;panEnabled=false;
  cameras[mode]=fitCamera(viewPoints());
  commit();message('使用ピースを初期配置に戻しました。Undoで戻せます。');
};
$('#example').onclick=()=>{state().pieces=squarePieces();selected=null;commit();message('7枚の正方形です。ピースを分けて、再構成してみましょう。');};
$('#register').onclick=()=>{
  const info=analyze(pieces());
  if(info.overlaps.length||!info.connected){message('問題登録には、内部の重なりがなく、全体が連結している必要があります。',true);return;}
  customProblem=makeDocument(state().title,pieces(),'problem');
  activatePuzzle('custom');
  message('問題を登録しました。黒いシルエットをピースで覆ってください。');
};
$('#check').onclick = () => {
  if (mode === 'square') {
    const ok = isSquare(pieces());
    if (ok) successMessage('正方形完成！', 'JSON保存で完成配置を記録できます。');
    else message('まだ正方形になっていません。隙間なく、重なりなく並べてみましょう。', true);
    render();
  } else if (problem) {
    const correctIds = pieces().map(p => p.id).sort().join() === problem.pieces.map(p => p.id).sort().join();
    const ok = correctIds && sameRegion(pieces(), problem.pieces);
    if (ok) successMessage('正解！', 'シルエットを隙間なく覆えました。');
    else message('まだシルエットと一致していません。位置・向き・隙間を確認しましょう。', true);
  }
};
$('#show-answer').onclick=()=>{showAnswer=!showAnswer;renderAnswer();};$('#close-answer').onclick=()=>{showAnswer=false;renderAnswer();};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function filename(title){return (title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)||'tangram');}
function exportDocument(){if(mode==='puzzle'){if(!problem)throw Error('保存する問題がありません。自由制作で登録してください。');return problem;}const kind=mode==='square'&&isSquare(pieces())?'square':mode==='create'&&customProblem&&sameConfiguration(state(),customProblem)?'problem':'draft';return makeDocument(state().title,pieces(),kind);}
$('#save').onclick=()=>{try{const d=exportDocument();download(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),filename(d.title)+'.json');message(mode==='puzzle'?'問題と元の解答配置を保存しました。':'JSONファイルを保存しました。');}catch(e){message(e.message,true);}};
$('#load').onclick=()=>{loadForPuzzle=false;$('#file').click();};
$('#load-puzzle').onclick=()=>{loadForPuzzle=true;$('#file').click();};
$('#file').addEventListener('cancel',()=>{loadForPuzzle=false;});
$('#file').onchange=async e=>{
  const file=e.target.files[0];if(!file){loadForPuzzle=false;return;}
  try {
    if(file.size>100000)throw Error('100KB以下のJSONファイルを選んでください。');
    const d=parseDocument(await file.text());
    if(loadForPuzzle&&d.kind!=='problem')throw Error('問題として登録・保存したJSONを選んでください。');
    if(d.kind==='problem'){
      customProblem=d;
      if(loadForPuzzle)activatePuzzle('custom');
      else {
        modes.create={title:d.title,pieces:structuredClone(d.pieces)};
        histories.create.reset(modes.create);
        puzzleSource='custom';const layout=createPuzzleLayout(d);problem=layout.problem;puzzleArea=layout.bounds;
        modes.puzzle=layout.attempt;histories.puzzle.reset(modes.puzzle);
        cameras.puzzle=fitCamera([...modes.puzzle.pieces,...problem.pieces].flatMap(polygon));
        switchMode('create');
      }
    }else{
      const key=d.kind==='square'?'square':'create';
      modes[key]={title:d.title,pieces:d.pieces};histories[key].reset(modes[key]);switchMode(key);
    }
    changeView(()=>fitCamera(viewPoints()));
    message('読み込みました。パズルへの挑戦・編集を再開できます。');
  }catch(error){message(`読み込めません：${error.message}`,true);}
  finally{e.target.value='';loadForPuzzle=false;}
};
function exportPNG(silhouette){try{const ps=mode==='puzzle'&&problem?problem.pieces:pieces();if(silhouette){const info=analyze(ps);if(info.overlaps.length||!info.connected)throw Error('シルエット保存には、重なりがなく全体が連結した配置が必要です。');}const vs=ps.flatMap(polygon),minX=Math.min(...vs.map(p=>p.x)),minY=Math.min(...vs.map(p=>p.y)),maxX=Math.max(...vs.map(p=>p.x)),maxY=Math.max(...vs.map(p=>p.y));const scale=180,pad=50,canvas=document.createElement('canvas');canvas.width=Math.ceil((maxX-minX)*scale+pad*2);canvas.height=Math.ceil((maxY-minY)*scale+pad*2);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(pad-minX*scale,pad-minY*scale);ctx.scale(scale,scale);function path(p){polygon(p).forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();}if(silhouette){ctx.beginPath();ps.forEach(path);ctx.fillStyle='#000';ctx.fill('nonzero');}else{for(const p of ps){ctx.beginPath();path(p);ctx.fillStyle=DEFINITIONS[p.id].color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=.018;ctx.stroke();}}canvas.toBlob(blob=>{if(!blob){message('PNGを生成できませんでした。',true);return;}const title=mode==='puzzle'&&problem?problem.title:state().title;download(blob,filename(title)+(silhouette?'_silhouette':'_answer')+'.png');message(mode==='puzzle'?'問題の元の配置からPNGを保存しました。':'PNG画像を保存しました。');},'image/png');}catch(error){message(error.message,true);}}
$('#png-silhouette').onclick=()=>exportPNG(true);$('#png-answer').onclick=()=>exportPNG(false);
$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();window.addEventListener('resize',updatePieceTools);restore();
for (const key of Object.keys(modes)) {
  const visible = key === 'puzzle' && problem ? [...modes[key].pieces, ...problem.pieces] : modes[key].pieces;
  cameras[key] = key==='puzzle'?fitCamera(visible.flatMap(polygon)):{...fitCamera(visible.flatMap(polygon)), zoom: INITIAL_ZOOM};
}
render();

// Count a document load only; interaction handlers never call the recorder.
recordAccessOnce();
