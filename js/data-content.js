/*
 * 정적 게임 콘텐츠 데이터: 장비, 몬스터, 퀘스트, 씬(마을/소방서/던전), NPC, HQ 티어
 * 1단계(세로 슬라이스) 범위: 마을 + 소방서(HQ) + "우리 집" 던전 1개
 */

const TILE_SIZE = 40;

// ============ 장비: 방어구 (헬멧/방화복/장갑) — 단순 5티어 스탯 스케일링 ============
const ARMOR = {
  helmet: {
    label: '헬멧', icon: '⛑️', stat: 'def',
    tiers: [
      { tier:1, name:'낡은 안전모', def:1, cost:null },
      { tier:2, name:'기본 소방헬멧', def:3, cost:{gold:80,mat:20} },
      { tier:3, name:'강화 소방헬멧', def:6, cost:{gold:220,mat:60} },
      { tier:4, name:'내열 특수헬멧', def:10, cost:{gold:500,mat:140} },
      { tier:5, name:'전설의 지휘관헬멧', def:16, cost:{gold:1200,mat:320} },
    ]
  },
  suit: {
    label: '방화복', icon: '🥼', stat: 'hp',
    tiers: [
      { tier:1, name:'낡은 작업복', hp:0, cost:null },
      { tier:2, name:'기본 방화복', hp:10, cost:{gold:90,mat:25} },
      { tier:3, name:'강화 방화복', hp:24, cost:{gold:240,mat:70} },
      { tier:4, name:'내열 특수복', hp:44, cost:{gold:520,mat:150} },
      { tier:5, name:'전설의 소방복', hp:80, cost:{gold:1300,mat:340} },
    ]
  },
  gloves: {
    label: '장갑', icon: '🧤', stat: 'crit',
    tiers: [
      { tier:1, name:'목장갑', crit:2, cost:null },
      { tier:2, name:'기본 소방장갑', crit:5, cost:{gold:70,mat:18} },
      { tier:3, name:'강화 소방장갑', crit:9, cost:{gold:200,mat:55} },
      { tier:4, name:'내열 특수장갑', crit:14, cost:{gold:480,mat:130} },
      { tier:5, name:'전설의 손길장갑', crit:22, cost:{gold:1100,mat:300} },
    ]
  }
};

// ============ 장비: 공격 도구(특수장비) — 화재등급 상성표 ============
// 상성 배율: 1.5=특효, 1.0=무난, 0.5=비효율, -0.6=역효과(자신이 피해를 입음)
const FIRE_CLASSES = { A:'일반(종이·나무·천)', B:'유류', C:'전기', K:'주방(식용유)', SMOKE:'연기·질식' };

const TOOLS = {
  powder: {
    id:'powder', name:'분말(ABC)소화기', icon:'🧯', tier:1, baseAtk:5,
    match:{ A:1.2, B:1.1, C:1.1, K:0.8, SMOKE:0.5 },
    desc:'대부분의 불에 무난하게 통하는 기본 소화기.', cost:null, unlockHqTier:1
  },
  hose: {
    id:'hose', name:'물호스(옥내소화전)', icon:'🚿', tier:1, baseAtk:6,
    match:{ A:1.6, B:0.4, C:-0.6, K:0.3, SMOKE:0.6 },
    desc:'일반 화재엔 최고! 하지만 전기화재엔 감전 위험, 유류화재엔 오히려 불을 키워요.', cost:{gold:60,mat:15}, unlockHqTier:1
  },
  blanket: {
    id:'blanket', name:'담요/모래', icon:'🧣', tier:1, baseAtk:4,
    match:{ A:1.3, B:1.3, C:0.4, K:1.0, SMOKE:0.7 },
    desc:'산소를 차단해서 끄는 질식소화 도구. 전기화재엔 큰 효과가 없어요.', cost:{gold:50,mat:12}, unlockHqTier:1
  },
  kclass: {
    id:'kclass', name:'K급 소화기', icon:'🍳', tier:1, baseAtk:5,
    match:{ A:0.9, B:0.9, C:0.7, K:1.8, SMOKE:0.5 },
    desc:'주방·식용유 화재 전용 소화기. 일반 화재에도 무난해요.', cost:{gold:140,mat:40}, unlockHqTier:2
  },
  axe: {
    id:'axe', name:'소방도끼', icon:'🪓', tier:1, baseAtk:7,
    match:null, fixedMult:1.0,
    desc:'화재등급 상성은 없지만 항상 일정한 피해를 주고, 던전의 문·장애물을 부술 때도 쓰여요.', cost:{gold:120,mat:35}, unlockHqTier:2
  },
  towel: {
    id:'towel', name:'물 적신 수건', icon:'🩹', tier:1, baseAtk:2,
    match:{ A:0.6, B:0.6, C:0.6, K:0.6, SMOKE:1.6 },
    desc:'전투보다는 연기 자욱한 화재이벤트에서 진가를 발휘하는 도구예요.', cost:{gold:40,mat:10}, unlockHqTier:1
  }
};

