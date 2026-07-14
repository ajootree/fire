/*
 * game.js — 전역 상태(GameState), 학습 시스템(레슨/안전수첩), 퀴즈 UI, 상점/HQ, 퀘스트, 세이브/로드,
 * 그리고 부트스트랩. 플레인 스크립트로 다른 js 파일들과 전역을 공유한다.
 */

// ============================================================
// GameState
// ============================================================
const GameState = {
  title:'이상한 아이', // 스토리 진행에 따라 승격됨: 이상한 아이 → 수습 소방관 → 신입 소방관
  gold:20, materials:10, level:1, xp:0, hp:30,
  armorTier:{helmet:1, suit:1, gloves:1},
  toolsOwned:['powder'],
  items:{firstaid:0},
  hqTier:1,
  questIndex:0, questGoalProgress:0, questDeliverReady:false,
  defeated:new Set(), resolvedEvents:new Set(), seenQuestions:new Set(),
  lessonDelivered:{}, // {categoryId: 지금까지 전달된 레슨 개수} — 조금씩 나눠서 전달
  lessonEventCount:{}, // {categoryId: 지금까지 발생한 "전달 계기"(입장/인카운터) 횟수}
  examTaken:{}, // {categoryId: 진급시험을 이미 치렀는지}
  notebook:{},
  sceneId:'village', playerX:6, playerY:6,

  computeStats(){
    const suitHp = ARMOR.suit.tiers[this.armorTier.suit-1].hp;
    const helmDef = ARMOR.helmet.tiers[this.armorTier.helmet-1].def;
    const gloveCrit = ARMOR.gloves.tiers[this.armorTier.gloves-1].crit;
    return {
      hpMax: 30 + suitHp + (this.level-1)*4,
      def: 2 + helmDef,
      crit: 5 + gloveCrit,
      atkFactor: 1 + (this.level-1)*0.12,
    };
  },
  xpNext(){ return 30 + (this.level-1)*20; },
  addXp(n){
    this.xp += n;
    let next = this.xpNext();
    while(this.xp >= next){
      this.xp -= next;
      this.level++;
      const st = this.computeStats();
      this.hp = st.hpMax;
      toast(`레벨 업! Lv.${this.level}`, 'success');
      next = this.xpNext();
    }
    updateHud();
  },
  updateTitle(){
    let next = '이상한 아이';
    if(this.questIndex >= QUESTS.length) next = '신입 소방관';
    else if(this.questIndex >= 3) next = '수습 소방관';
    if(next !== this.title){
      this.title = next;
      toast(`칭호 획득: "${next}"`, 'success');
      updateHud();
    }
  },
  notebookAdd(cat, title, text){
    if(!this.notebook[cat]) this.notebook[cat] = [];
    if(this.notebook[cat].some(e=>e.title===title)) return;
    this.notebook[cat].push({title, text});
  },
  questProgressEvent(type, payload){
    const q = QUESTS[this.questIndex];
    if(!q || q.goal.type !== type) return;
    payload = payload || {};
    switch(type){
      case 'talk':
        if(payload.targetId === q.goal.targetId) this.questDeliverReady = true;
        break;
      case 'fire_event':
      case 'defeat_monster':
      case 'buy_equipment':
        this.questGoalProgress++;
        if(this.questGoalProgress >= q.goal.count) this.questDeliverReady = true;
        break;
      case 'hq_tier':
        if(this.hqTier >= q.goal.tier) this.questDeliverReady = true;
        break;
    }
    updateQuestPanel();
    this.save();
  },
  deliverQuest(){
    const q = QUESTS[this.questIndex];
    if(!q || !this.questDeliverReady) return;
    this.gold += q.reward.gold||0;
    this.materials += q.reward.mat||0;
    toast(`퀘스트 완료: ${q.title}! (골드+${q.reward.gold||0} 자재+${q.reward.mat||0})`, 'success');
    this.questIndex++;
    this.questGoalProgress = 0;
    this.questDeliverReady = false;
    const nq = QUESTS[this.questIndex];
    if(nq && nq.goal.type === 'auto') this.questDeliverReady = true;
    this.updateTitle();
    updateHud(); updateQuestPanel(); this.save();
  },
  save(){
    const tile = SceneEngine.getPlayerTile();
    const data = {
      title:this.title,
      gold:this.gold, materials:this.materials, level:this.level, xp:this.xp, hp:this.hp,
      armorTier:this.armorTier, toolsOwned:this.toolsOwned, items:this.items, hqTier:this.hqTier,
      questIndex:this.questIndex, questGoalProgress:this.questGoalProgress, questDeliverReady:this.questDeliverReady,
      defeated:[...this.defeated], resolvedEvents:[...this.resolvedEvents],
      seenQuestions:[...this.seenQuestions], lessonDelivered:this.lessonDelivered,
      lessonEventCount:this.lessonEventCount, examTaken:this.examTaken,
      notebook:this.notebook,
      sceneId: SceneEngine.getCurrentSceneId() || this.sceneId,
      playerX: tile.x, playerY: tile.y,
    };
    try{ localStorage.setItem('ffl_save_v1', JSON.stringify(data)); }catch(e){}
  },
  load(){
    try{
      const raw = localStorage.getItem('ffl_save_v1');
      if(!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(this, data);
      this.defeated = new Set(data.defeated||[]);
      this.resolvedEvents = new Set(data.resolvedEvents||[]);
      this.seenQuestions = new Set(data.seenQuestions||[]);
      this.lessonDelivered = data.lessonDelivered || {};
      this.lessonEventCount = data.lessonEventCount || {};
      this.examTaken = data.examTaken || {};
      return true;
    }catch(e){ return false; }
  }
};
window.GameState = GameState;

// ============================================================
// Toast
// ============================================================
function toast(msg, type){
  const box = document.getElementById('toast-box');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' '+type : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(), 300); }, 3200);
}

