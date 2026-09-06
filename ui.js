import {
  Game, WORLDS, LEVELS_PER_WORLD, SKINS, ACHIEVEMENTS, POWERUP_TYPES,
  generateLevel, SAVE, persistSave, addXP, unlockAchievement, AUDIO, xpForLevel,
} from './app.js';

/* ------------------------------ dom refs --------------------------------- */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const screens = {};
$$('.screen').forEach(s => screens[s.dataset.screen] = s);

function showScreen(name){
  Object.values(screens).forEach(s=>s.classList.remove('active'));
  if(screens[name]) screens[name].classList.add('active');
  document.body.dataset.screen = name;
}

function fmtTime(s){
  s = Math.max(0,s);
  const m = Math.floor(s/60), sec = (s%60).toFixed(2);
  return `${m}:${sec.padStart(5,'0')}`;
}

/* ------------------------------ game boot --------------------------------- */

const canvas = $('#gameCanvas');
const game = new Game(canvas);
let currentLevelDef = null;
let currentContext = { mode:'story', worldIdx:0, lvlIdx:0, endlessChain:0 };

function isLevelUnlocked(w,l){
  const arr = SAVE.unlockedLevels[w];
  return !!(arr && arr.includes(l));
}
function unlockNext(w,l){
  let nw=w, nl=l+1;
  if(nl>=LEVELS_PER_WORLD){ nw=w+1; nl=0; }
  if(nw>=WORLDS.length) return;
  if(!SAVE.unlockedWorlds.includes(nw)) SAVE.unlockedWorlds.push(nw);
  if(!SAVE.unlockedLevels[nw]) SAVE.unlockedLevels[nw]=[];
  if(!SAVE.unlockedLevels[nw].includes(nl)) SAVE.unlockedLevels[nw].push(nl);
  persistSave();
  if(SAVE.unlockedWorlds.length >= WORLDS.length) unlockAchievement('world_hopper');
}

/* ------------------------------ loading / splash --------------------------- */

window.addEventListener('load', ()=>{
  let p = 0;
  const bar = $('#loadingBar');
  const iv = setInterval(()=>{
    p += 8 + Math.random()*14;
    if(p>=100){ p=100; clearInterval(iv); setTimeout(()=>{ showScreen('splash'); }, 250); }
    bar.style.width = p+'%';
  }, 90);
});

$('#splashStartBtn').addEventListener('click', ()=>{
  AUDIO.ensure(); AUDIO.click();
  if(SAVE.settings.music>0) AUDIO.startMusic();
  if(!SAVE.tutorialSeen){ showScreen('tutorial'); } else { showScreen('home'); }
  refreshDailyBanner();
});

$('#tutorialDoneBtn').addEventListener('click', ()=>{
  SAVE.tutorialSeen = true; persistSave();
  showScreen('home');
  refreshDailyBanner();
});

/* ------------------------------ home / nav -------------------------------- */

$$('[data-nav]').forEach(btn=>{
  btn.addEventListener('click', ()=>{ AUDIO.click(); showScreen(btn.dataset.nav); if(btn.dataset.nav==='worlds') renderWorlds(); if(btn.dataset.nav==='shop') renderShop(); if(btn.dataset.nav==='achievements') renderAchievements(); if(btn.dataset.nav==='leaderboard') renderLeaderboard(); if(btn.dataset.nav==='settings') renderSettings(); });
});

function refreshHomeStats(){
  $('#homeCoins').textContent = SAVE.coins;
  $('#homeLevel').textContent = SAVE.level;
  const xpNow = SAVE.xp - (SAVE.level>1?xpForLevel(SAVE.level-1):0);
  const xpNeed = xpForLevel(SAVE.level) - (SAVE.level>1?xpForLevel(SAVE.level-1):0);
  $('#homeXpBar').style.width = clampPct(xpNow/xpNeed*100)+'%';
  $('#homePlayerName').textContent = SAVE.playerName;
}
function clampPct(v){ return Math.max(0,Math.min(100,v)); }