// ============ 소모 아이템 ============
const ITEMS = {
  firstaid: { id:'firstaid', name:'응급키트', icon:'🩹', desc:'HP를 20 회복합니다.', heal:20, cost:{gold:30,mat:5} }
};

// ============ 몬스터 ============
const MONSTERS = {
  spark_ghost: {
    id:'spark_ghost', name:'스파크도깨비', icon:'⚡👻', fireClass:'C',
    hp:18, atk:4, xp:12, goldReward:[8,14], matReward:[2,4],
    intro:'누전 때문에 태어난 스파크도깨비가 지지직 나타났다!'
  },
  oil_slime: {
    id:'oil_slime', name:'기름슬라임', icon:'🛢️🟤', fireClass:'B',
    hp:22, atk:5, xp:14, goldReward:[10,16], matReward:[3,5],
    intro:'끈적한 기름슬라임이 스멀스멀 다가온다!'
  },
  rail_spark: {
    id:'rail_spark', name:'선로스파크', icon:'🚈⚡', fireClass:'C',
    hp:26, atk:6, xp:16, goldReward:[10,17], matReward:[3,6],
    intro:'선로 아래 전기설비에서 스파크가 튀더니 선로스파크가 나타났다!'
  },
  smoke_wraith: {
    id:'smoke_wraith', name:'연기망령', icon:'💨👻', fireClass:'SMOKE',
    hp:24, atk:6, xp:16, goldReward:[10,17], matReward:[3,6],
    intro:'자욱한 연기 속에서 흐릿한 형체의 연기망령이 스르륵 나타났다!'
  }
};

// ============ HQ(소방서) 티어 ============
const HQ_TIERS = [
  { tier:1, name:'무너져가는 창고', icon:'🏚️', reqGold:0, reqMat:0, bg:'#2a1c14', desc:'비가 새고 벽이 갈라진 낡은 창고. 여기서부터 시작이다.' },
  { tier:2, name:'허름한 가건물', icon:'🛖', reqGold:150, reqMat:60, bg:'#3a2818', desc:'지붕은 고쳤지만 아직 갈 길이 멀다.' },
  { tier:3, name:'기초 소방서', icon:'🏠', reqGold:400, reqMat:160, bg:'#4a3020', desc:'제법 소방서 꼴을 갖췄다. 추모관도 마련했다.' },
  { tier:4, name:'현대식 소방서', icon:'🏢', reqGold:900, reqMat:360, bg:'#553828', desc:'번쩍이는 현대식 장비가 갖춰졌다.' },
  { tier:5, name:'초호화 소방본부', icon:'🏰', reqGold:1800, reqMat:700, bg:'#5c4030', desc:'전설이 된 소방관의, 전설적인 본부.' },
];

// ============ 퀘스트 (메인 체인 — 세로 슬라이스분) ============
const QUESTS = [
  { id:'q1', step:1, title:'불씨와의 첫 만남', giver:'불씨',
    desc:'마을 이장님을 찾아가 인사해보자.',
    goal:{ type:'talk', targetId:'villager1' },
    reward:{ gold:20, mat:5 } },
  { id:'q2', step:2, title:'우리 집을 살펴보자', giver:'마을 이장',
    desc:'"우리 집" 화재현장에 가서 위험 요소를 하나 해결해보자.',
    goal:{ type:'fire_event', count:1 },
    reward:{ gold:30, mat:10 } },
  { id:'q3', step:3, title:'불꽃 몬스터 퇴치', giver:'마을 이장',
    desc:'우리 집에 나타난 불꽃 몬스터를 하나 물리치자.',
    goal:{ type:'defeat_monster', count:1 },
    reward:{ gold:40, mat:15 } },
  { id:'q4', step:4, title:'장비를 갖추자', giver:'마을 이장',
    desc:'상점에서 도구나 방어구를 하나 구매해보자.',
    goal:{ type:'buy_equipment', count:1 },
    reward:{ gold:20, mat:20 } },
  { id:'q5', step:5, title:'창고를 고쳐보자', giver:'마을 이장',
    desc:'소방서(HQ)를 2티어로 업그레이드하자.',
    goal:{ type:'hq_tier', tier:2 },
    reward:{ gold:60, mat:0 } },
  { id:'q6', step:6, title:'다음 이야기를 향해', giver:'불씨',
    desc:'첫 걸음을 뗀 걸 축하해! 더 큰 모험이 곧 찾아올 거야.',
    goal:{ type:'auto' },
    reward:{ gold:50, mat:30 } },
  { id:'q7', step:7, title:'지하철역의 이상한 낌새', giver:'불씨',
    desc:'마을에 새로 생긴 지하철역 입구에서 역무원 아저씨를 찾아 이야기를 들어보자.',
    goal:{ type:'talk', targetId:'stationWorker' },
    reward:{ gold:30, mat:10 } },
  { id:'q8', step:8, title:'지하철·지하상가 위험 점검', giver:'지하철 역무원',
    desc:'지하철역과 지하상가에 있는 화재 위험 요소를 하나 해결해보자.',
    goal:{ type:'fire_event', count:1 },
    reward:{ gold:35, mat:12 } },
  { id:'q9', step:9, title:'연기 속의 괴물들', giver:'지하철 역무원',
    desc:'지하철·지하상가에 나타난 화재 몬스터를 물리치자.',
    goal:{ type:'defeat_monster', count:1 },
    reward:{ gold:50, mat:18 } },
  { id:'q10', step:10, title:'두 번째 현장, 무사히!', giver:'불씨',
    desc:'지하철역과 지하상가를 안전하게 지켜냈어! 다음 현장을 기대해줘.',
    goal:{ type:'auto' },
    reward:{ gold:60, mat:25 } },
];