// ============================================================
// HUD
// ============================================================
function updateHud(){
  document.getElementById('hud-name').textContent = GameState.title;
  const st = GameState.computeStats();
  document.getElementById('hp-fill').style.width = (100*Math.max(0,GameState.hp)/st.hpMax)+'%';
  document.getElementById('hp-text').textContent = Math.max(0,GameState.hp)+'/'+st.hpMax;
  document.getElementById('lv-badge').textContent = 'Lv'+GameState.level;
  const xpNext = GameState.xpNext();
  document.getElementById('xp-fill').style.width = (100*GameState.xp/xpNext)+'%';
  document.getElementById('xp-text').textContent = GameState.xp+'/'+xpNext;
  document.getElementById('disp-gold').textContent = GameState.gold;
  document.getElementById('disp-mat').textContent = GameState.materials;
}

// ============================================================
// 대화창 (불씨요정) — 학습 시스템의 화자
// ============================================================
const TYPEWRITER_MS_PER_CHAR = 24;
function showDialogue(lines, opts, onDone){
  opts = opts || {};
  const box = document.getElementById('dialogue-box');
  const nameEl = document.getElementById('dlg-name');
  const textEl = document.getElementById('dlg-text');
  const nextBtn = document.getElementById('dlg-next');
  const skipBtn = document.getElementById('dlg-skip');
  nameEl.textContent = opts.name || '불씨';
  document.getElementById('dlg-portrait').textContent = opts.portrait || '🔥';
  skipBtn.style.display = opts.skippable ? 'inline-block' : 'none';
  let i = 0;
  let revealTimer = null;
  let revealing = false;
  box.classList.add('show');
  SceneEngine.setInputLocked(true);

  // 타자기 효과로 한 글자씩 보여준다 — 클릭을 연타해도 최소한 전체 문장이 화면에 노출된 뒤에야
  // 다음 줄로 넘어가도록 강제한다 (한 번 더 누르면 그때는 다음 줄로 진행)
  function render(){
    const full = lines[i];
    let ci = 0;
    revealing = true;
    textEl.textContent = '';
    clearInterval(revealTimer);
    revealTimer = setInterval(()=>{
      ci++;
      textEl.textContent = full.slice(0, ci);
      if(ci >= full.length){ clearInterval(revealTimer); revealing = false; }
    }, TYPEWRITER_MS_PER_CHAR);
  }
  function completeReveal(){
    clearInterval(revealTimer);
    textEl.textContent = lines[i];
    revealing = false;
  }
  function advance(){
    if(revealing){ completeReveal(); return; }
    i++; if(i>=lines.length) finish(); else render();
  }
  function finish(){
    clearInterval(revealTimer);
    box.classList.remove('show');
    nextBtn.removeEventListener('click', advance);
    skipBtn.removeEventListener('click', finish);
    SceneEngine.setInputLocked(false);
    if(onDone) onDone();
  }
  nextBtn.addEventListener('click', advance);
  skipBtn.addEventListener('click', finish);
  render();
}

// 핵심 장면용 중앙 팝업 카드(제목 드롭, 시간 경과 등 강조가 필요한 순간에 사용)
function showStoryCard(icon, text, onDone){
  document.getElementById('story-card-icon').textContent = icon;
  document.getElementById('story-card-text').textContent = text;
  const modal = document.getElementById('story-card-modal');
  modal.classList.add('show');
  SceneEngine.setInputLocked(true);
  const btn = document.getElementById('story-card-next');
  const onClick = ()=>{
    btn.removeEventListener('click', onClick);
    modal.classList.remove('show');
    SceneEngine.setInputLocked(false);
    if(onDone) onDone();
  };
  btn.addEventListener('click', onClick);
}