function refreshDailyBanner(){
  const today = new Date().toDateString();
  const banner = $('#dailyBanner');
  if(SAVE.lastDaily === today){ banner.classList.add('claimed'); $('#dailyClaimBtn').disabled = true; $('#dailyClaimBtn').textContent='Claimed'; }
  else { banner.classList.remove('claimed'); $('#dailyClaimBtn').disabled = false; $('#dailyClaimBtn').textContent='Claim'; }
  $('#dailyStreak').textContent = SAVE.dailyStreak;
  refreshHomeStats();
}
$('#dailyClaimBtn').addEventListener('click', ()=>{
  const today = new Date().toDateString();
  if(SAVE.lastDaily === today) return;
  const yesterday = new Date(Date.now()-86400000).toDateString();
  SAVE.dailyStreak = (SAVE.lastDaily===yesterday) ? SAVE.dailyStreak+1 : 1;
  SAVE.lastDaily = today;
  const reward = 20 + SAVE.dailyStreak*5;
  SAVE.coins += reward;
  persistSave();
  AUDIO.orb();
  showToast(`Daily reward: +${reward} coins!`);
  refreshDailyBanner();
});

/* ------------------------------ worlds / level select ----------------------- */

function renderWorlds(){
  const wrap = $('#worldsList'); wrap.innerHTML = '';
  WORLDS.forEach((w,wi)=>{
    const unlocked = SAVE.unlockedWorlds.includes(wi);
    const card = document.createElement('div');
    card.className = 'world-card' + (unlocked?'':' locked');
    card.style.setProperty('--wcolor', '#'+w.accent.toString(16).padStart(6,'0'));
    card.innerHTML = `
      <div class="world-card-head">
        <span class="world-name">${w.name}</span>
        ${unlocked?'':'<span class="lock-icon">🔒</span>'}
      </div>
      <div class="level-dots"></div>`;
    const dots = card.querySelector('.level-dots');
    for(let li=0; li<LEVELS_PER_WORLD; li++){
      const d = document.createElement('button');
      const key = `${wi}-${li}`;
      const stars = SAVE.stars[key]||0;
      const un = isLevelUnlocked(wi,li);
      d.className = 'level-dot' + (un?'':' locked') + (li===LEVELS_PER_WORLD-1?' boss':'');
      d.innerHTML = un ? `<span>${li+1}${li===LEVELS_PER_WORLD-1?' 👑':''}</span><small>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</small>` : '🔒';
      d.disabled = !un;
      d.addEventListener('click', ()=> openLevelDetail(wi,li));
      dots.appendChild(d);
    }
    wrap.appendChild(card);
  });
}

let detailCtx = null;
function openLevelDetail(wi,li){
  AUDIO.click();
  detailCtx = {wi,li};
  const w = WORLDS[wi];
  const key = `${wi}-${li}`;
  $('#levelDetailTitle').textContent = li===LEVELS_PER_WORLD-1 ? `${w.name} — Boss Arena` : `${w.name} · Level ${li+1}`;
  $('#levelDetailBest').textContent = SAVE.bestTimes[key] ? fmtTime(SAVE.bestTimes[key]) : '—';
  $('#levelDetailStars').textContent = '★'.repeat(SAVE.stars[key]||0) + '☆'.repeat(3-(SAVE.stars[key]||0));
  showScreen('levelDetail');
}
$('#levelDetailBack').addEventListener('click', ()=>showScreen('worlds'));
$('#levelPlayStoryBtn').addEventListener('click', ()=> startLevel(detailCtx.wi, detailCtx.li, 'story'));
$('#levelPlayTimeBtn').addEventListener('click', ()=> startLevel(detailCtx.wi, detailCtx.li, 'time'));
$('#levelPlayHardcoreBtn').addEventListener('click', ()=> startLevel(detailCtx.wi, detailCtx.li, 'hardcore'));

/* ------------------------------ shop --------------------------------------- */

