/*
 * 전투 엔진 — 포켓몬식 턴제 + 퀴즈 연동 + 화재등급 상성
 * game.js의 GameState/askQuiz/toast 등 전역 유틸을 그대로 사용한다 (플레인 스크립트, 별도 모듈 아님).
 */

const BattleEngine = (function(){
  let state = null; // { monsterInst, monsterDef, monsterHp, monsterHpMax, category, playerStats, onEnd }

  function el(id){ return document.getElementById(id); }

  function start(monsterInst, category, onEnd){
    const monsterDef = MONSTERS[monsterInst.monsterId];
    const playerStats = GameState.computeStats();
    state = {
      monsterInst, monsterDef,
      monsterHp: monsterDef.hp, monsterHpMax: monsterDef.hp,
      category, playerStats,
      onEnd, turnBusy:false,
    };
    SceneEngine.setInputLocked(true);
    el('battle-overlay').classList.add('show');
    el('mon-name').textContent = monsterDef.name;
    el('battle-monster-emoji').textContent = monsterDef.icon;
    el('battle-player-emoji').textContent = '🧑‍🚒';
    setLog(monsterDef.intro || (monsterDef.name+'이(가) 나타났다!'));
    refreshBars();
    showMenu();
    bindButtonsOnce();
  }

  function refreshBars(){
    const mp = Math.max(0, state.monsterHp), mm = state.monsterHpMax;
    el('mon-hp-fill').style.width = (100*mp/mm)+'%';
    el('mon-hp-text').textContent = mp+'/'+mm;
    const pp = Math.max(0, GameState.hp), pm = state.playerStats.hpMax;
    el('ply-hp-fill').style.width = (100*pp/pm)+'%';
    el('ply-hp-text').textContent = pp+'/'+pm;
  }

  function setLog(msg){ el('battle-log').textContent = msg; }

  // ===== 손맛 연출: 피격 플래시 / 화면 흔들림 / 데미지 팝업 =====
  function flashHit(elId){
    const node = el(elId);
    node.classList.remove('hit-flash'); void node.offsetWidth; node.classList.add('hit-flash');
  }
  function shakeArena(){
    const node = el('battle-arena');
    node.classList.remove('hit-shake'); void node.offsetWidth; node.classList.add('hit-shake');
  }
  function popup(sideElId, text, cls){
    const side = el(sideElId).parentElement;
    const p = document.createElement('div');
    p.className = 'dmg-popup ' + (cls||'dmg');
    p.textContent = text;
    side.appendChild(p);
    setTimeout(()=> p.remove(), 850);
  }

  let bound = false;
  function bindButtonsOnce(){
    if(bound) return; bound = true;
    el('btn-battle-attack').addEventListener('click', onClickAttack);
    el('btn-battle-item').addEventListener('click', onClickItem);
    el('btn-battle-flee').addEventListener('click', onClickFlee);
  }

  function showMenu(){
    el('battle-toolrow').classList.remove('show');
    el('battle-toolrow').innerHTML = '';
    el('battle-actions').style.display = 'grid';
  }

  function onClickAttack(){
    if(state.turnBusy) return;
    const owned = GameState.toolsOwned;
    const row = el('battle-toolrow');
    row.innerHTML = '';
    owned.forEach(toolId=>{
      const tool = TOOLS[toolId];
      const chip = document.createElement('div');
      chip.className = 'tool-chip';
      const mm = matchMultText(tool, state.monsterDef.fireClass);
      chip.innerHTML = `<span>${tool.icon} ${tool.name}</span><span class="fx">${mm}</span>`;
      chip.addEventListener('click', ()=> chooseTool(tool));
      row.appendChild(chip);
    });
    row.classList.add('show');
    el('battle-actions').style.display = 'none';
  }

  function matchMultText(tool, fireClass){
    if(!tool.match) return '고정 피해';
    const m = tool.match[fireClass];
    if(m >= 1.4) return '특효!';
    if(m >= 0.9) return '무난';
    if(m >= 0) return '비효율';
    return '역효과!';
  }

  function chooseTool(tool){
    if(state.turnBusy) return;
    state.turnBusy = true;
    state.pendingTool = tool;
    askQuiz(state.category, (result)=> resolveAttack(tool, result));
  }

  function resolveAttack(tool, result){
    let msg = '';
    if(result.correct){
      let dmg;
      if(tool.match){
        const mult = tool.match[state.monsterDef.fireClass];
        if(mult < 0){
          const selfDmg = Math.max(1, Math.round(tool.baseAtk * Math.abs(mult)));
          GameState.hp = Math.max(0, GameState.hp - selfDmg);
          msg = `앗, ${tool.name}은(는) 이 화재엔 안 맞아! 오히려 ${selfDmg}의 피해를 입었다!`;
          dmg = 0;
          flashHit('battle-player-emoji'); shakeArena();
          popup('battle-player-emoji', '-'+selfDmg, 'weak');
        } else {
          const crit = Math.random()*100 < state.playerStats.crit;
          dmg = Math.round(tool.baseAtk * mult * (crit?1.6:1) * state.playerStats.atkFactor);
          state.monsterHp = Math.max(0, state.monsterHp - dmg);
          msg = `정답! ${tool.name}(으)로 ${dmg}의 피해를 입혔다!` + (crit?' (치명타!)':'') + (mult>=1.4?' 상성 적중!':(mult<0.9?' (상성이 약해요)':''));
          flashHit('battle-monster-emoji'); shakeArena();
          popup('battle-monster-emoji', '-'+dmg, crit?'crit':(mult<0.9?'weak':'dmg'));
        }
      } else {
        const crit = Math.random()*100 < state.playerStats.crit;
        dmg = Math.round(tool.baseAtk * (tool.fixedMult||1) * (crit?1.6:1) * state.playerStats.atkFactor);
        state.monsterHp = Math.max(0, state.monsterHp - dmg);
        msg = `정답! ${tool.name}(으)로 ${dmg}의 피해를 입혔다!` + (crit?' (치명타!)':'');
        flashHit('battle-monster-emoji'); shakeArena();
        popup('battle-monster-emoji', '-'+dmg, crit?'crit':'dmg');
      }
    } else {
      msg = '오답이었다... 몬스터의 반격이 이어진다!';
    }
    setLog(msg);
    refreshBars();
    showMenu();

    setTimeout(()=>{
      if(state.monsterHp <= 0){ onWin(); return; }
      monsterTurn();
    }, 850);
  }

  function monsterTurn(){
    const raw = Math.max(1, state.monsterDef.atk - state.playerStats.def);
    GameState.hp = Math.max(0, GameState.hp - raw);
    setLog(`${state.monsterDef.name}의 공격! ${raw}의 피해를 입었다.`);
    flashHit('battle-player-emoji'); shakeArena();
    popup('battle-player-emoji', '-'+raw, 'dmg');
    refreshBars();
    state.turnBusy = false;
    if(GameState.hp <= 0){ setTimeout(onLose, 700); }
  }

  function onClickItem(){
    if(state.turnBusy) return;
    if((GameState.items.firstaid||0) <= 0){
      toast('응급키트가 없어요!', 'warning'); return;
    }
    state.turnBusy = true;
    GameState.items.firstaid--;
    GameState.hp = Math.min(state.playerStats.hpMax, GameState.hp + ITEMS.firstaid.heal);
    setLog(`응급키트를 사용해 HP를 ${ITEMS.firstaid.heal} 회복했다!`);
    popup('battle-player-emoji', '+'+ITEMS.firstaid.heal, 'heal');
    refreshBars();
    setTimeout(monsterTurn, 850);
  }

  function onClickFlee(){
    if(state.turnBusy) return;
    if(Math.random() < 0.7){
      setLog('무사히 도망쳤다!');
      setTimeout(()=> end('flee'), 600);
    } else {
      setLog('도망칠 수 없었다!');
      state.turnBusy = true;
      setTimeout(monsterTurn, 700);
    }
  }

  function onWin(){
    const [gMin,gMax] = state.monsterDef.goldReward;
    const [mMin,mMax] = state.monsterDef.matReward;
    const gold = gMin + Math.floor(Math.random()*(gMax-gMin+1));
    const mat = mMin + Math.floor(Math.random()*(mMax-mMin+1));
    GameState.gold += gold; GameState.materials += mat;
    GameState.addXp(state.monsterDef.xp);
    setLog(`${state.monsterDef.name}을(를) 물리쳤다! 🎉`);
    toast(`승리! 골드+${gold} 자재+${mat} 경험치+${state.monsterDef.xp}`, 'success');
    const sceneId = SceneEngine.getCurrentSceneId();
    SceneEngine.removeMonster(state.monsterInst.uid);
    GameState.defeated.add(sceneId+':'+state.monsterInst.uid);
    GameState.questProgressEvent('defeat_monster');
    setTimeout(()=> end('win'), 900);
  }

  function onLose(){
    setLog('정신이 아득해진다...');
    GameState.gold = Math.max(0, GameState.gold - Math.floor(GameState.gold*0.2));
    GameState.hp = Math.max(5, Math.floor(state.playerStats.hpMax*0.3));
    toast('정신을 차려보니 소방서였다... 자재를 조금 잃었다.', 'error');
    setTimeout(()=>{
      SceneEngine.loadScene('hq');
      end('lose');
    }, 900);
  }

  function end(result){
    el('battle-overlay').classList.remove('show');
    SceneEngine.setInputLocked(false);
    const cb = state.onEnd;
    state = null;
    GameState.save();
    if(cb) cb(result);
  }

  return { start };
})();