// 대화 도중 짧은 선택지를 골라보는 가벼운 분기(정오답 판정 없이 반응만 갈리는 플레이버용).
// choices: [{text, response}]
function showDialogueChoice(name, portrait, promptLines, choices, onDone){
  showDialogue(promptLines, {name, portrait, skippable:false}, ()=>{
    SceneEngine.setInputLocked(true);
    const box = document.getElementById('dialogue-box');
    const body = document.getElementById('dlg-body');
    const textEl = document.getElementById('dlg-text');
    const nextBtn = document.getElementById('dlg-next');
    box.classList.add('show');
    document.getElementById('dlg-name').textContent = name;
    document.getElementById('dlg-portrait').textContent = portrait;
    textEl.textContent = '';
    nextBtn.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'dlg-choice-wrap';
    choices.forEach(choice=>{
      const btn = document.createElement('button');
      btn.className = 'dlg-choice-btn';
      btn.textContent = choice.text;
      btn.addEventListener('click', ()=>{
        wrap.remove();
        textEl.textContent = choice.response;
        nextBtn.style.display = '';
        const onNext = ()=>{
          nextBtn.removeEventListener('click', onNext);
          box.classList.remove('show');
          SceneEngine.setInputLocked(false);
          if(onDone) onDone();
        };
        nextBtn.addEventListener('click', onNext);
      });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
  });
}

// ============================================================
// 오프닝 시퀀스 — 불씨와의 첫 만남 (최초 1회, 세이브 없을 때만 재생)
// ============================================================
const INTRO_SEQUENCE = [
  { type:'dialogue', name:'내레이션', portrait:'📖', lines:[
    '이 마을은 평소와 다름없이 조용한 아침을 맞이했다.',
    '너는 딱히 특별할 것 없는, 그냥 그런 하루를 보내고 있었다 — 그 이상한 빛을 보기 전까지는.'
  ]},
  { type:'dialogue', name:'???', portrait:'❓', lines:[
    '어...? 저기 뭔가, 조그맣고 이상한 불빛이 둥둥 떠 있어...!'
  ]},
  { type:'dialogue', name:'나', portrait:'😱', lines:[
    '부, 불이야!!! 불이야!!! 누가 좀 꺼주세요!!!'
  ]},
  { type:'dialogue', name:'마을 사람', portrait:'😐', lines:[
    '뭐? 불이라고? ...어디에? 아무것도 안 보이는데?',
    '얘 요즘 자꾸 이상한 소리를 하네... 헛것이라도 보는 거 아니야?'
  ]},
  { type:'dialogue', name:'내레이션', portrait:'📖', lines:[
    '아무리 둘러봐도, 그 불빛은 다른 사람 눈에는 전혀 보이지 않는 것 같았다.',
    '그날 이후로 마을 사람들은 너를 이렇게 부르기 시작했다.'
  ]},
  { type:'card', icon:'🏷️', text:'"허구한 날 불났다고 소리 지르는, 좀 이상한 애."' },
  { type:'dialogue', name:'불씨', portrait:'🔥', lines:[
    '어라? 너 나 보여?! 완전 신기하다 — 지금까지 아무도 날 본 적 없었는데!'
  ]},
  { type:'dialogue', name:'나', portrait:'😳', lines:[
    '너... 너는 대체 정체가 뭔데?!'
  ]},
  { type:'dialogue', name:'불씨', portrait:'🔥', lines:[
    '나? 그냥 불씨야. 여기저기 마을을 떠돌아다니고 있었지.'
  ]},
  { type:'choice', name:'불씨', portrait:'🔥',
    prompt:['심심했는데 잘됐다 — 이제부터 내가 옆에서 이것저것 가르쳐줄게! 어때?'],
    choices:[
      { text:'좋아, 뭐라도 배워보자!', response:'나: 든든하네. 좋아, 잘 부탁해!' },
      { text:'...나는 딱히 부탁한 적 없는데.', response:'불씨: 에이, 어차피 마을 사람들은 이미 널 이상한 애 취급하잖아? 이판사판이지 뭐!' },
    ]
  },
  { type:'dialogue', name:'내레이션', portrait:'📖', lines:[
    '그렇게, 아무도 믿어주지 않는 소방관 지망생과 정체 모를 불씨의 동거가 시작되었다.'
  ]},
  { type:'card', icon:'📅', text:'몇 주 뒤...' },
  { type:'dialogue', name:'불씨', portrait:'🔥', lines:[
    '저기 마을 이장님 보이지? 가서 인사라도 하고 오자.',
    '뭐라도 보여드려야 사람들이 널 조금씩이라도 다시 보게 될 거 아냐!'
  ]},
];

function playIntroSequence(onDone){
  let i = 0;
  function next(){
    if(i >= INTRO_SEQUENCE.length){ if(onDone) onDone(); return; }
    const seg = INTRO_SEQUENCE[i];
    if(seg.type === 'card'){
      showStoryCard(seg.icon, seg.text, ()=>{ i++; next(); });
    } else if(seg.type === 'choice'){
      showDialogueChoice(seg.name, seg.portrait, seg.prompt, seg.choices, ()=>{ i++; next(); });
    } else {
      showDialogue(seg.lines, {name:seg.name, portrait:seg.portrait, skippable:false}, ()=>{ i++; next(); });
    }
  }
  next();
}

// 레슨은 한 번에 전부 주지 않고, 그 던전의 "전달 계기"(입장 1회 + 인카운터마다 1회)에 맞춰
// 균등하게 나눠서 전달한다. 예를 들어 레슨 7개 · 인카운터 4개(=계기 5개)면 2-2-1-1-1개씩 배분되어,
// 마지막 인카운터를 끝냈을 때 정확히 마지막 레슨까지 끝나도록 맞춰진다.
function getChapterSlotSizes(category, sceneId){
  const totalLessons = QUIZ_BANK[category].lessons.length;
  const scene = SCENES[sceneId];
  const totalEncounters = (scene.monsters||[]).length + (scene.fireEvents||[]).length;
  const slots = Math.max(1, totalEncounters + 1);
  const base = Math.floor(totalLessons / slots);
  const rem = totalLessons % slots;
  const sizes = [];
  for(let i=0;i<slots;i++) sizes.push(base + (i<rem ? 1 : 0));
  return sizes;
}

// 다음 전달 계기 분량만큼 레슨을 이어붙여 하나의 대화로 보여준다.
function deliverLessonEvent(category, sceneId, onDone){
  const lessons = QUIZ_BANK[category].lessons;
  const already = GameState.lessonDelivered[category] || 0;
  if(already >= lessons.length){ if(onDone) onDone(); return; }
  const sizes = getChapterSlotSizes(category, sceneId);
  const eventIdx = GameState.lessonEventCount[category] || 0;
  const take = sizes[Math.min(eventIdx, sizes.length-1)] || 1;
  const chunk = lessons.slice(already, already + take);
  if(chunk.length === 0){ if(onDone) onDone(); return; }
  const allLines = [];
  chunk.forEach(lesson=>{
    GameState.notebookAdd(category, lesson.title, lesson.lines.join(' '));
    allLines.push(...lesson.lines);
  });
  showDialogue(allLines, {name:'불씨', portrait:chunk[0].icon||'🔥', skippable:false}, ()=>{
    GameState.lessonDelivered[category] = already + chunk.length;
    GameState.lessonEventCount[category] = eventIdx + 1;
    GameState.save();
    // 1차 확인: 방금 배운 내용을 퀴즈 선택지로 바로 점검한 뒤에야 자유 이동으로 돌아간다
    // (2차 확인은 던전에서 실제 화재이벤트/전투를 통해 이뤄짐)
    presentQuiz(category, getQuizBag(category).next(), '1차 확인', ()=>{
      SceneEngine.setInputLocked(false);
      if(onDone) onDone();
    });
  });
}

// 던전의 모든 몬스터/화재이벤트가 처리됐는지 (=챕터 클리어)
function isDungeonCleared(sceneId){
  const scene = SCENES[sceneId];
  if(!scene || !scene.category) return false;
  const monstersDone = (scene.monsters||[]).every(m=> GameState.defeated.has(sceneId+':'+m.uid));
  const eventsDone = (scene.fireEvents||[]).every(e=> GameState.resolvedEvents.has(sceneId+':'+e.uid));
  return monstersDone && eventsDone;
}

// 몬스터 처치/화재이벤트 해결 등 "한 건"을 해낸 직후 호출: 남은 레슨을 이어주고,
// 챕터가 완전히 끝났으면 진급시험으로 이어준다.
function afterEncounterResolved(category, sceneId){
  const totalLessons = QUIZ_BANK[category].lessons.length;
  const hasMoreLessons = (GameState.lessonDelivered[category]||0) < totalLessons;
  const proceed = ()=>{
    if(isDungeonCleared(sceneId) && !GameState.examTaken[category]){
      GameState.examTaken[category] = true;
      GameState.save();
      setTimeout(()=> runChapterExam(category, ()=>{}), 400);
    } else {
      SceneEngine.setInputLocked(false);
    }
  };
  if(hasMoreLessons){
    SceneEngine.setInputLocked(true);
    setTimeout(()=> deliverLessonEvent(category, sceneId, proceed), 500);
  } else {
    proceed();
  }
}

// ============================================================
// 챕터 진급시험 — 한 챕터(던전) 클리어 시 문제를 몰아서 푸는 "시험" 모드
// ============================================================
const EXAM_LENGTH = 8;
function runChapterExam(category, onDone){
  const pool = QUIZ_BANK[category].questions.slice();
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const picks = pool.slice(0, Math.min(EXAM_LENGTH, pool.length));
  let idx = 0, correctCount = 0;
  toast(`🎖️ ${QUIZ_BANK[category].label} 진급시험 시작!`, 'warning');
  document.getElementById('quiz-modal').classList.add('exam-mode');
  function next(){
    if(idx >= picks.length){
      document.getElementById('quiz-modal').classList.remove('exam-mode');
      showExamResult(category, correctCount, picks.length, onDone);
      return;
    }
    presentQuiz(category, picks[idx], `문제 ${idx+1} / ${picks.length}`, (result)=>{
      if(result.correct) correctCount++;
      idx++;
      next();
    });
  }
  setTimeout(next, 400);
}

function showExamResult(category, correct, total, onDone){
  const pct = total>0 ? correct/total : 0;
  let icon, title;
  if(pct >= 0.9){ icon='🏅'; title='특급 합격! 미래의 소방관 에이스!'; }
  else if(pct >= 0.7){ icon='🎖️'; title='합격! 승진 자격을 얻었어요!'; }
  else if(pct >= 0.5){ icon='📜'; title='턱걸이 합격! 조금만 더 복습해볼까?'; }
  else { icon='📖'; title='아쉬워요! 안전수첩을 다시 보고 재도전해봐요.'; }
  const bonusGold = 30 + Math.round(correct*8);
  const bonusMat = 10 + Math.round(correct*3);
  GameState.gold += bonusGold; GameState.materials += bonusMat;
  GameState.save(); updateHud();

  document.getElementById('exam-result-icon').textContent = icon;
  document.getElementById('exam-result-title').textContent = title;
  document.getElementById('exam-result-score').textContent = `${total}문제 중 ${correct}개 정답`;
  document.getElementById('exam-result-reward').textContent = `보상: 골드+${bonusGold} 자재+${bonusMat}`;
  document.getElementById('exam-result-modal').classList.add('show');
  document.getElementById('exam-result-close').onclick = ()=>{
    document.getElementById('exam-result-modal').classList.remove('show');
    SceneEngine.setInputLocked(false);
    if(onDone) onDone();
  };
}

// ============================================================
// 퀴즈 (레슨 다음의 "적용" 단계 — 화재이벤트/전투 공용)
// ============================================================
function createShuffleBag(items){
  let bag = [];
  function refill(){
    bag = items.slice();
    for(let i=bag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
  }
  return { next(){ if(bag.length===0) refill(); return bag.pop(); } };
}
const quizBags = {};
function getQuizBag(category){
  if(!quizBags[category]) quizBags[category] = createShuffleBag(QUIZ_BANK[category].questions);
  return quizBags[category];
}

function askQuiz(category, cb){
  presentQuiz(category, getQuizBag(category).next(), null, cb);
}

function presentQuiz(category, q, progressText, cb){
  const order = q.opts.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }

  const isExam = document.getElementById('quiz-modal').classList.contains('exam-mode');
  document.getElementById('quiz-cat').textContent = isExam ? `🎖️ ${QUIZ_BANK[category].label} 진급시험` : QUIZ_BANK[category].label;
  const progEl = document.getElementById('quiz-progress');
  if(progressText){ progEl.textContent = progressText; progEl.classList.add('show'); }
  else progEl.classList.remove('show');
  document.getElementById('quiz-q').textContent = q.q;
  const optsWrap = document.getElementById('quiz-opts');
  optsWrap.innerHTML = '';
  optsWrap.dataset.answered = '0';
  const explainBox = document.getElementById('quiz-explain');
  const explainText = document.getElementById('quiz-explain-text');
  const nextBtn = document.getElementById('quiz-next-btn');
  explainBox.classList.remove('show');
  nextBtn.classList.remove('show');

  order.forEach(origIdx=>{
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = q.opts[origIdx];
    btn.dataset.origIdx = origIdx;
    optsWrap.appendChild(btn);
  });

  optsWrap.querySelectorAll('.quiz-opt').forEach(btn=>{
    btn.addEventListener('click', function(){
      if(optsWrap.dataset.answered === '1') return;
      optsWrap.dataset.answered = '1';
      const clickedIdx = parseInt(btn.dataset.origIdx, 10);
      const isCorrect = clickedIdx === q.correct;
      optsWrap.querySelectorAll('.quiz-opt').forEach(b=>{
        b.disabled = true;
        const bi = parseInt(b.dataset.origIdx, 10);
        if(bi === q.correct) b.classList.add('correct');
        else if(b===btn && !isCorrect) b.classList.add('wrong');
      });
      explainText.textContent = q.explain;
      explainBox.classList.add('show');
      nextBtn.classList.add('show');
      if(!GameState.seenQuestions.has(q.id)){
        GameState.seenQuestions.add(q.id);
        GameState.notebookAdd(category, q.q, q.explain);
      }
      nextBtn.onclick = ()=>{
        document.getElementById('quiz-modal').classList.remove('show');
        cb({ correct:isCorrect, q });
      };
    });
  });

  document.getElementById('quiz-modal').classList.add('show');
  SceneEngine.setInputLocked(true);
}

// ============================================================
// 안전 수첩
// ============================================================
function renderNotebook(){
  const body = document.getElementById('notebook-body');
  const cats = Object.keys(GameState.notebook);
  if(cats.length===0){
    body.innerHTML = '<p style="color:var(--modal-muted);">아직 배운 게 없어요. 화재현장에 가서 불씨의 이야기를 들어보세요!</p>';
    return;
  }
  let html = '';
  cats.forEach(cat=>{
    const label = QUIZ_BANK[cat] ? QUIZ_BANK[cat].label : cat;
    html += `<div class="note-cat">${label}</div>`;
    GameState.notebook[cat].forEach(entry=>{
      html += `<div class="note-entry"><strong>${entry.title}</strong><br>${entry.text}</div>`;
    });
  });
  body.innerHTML = html;
}

// ============================================================
// 상점
// ============================================================
function renderShop(tab){
  document.querySelectorAll('.shop-tab').forEach(t=> t.classList.toggle('active', t.dataset.shopTab===tab));
  const list = document.getElementById('shop-list');
  list.innerHTML = '';

  if(tab==='tool'){
    Object.values(TOOLS).forEach(tool=>{
      if(tool.unlockHqTier > GameState.hqTier) return;
      const owned = GameState.toolsOwned.includes(tool.id);
      const div = document.createElement('div');
      div.className = 'shop-item' + (owned?' equipped':'');
      const costText = tool.cost ? `골드${tool.cost.gold} · 자재${tool.cost.mat}` : '기본 지급';
      div.innerHTML = `<div class="ic">${tool.icon}</div><div class="info"><h4>${tool.name}</h4><p>${tool.desc}</p><p style="margin-top:4px;font-weight:700;">${costText}</p></div>`;
      const btn = document.createElement('button');
      btn.className = 'buy-btn';
      if(owned){ btn.textContent = '보유중'; btn.disabled = true; }
      else{
        btn.textContent = '구매';
        const afford = tool.cost && GameState.gold>=tool.cost.gold && GameState.materials>=tool.cost.mat;
        btn.disabled = !afford;
        btn.addEventListener('click', ()=>{
          GameState.gold -= tool.cost.gold; GameState.materials -= tool.cost.mat;
          GameState.toolsOwned.push(tool.id);
          GameState.questProgressEvent('buy_equipment');
          toast(`${tool.name} 구매!`, 'success');
          updateHud(); renderShop('tool'); GameState.save();
        });
      }
      div.appendChild(btn); list.appendChild(div);
    });
  } else if(tab==='armor'){
    Object.entries(ARMOR).forEach(([key,def])=>{
      const curTier = GameState.armorTier[key];
      const nextTierData = def.tiers[curTier];
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `<div class="ic">${def.icon}</div><div class="info"><h4>${def.label} (현재: ${def.tiers[curTier-1].name})</h4><p>${nextTierData ? '다음 등급: '+nextTierData.name : '최고 등급 도달!'}</p></div>`;
      const btn = document.createElement('button');
      btn.className = 'buy-btn';
      if(!nextTierData){ btn.textContent='MAX'; btn.disabled=true; }
      else{
        btn.textContent = `업그레이드 (골드${nextTierData.cost.gold}·자재${nextTierData.cost.mat})`;
        const afford = GameState.gold>=nextTierData.cost.gold && GameState.materials>=nextTierData.cost.mat;
        btn.disabled = !afford;
        btn.addEventListener('click', ()=>{
          GameState.gold -= nextTierData.cost.gold; GameState.materials -= nextTierData.cost.mat;
          GameState.armorTier[key]++;
          GameState.questProgressEvent('buy_equipment');
          toast(`${def.label} 업그레이드!`, 'success');
          updateHud(); renderShop('armor'); GameState.save();
        });
      }
      div.appendChild(btn); list.appendChild(div);
    });
  } else if(tab==='item'){
    Object.values(ITEMS).forEach(item=>{
      const owned = GameState.items[item.id]||0;
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `<div class="ic">${item.icon}</div><div class="info"><h4>${item.name} (보유:${owned})</h4><p>${item.desc}</p><p style="margin-top:4px;font-weight:700;">골드${item.cost.gold} · 자재${item.cost.mat}</p></div>`;
      const btn = document.createElement('button');
      btn.className = 'buy-btn'; btn.textContent = '구매';
      const afford = GameState.gold>=item.cost.gold && GameState.materials>=item.cost.mat;
      btn.disabled = !afford;
      btn.addEventListener('click', ()=>{
        GameState.gold -= item.cost.gold; GameState.materials -= item.cost.mat;
        GameState.items[item.id] = (GameState.items[item.id]||0)+1;
        toast(`${item.name} 구매!`, 'success');
        updateHud(); renderShop('item'); GameState.save();
      });
      div.appendChild(btn); list.appendChild(div);
    });
  }
}

// ============================================================
// 소방서(HQ) 성장
// ============================================================
function renderHq(){
  const cur = HQ_TIERS[GameState.hqTier-1];
  const next = HQ_TIERS[GameState.hqTier];
  document.getElementById('hq-title').textContent = `${cur.icon} ${cur.name}`;
  const body = document.getElementById('hq-body');
  let html = `<p style="margin-bottom:12px;">${cur.desc}</p>`;
  if(next){
    const afford = GameState.gold>=next.reqGold && GameState.materials>=next.reqMat;
    html += `<div class="shop-item"><div class="ic">${next.icon}</div><div class="info"><h4>다음 단계: ${next.name}</h4><p>필요: 골드 ${next.reqGold} · 자재 ${next.reqMat}</p></div><button class="buy-btn" id="hq-upgrade-btn" ${afford?'':'disabled'}>개조하기</button></div>`;
  } else {
    html += `<p style="font-weight:800;color:#92400e;">이미 최고 단계인 초호화 소방본부입니다!</p>`;
  }
  body.innerHTML = html;
  const btn = document.getElementById('hq-upgrade-btn');
  if(btn) btn.addEventListener('click', ()=>{
    GameState.gold -= next.reqGold; GameState.materials -= next.reqMat;
    GameState.hqTier++;
    SCENES.hq.bg = HQ_TIERS[GameState.hqTier-1].bg;
    toast(`소방서가 ${HQ_TIERS[GameState.hqTier-1].name}(으)로 성장했다!`, 'success');
    GameState.questProgressEvent('hq_tier');
    updateHud(); renderHq(); GameState.save();
    if(SceneEngine.getCurrentSceneId()==='hq') SceneEngine.loadScene('hq', SceneEngine.getPlayerTile());
  });
}

// ============================================================
// 퀘스트 패널
// ============================================================
function questGoalText(q){
  switch(q.goal.type){
    case 'talk': return '목표: 대화하기';
    case 'fire_event': return `목표: 화재 위험 해결 ${Math.min(GameState.questGoalProgress,q.goal.count)}/${q.goal.count}`;
    case 'defeat_monster': return `목표: 몬스터 처치 ${Math.min(GameState.questGoalProgress,q.goal.count)}/${q.goal.count}`;
    case 'buy_equipment': return `목표: 장비 구매 ${Math.min(GameState.questGoalProgress,q.goal.count)}/${q.goal.count}`;
    case 'hq_tier': return `목표: 소방서 ${q.goal.tier}티어 달성`;
    default: return '';
  }
}
function updateQuestPanel(){
  const q = QUESTS[GameState.questIndex];
  if(!q){
    document.getElementById('quest-title').textContent = '모든 퀘스트 완료!';
    document.getElementById('quest-desc').textContent = '전설의 시작이었다. 다음 이야기를 기대해줘!';
    document.getElementById('quest-goal').textContent = '';
    document.getElementById('quest-reward').textContent = '';
    document.getElementById('quest-deliver-btn').classList.remove('show');
    return;
  }
  document.getElementById('quest-title').textContent = `[${q.step}] ${q.title}`;
  document.getElementById('quest-desc').textContent = q.desc;
  document.getElementById('quest-goal').textContent = questGoalText(q);
  document.getElementById('quest-reward').textContent = `보상: 골드+${q.reward.gold||0} 자재+${q.reward.mat||0}`;
  document.getElementById('quest-deliver-btn').classList.toggle('show', !!GameState.questDeliverReady);
}

// ============================================================
// 모달 헬퍼
// ============================================================
function openModal(id){ document.getElementById(id).classList.add('show'); SceneEngine.setInputLocked(true); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); SceneEngine.setInputLocked(false); }

// ============================================================
// SceneEngine 훅 연결
// ============================================================
function wireHooks(){
  SceneEngine.hooks.onSceneLoaded = function(sceneDef){
    GameState.sceneId = sceneDef.id;
    updateHud();
    if(sceneDef.category && (GameState.lessonEventCount[sceneDef.category]||0) === 0){
      setTimeout(()=> deliverLessonEvent(sceneDef.category, sceneDef.id, ()=>{}), 250);
    }
  };
  SceneEngine.hooks.onDoor = function(door){ SceneEngine.loadScene(door.to, door.spawn); GameState.save(); };
  SceneEngine.hooks.onNpcInteract = function(npc){
    showDialogue(npc.dialogue, {name:npc.name, portrait:npc.icon}, ()=>{
      GameState.questProgressEvent('talk', {targetId:npc.id});
    });
  };
  SceneEngine.hooks.onShopInteract = function(){ renderShop('tool'); openModal('shop-modal'); };
  SceneEngine.hooks.onHqUpgradeInteract = function(){ renderHq(); openModal('hq-modal'); };
  SceneEngine.hooks.onFireEvent = function(eventData){
    SceneEngine.setInputLocked(true);
    const sceneId = SceneEngine.getCurrentSceneId();
    const category = SCENES[sceneId].category;
    askQuiz(category, (result)=>{
      if(result.correct){
        SceneEngine.markEventResolved(eventData.uid);
        GameState.resolvedEvents.add(sceneId+':'+eventData.uid);
        GameState.gold += 15; GameState.materials += 5;
        toast('화재 위험 해결! 골드+15 자재+5', 'success');
        GameState.questProgressEvent('fire_event');
        updateHud(); GameState.save();
        afterEncounterResolved(category, sceneId);
      } else {
        GameState.hp = Math.max(1, GameState.hp-5);
        toast('아차! 위험을 놓쳤다. HP-5', 'error');
        updateHud(); GameState.save();
        SceneEngine.setInputLocked(false);
      }
    });
  };
  SceneEngine.hooks.onMonsterEncounter = function(monsterInst){
    const sceneId = SceneEngine.getCurrentSceneId();
    const category = SCENES[sceneId].category;
    BattleEngine.start(monsterInst, category, (result)=>{
      updateHud(); updateQuestPanel(); GameState.save();
      if(result==='win') afterEncounterResolved(category, sceneId);
    });
  };
  SceneEngine.hooks.onInteractKey = function(){ SceneEngine.interactFacing(); };
}

// ============================================================
// UI 바인딩
// ============================================================
function wireUI(){
  document.getElementById('btn-interact').addEventListener('click', ()=> SceneEngine.interactFacing());
  document.getElementById('btn-notebook').addEventListener('click', ()=>{ renderNotebook(); openModal('notebook-modal'); });
  document.getElementById('btn-quest-toggle').addEventListener('click', ()=>{
    document.getElementById('quest-panel').classList.toggle('show');
  });
  document.getElementById('quest-deliver-btn').addEventListener('click', ()=> GameState.deliverQuest());
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=> closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.shop-tab').forEach(t=>{
    t.addEventListener('click', ()=> renderShop(t.dataset.shopTab));
  });
  wireKeyboardShortcuts();
}