function renderShop(){
  const wrap = $('#shopList'); wrap.innerHTML='';
  $('#shopCoins').textContent = SAVE.coins;
  SKINS.forEach(skin=>{
    const owned = SAVE.ownedSkins.includes(skin.id);
    const equipped = SAVE.equippedSkin === skin.id;
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="skin-swatch" style="background:#${skin.color.toString(16).padStart(6,'0')}"></div>
      <div class="shop-card-info">
        <div class="skin-name">${skin.name}</div>
        <div class="skin-price">${owned? (equipped?'Equipped':'Owned') : skin.price+' coins'}</div>
      </div>
      <button class="btn-small ${equipped?'disabled':''}" ${equipped?'disabled':''}>${owned?'Equip':'Buy'}</button>`;
    card.querySelector('button').addEventListener('click', ()=>{
      AUDIO.click();
      if(owned){ SAVE.equippedSkin = skin.id; persistSave(); game.refreshSkin(); renderShop(); }
      else if(SAVE.coins >= skin.price){
        SAVE.coins -= skin.price; SAVE.ownedSkins.push(skin.id); SAVE.equippedSkin = skin.id;
        persistSave(); game.refreshSkin(); unlockAchievement('collector');
        AUDIO.power(); renderShop();
      } else { showToast('Not enough coins'); }
    });
    wrap.appendChild(card);
  });
}

/* ------------------------------ achievements -------------------------------- */

function renderAchievements(){
  const wrap = $('#achievementsList'); wrap.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    const done = SAVE.achievements.includes(a.id);
    const row = document.createElement('div');
    row.className = 'ach-row' + (done?' done':'');
    row.innerHTML = `<div class="ach-icon">${done?'✅':'⬜'}</div><div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div><div class="ach-xp">+${a.xp}xp</div>`;
    wrap.appendChild(row);
  });
}

/* ------------------------------ leaderboard --------------------------------- */

function renderLeaderboard(){
  const sel = $('#lbLevelSelect'); sel.innerHTML='';
  WORLDS.forEach((w,wi)=>{ for(let li=0; li<LEVELS_PER_WORLD; li++){
    if(!isLevelUnlocked(wi,li)) continue;
    const opt = document.createElement('option');
    opt.value = `${wi}-${li}`; opt.textContent = `${w.name} · ${li+1}`;
    sel.appendChild(opt);
  }});
  const opt2 = document.createElement('option'); opt2.value='endless'; opt2.textContent='Endless Mode'; sel.appendChild(opt2);
  sel.onchange = ()=>renderLbTable(sel.value);
  if(sel.value) renderLbTable(sel.value);
}
function renderLbTable(key){
  const body = $('#lbTableBody'); body.innerHTML='';
  if(key==='endless'){
    body.innerHTML = `<tr><td>1</td><td>${SAVE.playerName}</td><td>${SAVE.endlessHighScore}</td><td>—</td></tr>`;
    return;
  }
  const entries = (SAVE.leaderboards[key]||[]).slice().sort((a,b)=>a.time-b.time).slice(0,10);
  if(!entries.length){ body.innerHTML = '<tr><td colspan="4">No times yet — go set one!</td></tr>'; return; }
  entries.forEach((e,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${e.name}</td><td>${fmtTime(e.time)}</td><td>${e.coins}</td>`;
    body.appendChild(tr);
  });
}

/* ------------------------------ settings ------------------------------------ */

function renderSettings(){
  $('#settingGraphics').value = SAVE.settings.graphics;
  $('#settingSfx').value = SAVE.settings.sfx;
  $('#settingMusic').value = SAVE.settings.music;
  $('#settingSensitivity').value = SAVE.settings.sensitivity;
  $('#settingName').value = SAVE.playerName;
}
$('#settingGraphics').addEventListener('change', e=>{ SAVE.settings.graphics=e.target.value; persistSave(); showToast('Restart level to apply graphics change'); });
$('#settingSfx').addEventListener('input', e=>{ SAVE.settings.sfx=+e.target.value; AUDIO.applyVolumes(); persistSave(); });
$('#settingMusic').addEventListener('input', e=>{ SAVE.settings.music=+e.target.value; AUDIO.applyVolumes(); persistSave(); if(SAVE.settings.music>0) AUDIO.startMusic(); else AUDIO.stopMusic(); });
$('#settingSensitivity').addEventListener('input', e=>{ SAVE.settings.sensitivity=+e.target.value; persistSave(); });
$('#settingName').addEventListener('change', e=>{ SAVE.playerName = e.target.value.slice(0,16)||'Player'; persistSave(); refreshHomeStats(); });
$('#resetSaveBtn').addEventListener('click', ()=>{
  if(confirm('Erase all progress? This cannot be undone.')){
    localStorage.removeItem('bounceuniverse_save_v1');
    location.reload();
  }
});