// ============ NPC & 씬(마을 / HQ / 던전) ============
// grid: 문자열 배열. '#'=벽, '.'=바닥. 좌표는 (col,row) 0-index.
const SCENES = {
  village: {
    id:'village', name:'마을', bg:'#233022',
    grid:[
      '##############',
      '#............#',
      '#....##......#',
      '#....##......#',
      '#....S.......#',
      '#............#',
      '#......N.....#',
      '#........W...#',
      '#............#',
      '##.D...D..D###',
    ],
    spawn:{x:6,y:6},
    doors:[
      { x:3, y:9, to:'hq', spawn:{x:4,y:3}, label:'소방서' },
      { x:7, y:9, to:'subway_dungeon', spawn:{x:5,y:1}, label:'지하철역 입구' },
      { x:10, y:9, to:'home_dungeon', spawn:{x:5,y:1}, label:'우리 집 화재현장' },
    ],
    npcs:[
      { id:'villager1', name:'마을 이장', icon:'👴', x:7, y:6,
        dialogue:['어이쿠, 신입 소방관! 잘 왔네.', '요즘 마을 곳곳에 화재 위험이 도사리고 있어 걱정이야.', '자네가 우리 집부터 좀 살펴봐 주겠나?'] },
      { id:'stationWorker', name:'지하철 역무원', icon:'👮', x:9, y:7,
        dialogue:['어? 자네가 소문의 그 소방관인가?', '요즘 지하철역이랑 지하상가 쪽에서 좀 이상한 열기가 느껴져서 걱정이야.', '가서 한번 살펴봐 줄 수 있겠나?'] },
    ],
    shopAt:[{x:5,y:4}],
  },
  hq: {
    id:'hq', name:'소방서', bg:'#2a1c14',
    grid:[
      '##########',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '####D#####',
    ],
    spawn:{x:4,y:3},
    doors:[ { x:4, y:7, to:'village', spawn:{x:3,y:8}, label:'마을' } ],
    npcs:[],
    hqUpgradeAt:[{x:4,y:1}],
  },
  home_dungeon: {
    id:'home_dungeon', name:'우리 집 화재현장', bg:'#3a1410', category:'home',
    grid:[
      '############',
      '#..........#',
      '#..E....M..#',
      '#..........#',
      '#....##....#',
      '#..........#',
      '#..M....E..#',
      '#..........#',
      '######D#####',
    ],
    spawn:{x:5,y:1},
    doors:[ { x:6, y:8, to:'village', spawn:{x:10,y:8}, label:'마을' } ],
    npcs:[],
    fireEvents:[
      { uid:'ev1', x:3, y:2, icon:'🔌', label:'과부하 콘센트' },
      { uid:'ev2', x:8, y:6, icon:'🛢️', label:'기름통' },
    ],
    monsters:[
      { uid:'m1', monsterId:'spark_ghost', x:8, y:2 },
      { uid:'m2', monsterId:'oil_slime', x:3, y:6 },
    ],
  },
  subway_dungeon: {
    id:'subway_dungeon', name:'지하철역·지하상가', bg:'#1c2430', category:'subway',
    grid:[
      '############',
      '#..........#',
      '#..E....M..#',
      '#..........#',
      '#....##....#',
      '#..........#',
      '#..M....E..#',
      '#..........#',
      '######D#####',
    ],
    spawn:{x:5,y:1},
    doors:[ { x:6, y:8, to:'village', spawn:{x:7,y:8}, label:'마을' } ],
    npcs:[],
    fireEvents:[
      { uid:'ev1', x:3, y:2, icon:'🚨', label:'지하철 비상용 단추' },
      { uid:'ev2', x:8, y:6, icon:'📢', label:'지하상가 화재경보기' },
    ],
    monsters:[
      { uid:'m1', monsterId:'rail_spark', x:8, y:2 },
      { uid:'m2', monsterId:'smoke_wraith', x:3, y:6 },
    ],
  }
};