// 키보드 편의 기능: 스페이스/엔터로 "다음" 계열 버튼 진행, 숫자키 1~4로 퀴즈 보기 선택
function wireKeyboardShortcuts(){
  window.addEventListener('keydown', (e)=>{
    if(e.key === ' ' || e.key === 'Enter'){
      if(document.getElementById('dialogue-box').classList.contains('show')){
        e.preventDefault();
        document.getElementById('dlg-next').click();
        return;
      }
      if(document.getElementById('quiz-modal').classList.contains('show')){
        e.preventDefault();
        const nextBtn = document.getElementById('quiz-next-btn');
        if(nextBtn.classList.contains('show')) nextBtn.click();
        return;
      }
      if(document.getElementById('exam-result-modal').classList.contains('show')){
        e.preventDefault();
        document.getElementById('exam-result-close').click();
        return;
      }
    }
    // 숫자키 1~4: 퀴즈 보기 선택 (아직 답을 고르지 않았을 때만)
    if(['1','2','3','4'].includes(e.key) && document.getElementById('quiz-modal').classList.contains('show')){
      const opts = document.querySelectorAll('#quiz-opts .quiz-opt');
      const idx = parseInt(e.key, 10) - 1;
      if(opts[idx] && !opts[idx].disabled){
        e.preventDefault();
        opts[idx].click();
      }
    }
  });
}

// ============================================================
// 부트스트랩
// ============================================================
function boot(){
  const hasSave = GameState.load();
  SCENES.hq.bg = HQ_TIERS[GameState.hqTier-1].bg;
  SceneEngine.init();
  wireHooks();
  wireUI();
  SceneEngine.loadScene(GameState.sceneId, {x:GameState.playerX, y:GameState.playerY});
  document.getElementById('quest-panel').classList.add('show');
  updateHud();
  updateQuestPanel();
  if(!hasSave){
    setTimeout(()=> playIntroSequence(()=>{}), 300);
  }
}

document.getElementById('boot-start-btn').addEventListener('click', ()=>{
  document.getElementById('boot-screen').style.display = 'none';
  boot();
});