/* ------------------------------ endless mode --------------------------------- */

$('#playEndlessBtn').addEventListener('click', ()=>{
  AUDIO.click();
  currentContext = { mode:'endless', worldIdx: SAVE.unlockedWorlds[SAVE.unlockedWorlds.length-1], chain:0 };
  game.mode = 'endless'; game.hardcore = false;
  const wi = currentContext.worldIdx;
  currentLevelDef = generateLevel(wi, Math.floor(Math.random()*LEVELS_PER_WORLD));
  currentLevelDef.parTime = 999999;
  game.loadLevel(currentLevelDef);
  enterPlayScreen('Endless Mode');
});

/* ------------------------------ starting a level --------------------------- */

function startLevel(wi, li, mode){
  AUDIO.click();
  currentContext = { mode, worldIdx:wi, lvlIdx:li };
  game.mode = mode;
  game.hardcore = (mode==='hardcore');
  currentLevelDef = generateLevel(wi, li);
  game.loadLevel(currentLevelDef);
  const w = WORLDS[wi];
  enterPlayScreen(li===LEVELS_PER_WORLD-1 ? `${w.name} — Boss` : `${w.name} ${li+1}`, mode);
}

function enterPlayScreen(title, mode){
  showScreen('play');
  $('#hudLevelName').textContent = title;
  $('#hudMode').textContent = mode ? mode.toUpperCase() : '';
  updateHud();
  game.running = true; game.paused = false;
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

/* ------------------------------ HUD & pause ---------------------------------- */

function updateHud(){
  $('#hudCoins').textContent = game.coinsThisRun;
  $('#hudTime').textContent = fmtTime(game.elapsed);
  const dj = SAVE.doubleJumpUnlocked;
  $('#hudDoubleJump').classList.toggle('active', dj);
  const pu = game.activePowerups;
  const ic = $('#hudPowerups'); ic.innerHTML='';
  Object.keys(pu).forEach(k=>{
    const chip = document.createElement('div');
    chip.className = 'powerup-chip pu-'+k;
    chip.textContent = k;
    ic.appendChild(chip);
  });
}
document.addEventListener('bu-hud-update', updateHud);
document.addEventListener('bu-toast', e=>showToast(e.detail));

function showToast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('#toastLayer').appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 2600);
}

let paused = false;
document.addEventListener('bu-pause-toggle', togglePause);
$('#pauseBtn').addEventListener('click', togglePause);
function togglePause(){
  if(!game.running) return;
  paused = !paused; game.paused = paused;
  $('#pauseOverlay').classList.toggle('active', paused);
}
$('#resumeBtn').addEventListener('click', togglePause);
$('#pauseQuitBtn').addEventListener('click', ()=>{ paused=false; game.paused=false; $('#pauseOverlay').classList.remove('active'); endRun(false); showScreen('worlds'); renderWorlds(); });
$('#pauseRestartBtn').addEventListener('click', ()=>{
  paused=false; game.paused=false; $('#pauseOverlay').classList.remove('active');
  game.loadLevel(currentLevelDef);
});

document.addEventListener('bu-hardcore-fail', ()=>{
  endRun(false);
  $('#failReason').textContent = 'One hit and you\'re out — Hardcore Mode.';
  showScreen('levelFail');
});

/* ------------------------------ level complete / fail ------------------------ */

