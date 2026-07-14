/*
 * 타일 이동 엔진 (Canvas)
 * 씬(마을/소방서/던전) 렌더링, 카메라, 충돌, 타일 단위 캐릭터 이동, 씬 전환을 담당한다.
 * game.js가 SceneEngine.hooks에 콜백을 등록해 상호작용(문/NPC/상점/화재이벤트/몬스터)을 처리한다.
 */

const SceneEngine = (function(){
  const MOVE_MS = 150; // 타일 1칸 이동에 걸리는 시간

  let canvas, ctx;
  let currentScene = null;
  let liveMonsters = [];   // 현재 씬의 몬스터 인스턴스(격파되면 제거)
  let resolvedEvents = new Set(); // 이번 씬 진입 중 해결된 화재이벤트 uid

  const player = {
    x:0, y:0,            // 타일 좌표(도착지 기준)
    px:0, py:0,           // 렌더용 픽셀 좌표
    facing:'down',
    moving:false, moveT:0, fromX:0, fromY:0, toX:0, toY:0,
    emoji:'🧑‍🚒'
  };

  let heldDir = null; // 'up'|'down'|'left'|'right'|null
  let inputLocked = false; // 모달/대화/전투 중엔 이동 불가

  const ZOOM_MIN = 0.6, ZOOM_MAX = 2.2;
  const camera = { zoom:1, panX:0, panY:0 }; // panX/panY: 드래그로 더해지는 수동 오프셋(월드 좌표계)

  const hooks = {
    onDoor:null, onNpcInteract:null, onFireEvent:null, onMonsterEncounter:null,
    onShopInteract:null, onHqUpgradeInteract:null, onTileEnter:null,
  };

  function setInputLocked(v){ inputLocked = v; if(v) heldDir = null; }

  function resizeCanvas(){
    const wrap = document.getElementById('stage-wrap');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function init(){
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    bindInput();
    bindCameraGestures();
    requestAnimationFrame(loop);
  }

  // ===== 드래그 팬 + 핀치 줌 =====
  function bindCameraGestures(){
    const el = canvas;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let dragStart = null;   // {x,y,panX,panY}
    let pinchStart = null;  // {dist, zoom}
    const dist = (a,b)=> Math.hypot(a.x-b.x, a.y-b.y);
    const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

    el.addEventListener('pointerdown', (e)=>{
      pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      if(pointers.size === 1){
        dragStart = { x:e.clientX, y:e.clientY, panX:camera.panX, panY:camera.panY };
        pinchStart = null;
      } else if(pointers.size === 2){
        dragStart = null;
        const pts = [...pointers.values()];
        pinchStart = { dist: dist(pts[0], pts[1]), zoom: camera.zoom };
      }
    });
    el.addEventListener('pointermove', (e)=>{
      if(!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if(pointers.size === 1 && dragStart){
        const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        camera.panX = dragStart.panX - dx / camera.zoom;
        camera.panY = dragStart.panY - dy / camera.zoom;
      } else if(pointers.size === 2 && pinchStart){
        const pts = [...pointers.values()];
        const d = dist(pts[0], pts[1]);
        camera.zoom = clamp(pinchStart.zoom * (d / pinchStart.dist), ZOOM_MIN, ZOOM_MAX);
      }
    });
    const endPointer = (e)=>{
      pointers.delete(e.pointerId);
      if(pointers.size < 2) pinchStart = null;
      if(pointers.size === 1){
        const pts = [...pointers.values()];
        dragStart = { x:pts[0].x, y:pts[0].y, panX:camera.panX, panY:camera.panY };
      } else {
        dragStart = null;
      }
    };
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    // 데스크톱 보조: 마우스 휠/트랙패드로도 확대·축소
    el.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      camera.zoom = clamp(camera.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    }, { passive:false });
  }

  function tileAt(gx, gy){
    if(!currentScene) return '#';
    const row = currentScene.grid[gy];
    if(row === undefined) return '#';
    const ch = row[gx];
    return ch === undefined ? '#' : ch;
  }

  function findEntityAt(gx, gy){
    // 문
    if(currentScene.doors){
      for(const d of currentScene.doors) if(d.x===gx && d.y===gy) return {type:'door', data:d};
    }
    // NPC
    if(currentScene.npcs){
      for(const n of currentScene.npcs) if(n.x===gx && n.y===gy) return {type:'npc', data:n};
    }
    // 상점
    if(currentScene.shopAt){
      for(const s of currentScene.shopAt) if(s.x===gx && s.y===gy) return {type:'shop', data:s};
    }
    // HQ 업그레이드
    if(currentScene.hqUpgradeAt){
      for(const h of currentScene.hqUpgradeAt) if(h.x===gx && h.y===gy) return {type:'hq', data:h};
    }
    // 몬스터
    for(const m of liveMonsters) if(m.x===gx && m.y===gy) return {type:'monster', data:m};
    // 화재이벤트
    if(currentScene.fireEvents){
      for(const e of currentScene.fireEvents) if(e.x===gx && e.y===gy && !resolvedEvents.has(e.uid)) return {type:'fireEvent', data:e};
    }
    return null;
  }

  function isBlocking(gx, gy){
    const t = tileAt(gx,gy);
    if(t === '#') return true;
    const ent = findEntityAt(gx,gy);
    if(ent && (ent.type==='npc' || ent.type==='monster' || ent.type==='shop' || ent.type==='hq')) return true;
    return false;
  }

  function loadScene(sceneId, spawn){
    const def = SCENES[sceneId];
    if(!def){ console.error('Unknown scene', sceneId); return; }
    currentScene = def;
    liveMonsters = (def.monsters||[]).filter(m => !isMonsterDefeated(sceneId, m.uid)).map(m=>({...m}));
    resolvedEvents = getResolvedSetFor(sceneId);
    const sp = spawn || def.spawn || {x:1,y:1};
    player.x = sp.x; player.y = sp.y;
    player.toX = sp.x; player.toY = sp.y;
    player.px = sp.x * TILE_SIZE; player.py = sp.y * TILE_SIZE;
    player.moving = false;
    camera.panX = 0; camera.panY = 0; // 씬이 바뀌면 수동 팬은 초기화(줌 배율은 유지)
    if(hooks.onSceneLoaded) hooks.onSceneLoaded(def);
  }

  // 게임 상태(격파한 몬스터/해결한 이벤트)는 game.js의 SaveData에 위임
  function isMonsterDefeated(sceneId, uid){
    return window.GameState && window.GameState.defeated && window.GameState.defeated.has(sceneId+':'+uid);
  }
  function getResolvedSetFor(sceneId){
    const s = new Set();
    if(window.GameState && window.GameState.resolvedEvents){
      for(const key of window.GameState.resolvedEvents){
        if(key.startsWith(sceneId+':')) s.add(key.split(':')[1]);
      }
    }
    return s;
  }

  function removeMonster(uid){
    liveMonsters = liveMonsters.filter(m=>m.uid!==uid);
  }
  function markEventResolved(uid){
    resolvedEvents.add(uid);
  }

  function tryStartMove(dir){
    if(player.moving || inputLocked) return;
    let dx=0, dy=0;
    if(dir==='up'){ dy=-1; player.facing='up'; }
    else if(dir==='down'){ dy=1; player.facing='down'; }
    else if(dir==='left'){ dx=-1; player.facing='left'; }
    else if(dir==='right'){ dx=1; player.facing='right'; }
    const nx = player.x+dx, ny = player.y+dy;

    if(dx===0 && dy===0) return;

    const ent = findEntityAt(nx, ny);
    if(ent && ent.type==='monster'){
      if(hooks.onMonsterEncounter) hooks.onMonsterEncounter(ent.data);
      return; // 몬스터 타일로는 이동하지 않음
    }
    if(ent && ent.type==='npc'){
      if(hooks.onNpcInteract) hooks.onNpcInteract(ent.data);
      return;
    }
    if(ent && ent.type==='shop'){
      if(hooks.onShopInteract) hooks.onShopInteract();
      return;
    }
    if(ent && ent.type==='hq'){
      if(hooks.onHqUpgradeInteract) hooks.onHqUpgradeInteract();
      return;
    }
    if(isBlocking(nx,ny)) return;

    player.fromX = player.x; player.fromY = player.y;
    player.toX = nx; player.toY = ny;
    player.moving = true; player.moveT = 0;
  }

  function onArrive(){
    player.x = player.toX; player.y = player.toY;
    player.moving = false;
    const ent = findEntityAt(player.x, player.y);
    if(ent && ent.type==='door'){
      if(hooks.onDoor) hooks.onDoor(ent.data);
      return;
    }
    if(ent && ent.type==='fireEvent'){
      if(hooks.onFireEvent) hooks.onFireEvent(ent.data);
      return;
    }
    if(hooks.onTileEnter) hooks.onTileEnter(player.x, player.y);
  }

  function bindInput(){
    window.addEventListener('keydown', (e)=>{
      const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
      if(map[e.key]){ heldDir = map[e.key]; e.preventDefault(); }
      if(e.key===' ' || e.key==='e' || e.key==='E'){ if(hooks.onInteractKey) hooks.onInteractKey(); }
    });
    window.addEventListener('keyup', (e)=>{
      const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
      if(map[e.key] && heldDir===map[e.key]) heldDir = null;
    });
    const bind = (id, dir)=>{
      const el = document.getElementById(id);
      const start = (ev)=>{ ev.preventDefault(); heldDir = dir; };
      const end = (ev)=>{ if(heldDir===dir) heldDir=null; };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('pointercancel', end);
    };
    bind('dpad-up','up'); bind('dpad-down','down'); bind('dpad-left','left'); bind('dpad-right','right');
  }

  let lastTs = 0;
  function loop(ts){
    const dt = lastTs ? ts - lastTs : 16;
    lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt){
    if(player.moving){
      player.moveT += dt / MOVE_MS;
      if(player.moveT >= 1){
        player.moveT = 1;
        player.px = player.toX * TILE_SIZE;
        player.py = player.toY * TILE_SIZE;
        onArrive();
        if(!player.moving && heldDir && !inputLocked) tryStartMove(heldDir);
      } else {
        player.px = (player.fromX + (player.toX-player.fromX)*player.moveT) * TILE_SIZE;
        player.py = (player.fromY + (player.toY-player.fromY)*player.moveT) * TILE_SIZE;
      }
    } else if(heldDir && !inputLocked){
      tryStartMove(heldDir);
    }
  }

  function render(){
    if(!currentScene) return;
    const wrap = document.getElementById('stage-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);

    const mapW = currentScene.grid[0].length * TILE_SIZE;
    const mapH = currentScene.grid.length * TILE_SIZE;
    const zoom = camera.zoom;
    const visW = W / zoom, visH = H / zoom; // 확대/축소를 반영한 실제 보이는 월드 영역 크기

    let camX, camY;
    if(mapW <= visW){
      camX = (mapW - visW) / 2; // 맵이 화면보다 작으면 화면 중앙에 오도록
    } else {
      camX = player.px + TILE_SIZE/2 - visW/2;
      camX = Math.max(0, Math.min(camX, mapW - visW));
    }
    if(mapH <= visH){
      camY = (mapH - visH) / 2;
    } else {
      camY = player.py + TILE_SIZE/2 - visH/2;
      camY = Math.max(0, Math.min(camY, mapH - visH));
    }
    camX += camera.panX;
    camY += camera.panY;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 바닥/벽
    for(let y=0;y<currentScene.grid.length;y++){
      const row = currentScene.grid[y];
      for(let x=0;x<row.length;x++){
        const ch = row[x];
        const px = x*TILE_SIZE, py = y*TILE_SIZE;
        if(ch === '#'){
          drawWallTile(px, py, y);
        } else {
          ctx.fillStyle = ((x+y)%2===0) ? shade(currentScene.bg, 1) : shade(currentScene.bg, 0.92);
          ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE);
          // 미세한 바닥 그레인(질감) — 타일 좌표 기반 고정 난수라 프레임마다 안 흔들림
          const g = rand01(x,y,1);
          if(g < 0.35){
            ctx.fillStyle = shade(currentScene.bg, g<0.15 ? 1.3 : 0.62);
            const sx = px + 7 + rand01(x,y,2)*(TILE_SIZE-14);
            const sy = py + 7 + rand01(x,y,3)*(TILE_SIZE-14);
            const sz = 1.4 + rand01(x,y,4)*1.6;
            ctx.beginPath(); ctx.arc(sx,sy,sz,0,Math.PI*2); ctx.fill();
          }
        }
      }
    }

    // 바닥 장식(잔디·자갈 등, 엔티티 없는 타일에만 드물게 — 씬마다 decor 세트가 있을 때만)
    if(currentScene.decor && currentScene.decor.length){
      for(let y=0;y<currentScene.grid.length;y++){
        const row = currentScene.grid[y];
        for(let x=0;x<row.length;x++){
          if(row[x] === '#') continue;
          const r = rand01(x,y,7);
          if(r >= 0.09) continue;
          if(findEntityAt(x,y)) continue;
          const emoji = currentScene.decor[Math.floor(rand01(x,y,8)*currentScene.decor.length)];
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.font = (TILE_SIZE*0.4)+'px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(emoji, x*TILE_SIZE+TILE_SIZE/2, y*TILE_SIZE+TILE_SIZE/2);
          ctx.restore();
        }
      }
    }

    // 문
    (currentScene.doors||[]).forEach(d=>{
      drawEmoji('🚪', d.x, d.y);
      drawLabel(d.label, d.x, d.y);
    });
    // 상점
    (currentScene.shopAt||[]).forEach(s=>{ drawEmoji('🛒', s.x, s.y); drawLabel('상점', s.x, s.y); });
    // HQ 업그레이드
    (currentScene.hqUpgradeAt||[]).forEach(h=>{ drawEmoji('🔧', h.x, h.y); drawLabel('개조', h.x, h.y); });
    // NPC
    (currentScene.npcs||[]).forEach(n=>{ drawEmoji(n.icon, n.x, n.y); drawLabel(n.name, n.x, n.y); });
    // 화재이벤트 (미해결만)
    (currentScene.fireEvents||[]).forEach(e=>{
      if(resolvedEvents.has(e.uid)) return;
      drawEmoji(e.icon, e.x, e.y, true);
      drawLabel(e.label, e.x, e.y);
    });
    // 몬스터 (은은하게 위아래로 까딱거리는 대기 모션)
    liveMonsters.forEach(m=>{
      const mdef = MONSTERS[m.monsterId];
      drawEmoji(mdef.icon, m.x, m.y, true);
      drawLabel(mdef.name, m.x, m.y);
    });

    // 플레이어 (이동 중엔 한 걸음마다 살짝 통통 튀는 홉 모션)
    const hop = player.moving ? -Math.sin(player.moveT*Math.PI)*6 : 0;
    ctx.font = (TILE_SIZE*0.8)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(player.emoji, player.px+TILE_SIZE/2, player.py+TILE_SIZE/2+hop);

    ctx.restore();
  }

  // 타일 좌표 기반 고정 의사난수 (프레임마다 값이 안 바뀌어서 텍스처가 깜빡이지 않음)
  function hash2(x,y,seed){
    let h = (x*374761393 + y*668265263 + (seed||0)*2246822519) >>> 0;
    h = Math.imul(h ^ (h>>>13), 1274126177) >>> 0;
    return (h ^ (h>>>16)) >>> 0;
  }
  function rand01(x,y,seed){ return (hash2(x,y,seed) % 10000) / 10000; }

  function drawWallTile(px, py, gridY){
    ctx.fillStyle = '#1c1310';
    ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE);
    // 벽돌 줄눈(가로 중앙 + 세로, 짝수/홀수 줄마다 반 칸씩 어긋나게)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py+TILE_SIZE/2); ctx.lineTo(px+TILE_SIZE, py+TILE_SIZE/2);
    const offset = (gridY % 2 === 0) ? TILE_SIZE/2 : 0;
    ctx.moveTo(px+offset, py); ctx.lineTo(px+offset, py+TILE_SIZE/2);
    ctx.stroke();
    // 위쪽 하이라이트 / 아래쪽 그림자로 입체감
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(px,py,TILE_SIZE,3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px,py+TILE_SIZE-3,TILE_SIZE,3);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeRect(px+0.5,py+0.5,TILE_SIZE-1,TILE_SIZE-1);
  }

  function drawEmoji(emoji, gx, gy, flicker){
    const t = performance.now()/300;
    const bob = flicker ? Math.sin(t)*3 : 0;
    ctx.font = (TILE_SIZE*0.72)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(emoji, gx*TILE_SIZE+TILE_SIZE/2, gy*TILE_SIZE+TILE_SIZE/2+bob);
  }
  function drawLabel(text, gx, gy){
    if(!text) return;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign='center';
    ctx.fillText(text, gx*TILE_SIZE+TILE_SIZE/2, gy*TILE_SIZE+TILE_SIZE-2);
  }
  function shade(hex, mult){
    if(!hex) return '#333';
    const c = hex.replace('#','');
    const r = Math.min(255, Math.floor(parseInt(c.substr(0,2),16)*mult));
    const g = Math.min(255, Math.floor(parseInt(c.substr(2,2),16)*mult));
    const b = Math.min(255, Math.floor(parseInt(c.substr(4,2),16)*mult));
    return `rgb(${r},${g},${b})`;
  }

  function interactFacing(){
    if(inputLocked) return;
    let dx=0, dy=0;
    if(player.facing==='up') dy=-1; else if(player.facing==='down') dy=1;
    else if(player.facing==='left') dx=-1; else dx=1;
    const ent = findEntityAt(player.x+dx, player.y+dy);
    if(!ent) return;
    if(ent.type==='npc' && hooks.onNpcInteract) hooks.onNpcInteract(ent.data);
    else if(ent.type==='shop' && hooks.onShopInteract) hooks.onShopInteract();
    else if(ent.type==='hq' && hooks.onHqUpgradeInteract) hooks.onHqUpgradeInteract();
    else if(ent.type==='monster' && hooks.onMonsterEncounter) hooks.onMonsterEncounter(ent.data);
  }

  return {
    init, loadScene, hooks, setInputLocked, interactFacing,
    removeMonster, markEventResolved,
    getPlayerTile: ()=>({x:player.x,y:player.y}),
    getCurrentSceneId: ()=> currentScene ? currentScene.id : null,
  };
})();
