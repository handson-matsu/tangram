import {recordAccessOnce} from './access-counter.js';
import {initialCamera, cameraBox, zoomCamera, fitCamera, panCamera, INITIAL_ZOOM, MIN_ZOOM, MAX_ZOOM} from './camera.js';
import {DEFINITIONS,polygon,analyze,sameRegion,isSquare,initialPieces,squarePieces,snapCandidates} from './geometry.js';
import {History,parseDocument,makeDocument,validatePieces} from './state.js';
const $=s=>document.querySelector(s), NS='http://www.w3.org/2000/svg';
const modes={create:{title:'名前のない作品',pieces:initialPieces()},square:{title:'正方形の研究',pieces:initialPieces()},puzzle:{title:'シルエット問題',pieces:initialPieces()}};
let mode='create',selected=null,problem=null,drag=null,showAnswer=false;
const histories=Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,new History(v)]));
const state=()=>modes[mode], pieces=()=>state().pieces;
const cameras = Object.fromEntries(Object.keys(modes).map(key => [key, initialCamera()]));
let pan = null, panEnabled = false;
function applyCamera() {
  const camera = cameras[mode], box = cameraBox(camera);
  $('#board').setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  $('#zoom-level').textContent = `${Math.round(camera.zoom * 100)}%`;
  $('#zoom-out').disabled = camera.zoom <= MIN_ZOOM;
  $('#zoom-in').disabled = camera.zoom >= MAX_ZOOM;
  $('#board').classList.toggle('pan-enabled', panEnabled);
  $('#pan-view').setAttribute('aria-pressed', String(panEnabled));
  placeTools();
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
function persist(){try{localStorage.setItem('tangram-lab-v1',JSON.stringify({mode,modes,problem}));}catch{message('ブラウザへの自動保存ができません。JSON保存をご利用ください。',true);}}
function restore() {
  try {
    const raw = localStorage.getItem('tangram-lab-v1');
    if (!raw) return;
    const saved = JSON.parse(raw);
    const restored = {};
    for (const key of Object.keys(modes)) {
      const entry = saved.modes[key];
      if (typeof entry.title !== 'string' || entry.title.length > 100) throw Error();
      const ps = validatePieces(entry.pieces);
      if (analyze(ps).overlaps.length) throw Error();
      restored[key] = {title: entry.title, pieces: ps};
    }
    const restoredProblem = saved.problem ? parseDocument(JSON.stringify(saved.problem)) : null;
    if (restoredProblem) {
      if (restoredProblem.kind !== 'problem') throw Error();
      const ids = ps => ps.map(p => p.id).sort().join();
      if (ids(restored.puzzle.pieces) !== ids(restoredProblem.pieces)) throw Error();
    }
    // Apply only after every state has passed validation.
    problem = restoredProblem;
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
// One compound nonzero path represents the union of CCW polygons, including point contacts.
function regionPath(ps){return ps.map(p=>{const vs=polygon(p);return 'M'+vs.map(v=>`${v.x},${v.y}`).join('L')+'Z';}).join('');}
function drawTarget(){const group=$('#target');group.replaceChildren();if(mode==='puzzle'&&problem){const path=document.createElementNS(NS,'path');path.setAttribute('d',regionPath(problem.pieces));path.setAttribute('fill','#202923');group.append(path);}}
function render(){const st=state(),info=analyze(st.pieces);document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});$('#title').value=st.title;$('#title').disabled=mode==='puzzle';$('#mode-description').textContent={create:'ピースをつないで、オリジナルの形を。',puzzle:'黒いシルエットを、ぴったり覆おう。',square:'選んだピースで正方形をつくろう。'}[mode];$('#board-title').textContent={create:'自由に形をつくる',puzzle:problem?problem.title:'問題を用意する',square:'どのピースで、正方形になる？'}[mode];$('#register').hidden=mode!=='create';$('#check').hidden=mode==='create';$('#check').disabled=mode==='puzzle'&&!problem;$('#show-answer').hidden=mode!=='puzzle'||!problem;$('#example').hidden=mode==='puzzle';$('#puzzle-note').hidden=mode!=='puzzle'||!!problem;$('#document-kind').textContent=mode==='puzzle'?'解答中':mode==='square'&&isSquare(st.pieces)?'正方形完成':mode==='create'&&problem&&sameConfiguration(st,problem)?'登録済みの問題':'制作途中';
const list=$('#piece-list');list.replaceChildren();for(const d of DEFINITIONS){const label=document.createElement('label'),input=document.createElement('input'),swatch=pieceIcon(d),name=document.createElement('span'),a=document.createElement('span');input.type='checkbox';input.checked=st.pieces.some(p=>p.id===d.id);input.disabled=mode==='puzzle';input.addEventListener('change',()=>togglePiece(d.id,input.checked));name.textContent=d.name;a.className='piece-area';a.textContent=`面積 ${d.area}`;label.append(input,swatch,name,a);list.append(label);}$('#piece-count').textContent=st.pieces.length;$('#area-count').textContent=info.area;$('#area-text').textContent=`面積：小さい三角形${info.area}個分`;$('#overlap-status').textContent=info.overlaps.length?'内部の重なりあり':'✓ 内部の重なりなし';$('#overlap-status').classList.toggle('bad',!!info.overlaps.length);$('#connected-status').textContent=info.connected?'✓ 全体が連結':'○ まだ離れています';$('#connected-status').classList.toggle('bad',!info.connected);$('#undo').disabled=!histories[mode].canUndo;$('#redo').disabled=!histories[mode].canRedo;drawTarget();renderPieces();renderAnswer();applyCamera();}
function sameConfiguration(a,b){return a.title===b.title&&JSON.stringify(a.pieces)===JSON.stringify(b.pieces);}
function renderPieces(){const group=$('#pieces');group.replaceChildren();const ordered=[...pieces()].sort((a,b)=>(a.id===selected)-(b.id===selected));for(const p of ordered){const el=svgPolygon(polygon(p),{fill:DEFINITIONS[p.id].color,'data-id':p.id,tabindex:0,role:'button','aria-label':`${DEFINITIONS[p.id].name}、面積${DEFINITIONS[p.id].area}。矢印キーで移動、QとEで回転、Fで反転。`});if(p.id===selected)el.classList.add('selected');if(drag&&p.id===drag.id&&!valid(p))el.classList.add('invalid');group.append(el);}placeTools();}
function placeTools() {
  const piece = pieces().find(p => p.id === selected), tools = $('#piece-tools');
  tools.hidden = !piece || !!drag || !!pan || showAnswer || panEnabled;
  if (tools.hidden) return;
  const vertices = polygon(piece), matrix = $('#board').getScreenCTM();
  if (!matrix) return;
  const wrap = $('#board-wrap'), bounds = wrap.getBoundingClientRect();
  const screenPoints = vertices.map(v => new DOMPoint(v.x, v.y).matrixTransform(matrix));
  const left = Math.min(...screenPoints.map(v => v.x)), right = Math.max(...screenPoints.map(v => v.x));
  const top = Math.min(...screenPoints.map(v => v.y)), bottom = Math.max(...screenPoints.map(v => v.y));
  if (right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom) {
    tools.hidden = true;
    return;
  }
  $('#selected-name').textContent = DEFINITIONS[piece.id].name;
  tools.style.left = `${Math.max(4, Math.min(wrap.clientWidth - tools.offsetWidth - 4, (left + right) / 2 - bounds.left - tools.offsetWidth / 2))}px`;
  tools.style.top = `${Math.max(4, Math.min(wrap.clientHeight - tools.offsetHeight - 4, top - bounds.top - tools.offsetHeight - 8))}px`;
}
function renderAnswer(){const g=$('#answer');g.replaceChildren();$('#answer-label').hidden=!showAnswer;if(showAnswer&&problem){for(const p of problem.pieces)g.append(svgPolygon(polygon(p),{fill:DEFINITIONS[p.id].color,stroke:'#fff','stroke-width':'.025'}));}placeTools();}
function inside(p){return polygon(p).every(v=>v.x>=-1e-8&&v.x<=20+1e-8&&v.y>=-1e-8&&v.y<=12+1e-8);}
function valid(p){return inside(p)&&!analyze([...pieces().filter(q=>q.id!==p.id),p]).overlaps.length;}
function snapped(p){if(!$('#snap').checked)return p;const others=pieces().filter(q=>q.id!==p.id),target=mode==='puzzle'&&problem?problem.pieces:[];return snapCandidates(p,others,target).find(valid)||p;}
function togglePiece(id,on){if(!on&&pieces().length<=2){message('2枚以上のピースを選んでください。',true);render();return;}if(on){let candidate=null;const base=initialPieces()[id];if(valid(base))candidate=base;else for(let y=2;y<11&&!candidate;y+=.5)for(let x=2;x<19&&!candidate;x+=.5){const p={...base,x,y};if(valid(p))candidate=p;}if(!candidate){message('新しいピースを置く空間がありません。',true);render();return;}pieces().push(candidate);}else{state().pieces=pieces().filter(p=>p.id!==id);if(selected===id)selected=null;}commit();message('使用ピースを変更しました。');}
function transform(fn){if(selected===null||drag||showAnswer)return;const i=pieces().findIndex(p=>p.id===selected);if(i<0)return;const p=fn({...pieces()[i]});if(!valid(p)){message('重なり、または作業台の外になるため操作を戻しました。',true);return;}pieces()[i]=p;commit();message('配置を更新しました。');}
function localPoint(e){const pt=$('#board').createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform($('#board').getScreenCTM().inverse());}
$('#board').addEventListener('pointerdown', e => {
  if (drag || pan || e.button !== 0) return;
  const el = e.target.closest('[data-id]');
  if (panEnabled || !el) {
    e.preventDefault();
    pan = {pointerId: e.pointerId, start: {x: e.clientX, y: e.clientY}, camera: {...cameras[mode]}, inverse: $('#board').getScreenCTM().inverse()};
    $('#board').setPointerCapture(e.pointerId);
    $('#board').classList.add('panning');
    placeTools();
    return;
  }
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
$('#pieces').addEventListener('focusin',e=>{const id=e.target.dataset.id;if(id!==undefined){selected=Number(id);$('#pieces').querySelectorAll('polygon').forEach(p=>p.classList.toggle('selected',Number(p.dataset.id)===selected));placeTools();}});
$('#rotate-left').onclick=()=>transform(p=>({...p,angle:(p.angle+315)%360}));$('#rotate-right').onclick=()=>transform(p=>({...p,angle:(p.angle+45)%360}));$('#flip').onclick=()=>transform(p=>({...p,flipped:!p.flipped}));
function navigateHistory(redo){if(drag)return;modes[mode]=redo?histories[mode].redo():histories[mode].undo();selected=null;showAnswer=false;persist();render();message(redo?'やり直しました。':'元に戻しました。');}
$('#undo').onclick=()=>navigateHistory(false);$('#redo').onclick=()=>navigateHistory(true);
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||$('#help-dialog').open||drag)return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();navigateHistory(e.shiftKey);return;}if(e.metaKey||e.ctrlKey||e.altKey)return;const key=e.key.toLowerCase();if(selected===null)return;if(['arrowup','arrowdown','arrowleft','arrowright','q','e','f'].includes(key)){e.preventDefault();const step=e.shiftKey?.01:.1;if(key.startsWith('arrow'))transform(p=>({...p,x:p.x+(key==='arrowright'?step:key==='arrowleft'?-step:0),y:p.y+(key==='arrowdown'?step:key==='arrowup'?-step:0)}));else if(key==='f')$('#flip').click();else $(key==='q'?'#rotate-left':'#rotate-right').click();}});
function switchMode(next){if(drag||pan)return;mode=next;selected=null;showAnswer=false;persist();render();message(mode==='puzzle'&&!problem?'まず自由制作で問題を登録してください。':'モードを切り替えました。');}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
$('#title').addEventListener('change',()=>{state().title=$('#title').value.trim()||'名前のない作品';commit();});
$('#reset').onclick=()=>{if(drag)return;const ids=new Set(pieces().map(p=>p.id));state().pieces=initialPieces().filter(p=>ids.has(p.id));selected=null;showAnswer=false;commit();message('使用ピースを初期配置に戻しました。Undoで戻せます。');};
$('#example').onclick=()=>{state().pieces=squarePieces();selected=null;commit();message('7枚の正方形です。ピースを分けて、再構成してみましょう。');};
$('#register').onclick=()=>{const info=analyze(pieces());if(info.overlaps.length||!info.connected){message('問題登録には、内部の重なりがなく、全体が連結している必要があります。',true);return;}problem=makeDocument(state().title,pieces(),'problem');modes.puzzle={title:problem.title,pieces:initialPieces().filter(p=>problem.pieces.some(q=>q.id===p.id))};histories.puzzle.reset(modes.puzzle);switchMode('puzzle');message('問題を登録しました。黒いシルエットをピースで覆ってください。');};
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
function exportDocument(){if(mode==='puzzle'){if(!problem)throw Error('保存する問題がありません。自由制作で登録してください。');return problem;}const kind=mode==='square'&&isSquare(pieces())?'square':mode==='create'&&problem&&sameConfiguration(state(),problem)?'problem':'draft';return makeDocument(state().title,pieces(),kind);}
$('#save').onclick=()=>{try{const d=exportDocument();download(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),filename(d.title)+'.json');message(mode==='puzzle'?'問題と元の解答配置を保存しました。':'JSONファイルを保存しました。');}catch(e){message(e.message,true);}};
$('#load').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('100KB以下のJSONファイルを選んでください。');const d=parseDocument(await file.text());if(d.kind==='problem'){problem=d;modes.create={title:d.title,pieces:structuredClone(d.pieces)};histories.create.reset(modes.create);modes.puzzle={title:d.title,pieces:initialPieces().filter(p=>d.pieces.some(q=>q.id===p.id))};histories.puzzle.reset(modes.puzzle);switchMode('create');}else{const key=d.kind==='square'?'square':'create';modes[key]={title:d.title,pieces:d.pieces};histories[key].reset(modes[key]);switchMode(key);}changeView(() => fitCamera(viewPoints()));message('読み込みました。編集を再開できます。');}catch(error){message(`読み込めません：${error.message}`,true);}finally{e.target.value='';}};
function exportPNG(silhouette){try{const ps=mode==='puzzle'&&problem?problem.pieces:pieces();if(silhouette){const info=analyze(ps);if(info.overlaps.length||!info.connected)throw Error('シルエット保存には、重なりがなく全体が連結した配置が必要です。');}const vs=ps.flatMap(polygon),minX=Math.min(...vs.map(p=>p.x)),minY=Math.min(...vs.map(p=>p.y)),maxX=Math.max(...vs.map(p=>p.x)),maxY=Math.max(...vs.map(p=>p.y));const scale=180,pad=50,canvas=document.createElement('canvas');canvas.width=Math.ceil((maxX-minX)*scale+pad*2);canvas.height=Math.ceil((maxY-minY)*scale+pad*2);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(pad-minX*scale,pad-minY*scale);ctx.scale(scale,scale);function path(p){polygon(p).forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();}if(silhouette){ctx.beginPath();ps.forEach(path);ctx.fillStyle='#000';ctx.fill('nonzero');}else{for(const p of ps){ctx.beginPath();path(p);ctx.fillStyle=DEFINITIONS[p.id].color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=.018;ctx.stroke();}}canvas.toBlob(blob=>{if(!blob){message('PNGを生成できませんでした。',true);return;}const title=mode==='puzzle'&&problem?problem.title:state().title;download(blob,filename(title)+(silhouette?'_silhouette':'_answer')+'.png');message(mode==='puzzle'?'問題の元の配置からPNGを保存しました。':'PNG画像を保存しました。');},'image/png');}catch(error){message(error.message,true);}}
$('#png-silhouette').onclick=()=>exportPNG(true);$('#png-answer').onclick=()=>exportPNG(false);
$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();window.addEventListener('resize',placeTools);restore();
for (const key of Object.keys(modes)) {
  const visible = key === 'puzzle' && problem ? [...modes[key].pieces, ...problem.pieces] : modes[key].pieces;
  cameras[key] = {...fitCamera(visible.flatMap(polygon)), zoom: INITIAL_ZOOM};
}
render();

// Count a document load only; interaction handlers never call the recorder.
recordAccessOnce();