document.addEventListener('bu-level-complete', ()=>{
  const key = `${currentContext.worldIdx}-${currentContext.lvlIdx}`;
  const time = game.elapsed;
  const coins = game.coinsThisRun;
  const par = currentLevelDef.parTime;
  let starCount = 1;
  if(time < par*0.6 && !game.hitTaken) starCount = 3;
  else if(time < par*0.9) starCount = 2;
  if(!game.hitTaken && starCount<3) starCount = Math.min(3, starCount+ (time<par?1:0));

  const prevStars = SAVE.stars[key]||0;
  SAVE.stars[key] = Math.max(prevStars, starCount);
  const prevBest = SAVE.bestTimes[key];
  if(!prevBest || time < prevBest) SAVE.bestTimes[key] = time;

  if(currentContext.mode !== 'endless'){
    if(!SAVE.leaderboards[key]) SAVE.leaderboards[key]=[];
    SAVE.leaderboards[key].push({ name:SAVE.playerName, time, coins, date:Date.now() });
    SAVE.leaderboards[key] = SAVE.leaderboards[key].sort((a,b)=>a.time-b.time).slice(0,10);
  }

  const xpGain = 30 + coins*2 + starCount*15;
  addXP(xpGain);
  persistSave();

  unlockAchievement('first_bounce');
  if(!game.hitTaken) unlockAchievement('untouchable');
  if(time < 25) unlockAchievement('speed_demon');
  if(currentLevelDef.isBoss) unlockAchievement('boss_slayer');

  if(currentContext.mode==='story') unlockNext(currentContext.worldIdx, currentContext.lvlIdx);

  $('#resultTitle').textContent = currentLevelDef.isBoss ? 'Boss Defeated!' : 'Level Complete!';
  $('#resultStars').textContent = '★'.repeat(starCount)+'☆'.repeat(3-starCount);
  $('#resultTime').textContent = fmtTime(time);
  $('#resultCoins').textContent = coins;
  $('#resultXp').textContent = xpGain;
  game.running = false;
  showScreen('levelComplete');
});

$('#resultNextBtn').addEventListener('click', ()=>{
  let {worldIdx, lvlIdx} = currentContext;
  let nw=worldIdx, nl=lvlIdx+1;
  if(nl>=LEVELS_PER_WORLD){ nw++; nl=0; }
  if(nw<WORLDS.length && isLevelUnlocked(nw,nl)) startLevel(nw,nl,'story');
  else { showScreen('worlds'); renderWorlds(); }
});
$('#resultMenuBtn').addEventListener('click', ()=>{ showScreen('worlds'); renderWorlds(); });
$('#resultRetryBtn').addEventListener('click', ()=> startLevel(currentContext.worldIdx, currentContext.lvlIdx, currentContext.mode));

$('#failRetryBtn').addEventListener('click', ()=> startLevel(currentContext.worldIdx, currentContext.lvlIdx, currentContext.mode));
$('#failMenuBtn').addEventListener('click', ()=>{ showScreen('worlds'); renderWorlds(); });

function endRun(){ game.running = false; }

/* ------------------------------ endless progression --------------------------- */

let endlessTimer = 0;
document.addEventListener('bu-level-complete-endless', ()=>{});

/* ------------------------------ touch controls -------------------------------- */

const stick = $('#joystick');
const stickKnob = $('#joystickKnob');
let stickActive = false, stickId = null, stickCenter = {x:0,y:0};

function stickStart(e, x, y){
  stickActive = true;
  const rect = stick.getBoundingClientRect();
  stickCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
  updateStick(x,y);
}
function updateStick(x,y){
  const sens = 0.6 + (SAVE.settings.sensitivity/100)*0.8;
  let dx = (x-stickCenter.x)*sens, dy=(y-stickCenter.y)*sens;
  const max = 42;
  const len = Math.hypot(dx,dy);
  if(len>max){ dx = dx/len*max; dy=dy/len*max; }
  stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
  game.setTouchVector(clampN(dx/max), clampN(dy/max));
}
function clampN(v){ return Math.max(-1,Math.min(1,v)); }
function stickEnd(){
  stickActive=false; stickId=null;
  stickKnob.style.transform = 'translate(0,0)';
  game.setTouchVector(0,0);
}
stick.addEventListener('touchstart', e=>{ e.preventDefault(); const t=e.changedTouches[0]; stickId=t.identifier; stickStart(e,t.clientX,t.clientY); }, {passive:false});
window.addEventListener('touchmove', e=>{
  if(!stickActive) return;
  for(const t of e.changedTouches){ if(t.identifier===stickId){ updateStick(t.clientX,t.clientY); } }
}, {passive:true});
window.addEventListener('touchend', e=>{
  for(const t of e.changedTouches){ if(t.identifier===stickId) stickEnd(); }
});
stick.addEventListener('mousedown', e=>{ stickStart(e,e.clientX,e.clientY); const mm=ev=>updateStick(ev.clientX,ev.clientY); const mu=()=>{ stickEnd(); window.removeEventListener('mousemove',mm); window.removeEventListener('mouseup',mu); }; window.addEventListener('mousemove',mm); window.addEventListener('mouseup',mu); });

const jumpBtn = $('#jumpBtn');
jumpBtn.addEventListener('touchstart', e=>{ e.preventDefault(); game.triggerJump(); }, {passive:false});
jumpBtn.addEventListener('mousedown', ()=> game.triggerJump());

/* ------------------------------ main loop -------------------------------------- */

let lastFrame = performance.now();
function loop(now){
  if(!game.running) return;
  const dt = (now-lastFrame)/1000;
  lastFrame = now;
  if(!game.paused){
    game.step(dt);
    game.updateParticles(dt);
    updateHud();
    checkEndlessProgress();
  }
  game.render();
  requestAnimationFrame(loop);
}

function checkEndlessProgress(){
  if(currentContext.mode !== 'endless') return;
  if(game.finished){
    currentContext.chain = (currentContext.chain||0)+1;
    SAVE.endlessHighScore = Math.max(SAVE.endlessHighScore, currentContext.chain);
    persistSave();
    showToast(`Chain ${currentContext.chain}!`);
    const wi = currentContext.worldIdx;
    const li = Math.min(LEVELS_PER_WORLD-1, Math.floor(Math.random()*LEVELS_PER_WORLD));
    currentLevelDef = generateLevel(wi, li);
    currentLevelDef.parTime = 999999;
    game.loadLevel(currentLevelDef);
  }
}

/* ------------------------------ static info pages ------------------------------ */

$$('[data-info]').forEach(btn=>{
  btn.addEventListener('click', ()=>{ AUDIO.click(); showScreen('info'); renderInfo(btn.dataset.info); });
});
function renderInfo(which){
  const map = {
    privacy: ['Privacy Policy', `Bounce Universe stores all game progress locally on your device using browser storage. We do not collect, transmit, or sell personal data. No account or sign-in is required to play. If online leaderboards are added in a future update, only a player-chosen name and score would be shared.`],
    disclaimer: ['Disclaimer', `Bounce Universe is a work of original interactive entertainment. It is provided "as is" without warranty of any kind. Play at a reasonable volume and take breaks during extended play sessions.`],
    about: ['About', `Bounce Universe is an original arcade platformer built with Three.js, spanning six worlds — Green Valley, Desert Storm, Ice Kingdom, Lava Core, Cyber City, and Space Station. Roll, bounce, and dash through handcrafted obstacle courses, collect energy orbs to unlock the double jump, and reach the portal before time runs out. Built by Nitai Studio.`],
    contact: ['Contact Support', `Questions, bug reports, or feedback? Reach the developer at nitai.grp00@gmail.com.`],
  };
  const [title, body] = map[which];
  $('#infoTitle').textContent = title;
  $('#infoBody').textContent = body;
}
$('#infoBack').addEventListener('click', ()=>showScreen('home'));

/* ------------------------------ init ------------------------------------------- */

refreshHomeStats();
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && game.running && !paused) togglePause();
});
