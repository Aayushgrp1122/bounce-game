/* ============================================================================
   BOUNCE UNIVERSE — core game engine
   Three.js rendering + a lightweight custom physics layer (sphere-vs-box,
   swept ground collision, moving/rotating/falling platforms, gravity zones).
   Data-driven level system: worlds + levels are described as plain objects
   and built procedurally per-world with deterministic seeds, so every level
   is reproducible and the whole set is easy to extend with more entries.
   ========================================================================== */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

/* ---------------------------- constants -------------------------------- */

const GRAVITY = -22;
const PLAYER_RADIUS = 0.5;
const MOVE_ACCEL = 34;
const MAX_SPEED = 9;
const FRICTION_GROUND = 10;
const FRICTION_AIR = 1.2;
const JUMP_VELOCITY = 9.2;
const DOUBLE_JUMP_VELOCITY = 7.6;

const WORLDS = [
  { id:'green-valley', name:'Green Valley', sky:0x8fd3f4, skyBottom:0xdff7c8, fog:0xbfe9ff, ground:0x3fae5a, accent:0x6fe08a, platform:0x4caf62, ambient:0x88c9ff, dir:0xffffff, fogDensity:0.012, decor:'hills' },
  { id:'desert-storm', name:'Desert Storm', sky:0xf6c877, skyBottom:0xffe6b0, fog:0xf0b25a, ground:0xd9a441, accent:0xffdd88, platform:0xd8a24a, ambient:0xffcf8a, dir:0xfff2d0, fogDensity:0.016, decor:'dunes' },
  { id:'ice-kingdom', name:'Ice Kingdom', sky:0xdcefff, skyBottom:0xffffff, fog:0xeaf6ff, ground:0x9fd4ec, accent:0xbdf3ff, platform:0x8fc9e8, ambient:0xcdeeff, dir:0xffffff, fogDensity:0.014, slippery:true, decor:'crystals' },
  { id:'lava-core', name:'Lava Core', sky:0x2a0a08, skyBottom:0x150404, fog:0x2a0a08, ground:0x3b1410, accent:0xff5a1f, platform:0x4a2018, ambient:0xff8a4a, dir:0xffb27a, fogDensity:0.03, decor:'volcanic' },
  { id:'cyber-city', name:'Cyber City', sky:0x0a0a1a, skyBottom:0x1a0a2a, fog:0x0a0a1a, ground:0x14142a, accent:0x00e5ff, platform:0x1c1c3a, ambient:0x8a4aff, dir:0x00e5ff, fogDensity:0.028, decor:'towers' },
  { id:'space-station', name:'Space Station', sky:0x000000, skyBottom:0x05050f, fog:0x000000, ground:0x2a2a33, accent:0xffffff, platform:0x3a3a44, ambient:0x7a8aff, dir:0xffffff, fogDensity:0.006, lowGravity:true, decor:'stars' },
];

const LEVELS_PER_WORLD = 3; // slice shipped in this build (see note in About)
const SKINS = [
  { id:'classic', name:'Classic Ball', price:0, color:0xffffff, emissive:0x111111, metalness:0.3, roughness:0.4 },
  { id:'neon', name:'Neon Ball', price:150, color:0x00ffc8, emissive:0x00a884, metalness:0.2, roughness:0.2 },
  { id:'fire', name:'Fire Ball', price:250, color:0xff5722, emissive:0xff8a00, metalness:0.1, roughness:0.3 },
  { id:'ice', name:'Ice Ball', price:250, color:0xaeefff, emissive:0x66ccff, metalness:0.6, roughness:0.05 },
  { id:'galaxy', name:'Galaxy Ball', price:400, color:0x6a3cff, emissive:0xaa66ff, metalness:0.5, roughness:0.2 },
  { id:'gold', name:'Gold Ball', price:600, color:0xffd54a, emissive:0xffb300, metalness:1.0, roughness:0.15 },
];

const ACHIEVEMENTS = [
  { id:'first_bounce', name:'First Bounce', desc:'Complete your first level', xp:20 },
  { id:'coin_collector', name:'Coin Collector', desc:'Collect 100 coins total', xp:40 },
  { id:'orb_hunter', name:'Orb Hunter', desc:'Collect 15 energy orbs', xp:40 },
  { id:'double_trouble', name:'Double Trouble', desc:'Unlock the double jump', xp:60 },
  { id:'world_hopper', name:'World Hopper', desc:'Unlock every world', xp:100 },
  { id:'untouchable', name:'Untouchable', desc:'Finish a level without getting hit', xp:50 },
  { id:'speed_demon', name:'Speed Demon', desc:'Finish any level in under 25s', xp:60 },
  { id:'boss_slayer', name:'Boss Slayer', desc:'Beat a boss level', xp:80 },
  { id:'collector', name:'Big Spender', desc:'Buy a ball skin', xp:30 },
];

const POWERUP_TYPES = ['shield','speed','magnet','doubleCoins','superJump'];
const POWERUP_COLORS = { shield:0x4ad0ff, speed:0xffe14a, magnet:0xff4ad0, doubleCoins:0xffd54a, superJump:0x4affab };
const POWERUP_DURATION = 8;

/* ------------------------------ utilities -------------------------------- */

function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;

/* ------------------------------ save system ------------------------------ */

const SAVE_KEY = 'bounceuniverse_save_v1';
function defaultSave(){
  return {
    playerName: 'Player',
    coins: 0, xp: 0, level: 1,
    orbsCollected: 0, coinsTotalCollected: 0,
    doubleJumpUnlocked: false,
    unlockedWorlds: [0],
    unlockedLevels: { 0: [0] },
    stars: {}, // "w-l": 1..3
    bestTimes: {}, // "w-l": seconds
    ownedSkins: ['classic'],
    equippedSkin: 'classic',
    achievements: [],
    settings: { graphics:'medium', sfx:70, music:50, sensitivity:60, hardcoreDefault:false },
    lastDaily: null,
    dailyStreak: 0,
    leaderboards: {}, // levelKey -> [{name,time,coins,date}]
    endlessHighScore: 0,
  };
}
let SAVE = loadSave();
function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultSave(), parsed);
  }catch(e){ return defaultSave(); }
}
function persistSave(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){ /* storage unavailable */ }
}
function xpForLevel(l){ return 100 * l * (l+1) / 2; }
function addXP(amount){
  SAVE.xp += amount;
  while(SAVE.xp >= xpForLevel(SAVE.level)){ SAVE.level++; }
  persistSave();
}
function unlockAchievement(id){
  if(SAVE.achievements.includes(id)) return false;
  SAVE.achievements.push(id);
  const a = ACHIEVEMENTS.find(x=>x.id===id);
  if(a) addXP(a.xp);
  persistSave();
  return true;
}

/* ------------------------------ audio ------------------------------------ */

class AudioSystem {
  constructor(){
    this.ctx = null;
    this.musicGain = null; this.sfxGain = null;
    this.musicNodes = [];
    this.musicOn = false;
  }
  ensure(){
    if(this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.applyVolumes();
  }
  applyVolumes(){
    if(!this.ctx) return;
    this.musicGain.gain.value = (SAVE.settings.music/100) * 0.35;
    this.sfxGain.gain.value = (SAVE.settings.sfx/100) * 0.6;
  }
  beep(freq, dur=0.12, type='sine', vol=1, glide=0){
    this.ensure();
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if(glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq+glide), t0+dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0+dur+0.02);
  }
  jump(){ this.beep(420,0.12,'triangle',0.5,260); }
  doubleJump(){ this.beep(560,0.14,'triangle',0.5,340); }
  coin(){ this.beep(880,0.08,'square',0.35,200); }
  orb(){ this.beep(660,0.18,'sine',0.4,400); }
  power(){ this.beep(300,0.25,'sawtooth',0.35,500); }
  hit(){ this.beep(120,0.25,'sawtooth',0.5,-60); }
  portal(){ this.beep(220,0.4,'sine',0.4,700); }
  click(){ this.beep(500,0.05,'square',0.25,0); }
  startMusic(){
    this.ensure();
    if(this.musicOn) return;
    this.musicOn = true;
    const notes = [220,262,294,330,392,330,294,262];
    let i = 0;
    this._musicTimer = setInterval(()=>{
      if(!this.musicOn) return;
      const t0=this.ctx.currentTime;
      const osc=this.ctx.createOscillator(); const g=this.ctx.createGain();
      osc.type='sine'; osc.frequency.value = notes[i%notes.length];
      g.gain.setValueAtTime(0.0001,t0);
      g.gain.linearRampToValueAtTime(0.5,t0+0.05);
      g.gain.exponentialRampToValueAtTime(0.001,t0+0.5);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t0); osc.stop(t0+0.55);
      i++;
    }, 420);
  }
  stopMusic(){ this.musicOn=false; if(this._musicTimer) clearInterval(this._musicTimer); }
}
const AUDIO = new AudioSystem();

/* --------------------------- level generation ----------------------------- */

function platformDef(x,y,z,w,h,d,opts={}){
  return Object.assign({ type:'static', x,y,z,w,h,d }, opts);
}

function generateLevel(worldIdx, lvlIdx){
  const world = WORLDS[worldIdx];
  const isBoss = lvlIdx === LEVELS_PER_WORLD-1;
  const rng = mulberry32(worldIdx*1000 + lvlIdx*37 + 7);
  const diff = worldIdx*LEVELS_PER_WORLD + lvlIdx; // 0..17 overall difficulty ramp

  const platforms = [];
  const coins = [];
  const orbs = [];
  const powerups = [];
  const enemies = [];
  const hazards = [];
  const checkpoints = [];
  let teleport = null;
  let gravityZones = [];

  const canMove = worldIdx >= 0 && diff >= 1;
  const canRotate = diff >= 3;
  const canFall = diff >= 5;
  const canEnemies = diff >= 3;
  const canTurret = diff >= 6;
  const canCrusher = diff >= 8;
  const canGravityZone = worldIdx >= 5;
  const canHazardTiles = worldIdx >= 3;

  // start platform
  platforms.push(platformDef(0,0,0, 6,1,6, {type:'static', start:true}));
  checkpoints.push({ x:0, y:1.2, z:0 });

  let cx=0, cy=1, cz=0;
  const chainLen = isBoss ? 10 : (10 + Math.floor(diff*0.6));
  // each level in a world reads visually different: 0=gentle straight path, 1=wide snaking path
  const layoutPattern = lvlIdx===0 ? 'straight' : 'zigzag';

  if(!isBoss){
    for(let i=0;i<chainLen;i++){
      const gap = lerp(2.2, 4.4, clamp(diff/17,0,1)) * (0.75 + rng()*0.5);
      const widthMin = lerp(3.2, 1.8, clamp(diff/17,0,1));
      const w = widthMin + rng()*1.4;
      const d = w;
      const heightVar = lerp(0.4, 2.2, clamp(diff/17,0,1));
      cz += gap + d/2 + 1;
      cy = clamp(cy + (rng()-0.45)*heightVar, 0.4, 10);
      if(layoutPattern==='zigzag'){
        const amp = lerp(3, 7, clamp(diff/17,0,1));
        cx = Math.sin(i*0.7) * amp + (rng()-0.5)*1.2;
      } else {
        const nx = cx + (rng()-0.5) * lerp(1,5,clamp(diff/17,0,1));
        cx = clamp(nx, -8, 8);
      }

      let type='static', extra={};
      const roll = rng();
      if(canFall && roll < 0.18){ type='falling'; extra={fallDelay:0.5+rng()*0.4}; }
      else if(canRotate && roll < 0.34){ type='rotating'; extra={rotSpeed:(rng()<0.5?-1:1)*(0.6+rng()*0.8)}; }
      else if(canMove && roll < 0.60){
        type='moving';
        const axis = rng()<0.5?'x':'z';
        const range = 2+rng()*2.5;
        extra = { axis, range, speed: 0.6+rng()*0.6, phase: rng()*Math.PI*2 };
      }
      platforms.push(platformDef(cx,cy,cz,w,1,d,{type, ...extra}));

      // decorate: coin arc
      if(rng() < 0.85){
        const n = 2+Math.floor(rng()*3);
        for(let k=0;k<n;k++) coins.push({ x:cx-0.6+ (k*0.6), y:cy+1.3+Math.sin(k)*0.15, z:cz });
      }
      if(i % 4 === 3) orbs.push({ x:cx, y:cy+1.6, z:cz });
      if(i % 6 === 5) powerups.push({ type: POWERUP_TYPES[Math.floor(rng()*POWERUP_TYPES.length)], x:cx, y:cy+1.4, z:cz });
      if(i % 5 === 4) checkpoints.push({ x:cx, y:cy+1.2, z:cz });

      if(canEnemies && rng() < 0.28 && type==='static'){
        enemies.push({ type:'roller', x:cx, y:cy+1, z:cz, range: w*0.6, axis: rng()<0.5?'x':'z', speed:1.4+rng()*1.2 });
      }
      if(canTurret && rng() < 0.22){
        enemies.push({ type:'turret', x:cx+(rng()-0.5)*1.5, y:cy+1.5, z:cz, dir: rng()<0.5?'x':'z', onTime:1.1, offTime:1.3, phase: rng()*2 });
      }
      if(canCrusher && rng() < 0.18){
        enemies.push({ type:'crusher', x:cx, y:cy+3.5, z:cz, dropHeight:2.6, period:2.2, phase: rng()*2 });
      }
      if(canHazardTiles && rng() < 0.16 && type==='static'){
        hazards.push({ x:cx, y:cy+0.55, z:cz, w:w*0.6, h:0.4, d:d*0.6 });
      }
      if(canGravityZone && rng() < 0.12){
        gravityZones.push({ x:cx, y:cy+2, z:cz, w:w+2, h:4, d:d+2 });
      }
    }
    // portal at the end
    platforms.push(platformDef(cx, cy, cz+5, 6,1,6, {type:'static', end:true}));
    checkpoints.push({ x:cx, y:cy+1.2, z:cz+5 });
    var portalPos = { x:cx, y:cy+1.6, z:cz+5 };
  } else {
    // BOSS ARENA — circular ring of platforms around a central hazard, portal in the middle raised up.
    const ringR = 9;
    const count = 10;
    for(let i=0;i<count;i++){
      const a = (i/count)*Math.PI*2;
      const x = Math.cos(a)*ringR, z = Math.sin(a)*ringR;
      const y = 1 + Math.sin(a*2)*0.6;
      const type = (i%3===0 && canRotate) ? 'rotating' : (i%4===1 && canMove ? 'moving' : 'static');
      const extra = type==='rotating' ? { rotSpeed:(i%2?1:-1)*0.8 }
        : type==='moving' ? { axis:'y', range:1.6, speed:0.8, phase:i } : {};
      platforms.push(platformDef(x,y,z,3.6,1,3.6,{type,...extra}));
      if(i%2===0) coins.push({x,y:y+1.3,z});
      if(i%3===0) orbs.push({x,y:y+1.6,z});
      if(i===2) powerups.push({type:'shield', x,y:y+1.4,z});
      if(i===6) powerups.push({type:'superJump', x,y:y+1.4,z});
      if(i%2===1) enemies.push({ type:'roller', x, y:y+1, z, range:1.6, axis: (i%4<2?'x':'z'), speed:1.8 });
      checkpoints.push({x,y:y+1.2,z});
    }
    // orbiting turret hazards near center
    enemies.push({ type:'turret', x:0, y:2, z:0, dir:'x', onTime:1.4, offTime:1.0, phase:0, spin:true });
    // central raised finish platform
    platforms.push(platformDef(0, 5, 0, 4,1,4, {type:'static', end:true}));
    cx=0; cy=5; cz=0;
    var portalPos = { x:0, y:6.6, z:0 };
    checkpoints.push({ x:0, y:6.2, z:0 });
  }

  return {
    id: `${worldIdx}-${lvlIdx}`,
    worldIdx, lvlIdx, isBoss,
    name: isBoss ? `${world.name} — Boss Arena` : `${world.name} ${lvlIdx+1}`,
    world,
    platforms, coins, orbs, powerups, enemies, hazards, checkpoints,
    teleport, gravityZones,
    portal: portalPos,
    parTime: isBoss ? 90 : (35 + diff*4),
  };
}

/* ------------------------------ game class -------------------------------- */

class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, this.pixelRatioForQuality()));
    this.renderer.shadowMap.enabled = SAVE.settings.graphics !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
    this.camOffset = new THREE.Vector3(0, 6.5, 9.5);
    this.camTarget = new THREE.Vector3();
    this.clock = new THREE.Clock();

    this.input = { x:0, z:0, jumpPressed:false, jumpHeld:false };
    this.keys = {};
    this.running = false;
    this.paused = false;
    this.mode = 'story'; // story | endless | time | hardcore
    this.hardcore = false;

    this._initLights();
    this._initGround();
    this.skyDome = this._buildSkyDome(0x8fd3f4, 0xdff7c8);
    this.scene.add(this.skyDome);
    this.decorGroup = new THREE.Group();
    this.scene.add(this.decorGroup);
    this.playerMesh = this._buildPlayerMesh();
    this.scene.add(this.playerMesh);

    this.resetPlayerState();
    this._bindKeyboard();

    this.dynamicMeshes = []; // {mesh, def}
    this.coinMeshes = []; this.orbMeshes = []; this.powerupMeshes = []; this.enemyMeshes = []; this.hazardMeshes = [];
    this.particles = [];

    this.activePowerups = {}; // type -> remaining seconds
    this.hitTaken = false;
    this.elapsed = 0;
    this.coinsThisRun = 0;

    window.addEventListener('resize', ()=>this.onResize());
    this.onResize();
  }

  pixelRatioForQuality(){
    const q = SAVE.settings.graphics;
    return q==='low' ? 1 : q==='medium' ? 1.4 : 2;
  }

  _initLights(){
    this.ambient = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(8,14,6);
    this.sun.castShadow = SAVE.settings.graphics !== 'low';
    this.sun.shadow.mapSize.set(1024,1024);
    this.sun.shadow.camera.left=-20; this.sun.shadow.camera.right=20;
    this.sun.shadow.camera.top=20; this.sun.shadow.camera.bottom=-20;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  _initGround(){
    const geo = new THREE.PlaneGeometry(400,400);
    const mat = new THREE.MeshStandardMaterial({ color:0x223344, roughness:0.95 });
    this.groundVoid = new THREE.Mesh(geo, mat);
    this.groundVoid.rotation.x = -Math.PI/2;
    this.groundVoid.position.y = -30;
    this.groundVoid.receiveShadow = true;
    this.scene.add(this.groundVoid);
  }

  _buildSkyDome(topHex, bottomHex){
    const geo = new THREE.SphereGeometry(140, 24, 16);
    const pos = geo.attributes.position;
    const top = new THREE.Color(topHex), bottom = new THREE.Color(bottomHex);
    const colors = new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      const y = pos.getY(i);
      const t = clamp((y+140)/280, 0, 1);
      const c = new THREE.Color().lerpColors(bottom, top, t);
      colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -10;
    return mesh;
  }

  _setSkyColors(topHex, bottomHex){
    const geo = this.skyDome.geometry;
    const pos = geo.attributes.position;
    const colorAttr = geo.attributes.color;
    const top = new THREE.Color(topHex), bottom = new THREE.Color(bottomHex);
    for(let i=0;i<pos.count;i++){
      const y = pos.getY(i);
      const t = clamp((y+140)/280, 0, 1);
      const c = new THREE.Color().lerpColors(bottom, top, t);
      colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    colorAttr.needsUpdate = true;
  }

  _clearDecor(){
    for(const child of [...this.decorGroup.children]){
      child.geometry && child.geometry.dispose && child.geometry.dispose();
      child.material && child.material.dispose && child.material.dispose();
      this.decorGroup.remove(child);
    }
  }

  _buildDecor(worldIdx){
    this._clearDecor();
    const w = WORLDS[worldIdx];
    const rng = mulberry32(worldIdx*777+3);
    const g = this.decorGroup;
    const flat = { flatShading:true };

    if(w.decor==='hills'){
      for(let i=0;i<16;i++){
        const a = rng()*Math.PI*2, r = 40+rng()*55;
        const h = 6+rng()*14;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(6+rng()*6, h, 6), new THREE.MeshStandardMaterial({ color:new THREE.Color(w.accent).lerp(new THREE.Color(w.ground),rng()).getHex(), ...flat }));
        cone.position.set(Math.cos(a)*r, h/2-4, Math.sin(a)*r);
        g.add(cone);
      }
      for(let i=0;i<10;i++){
        const cloud = new THREE.Mesh(new THREE.SphereGeometry(3+rng()*3,7,6), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85 }));
        cloud.position.set((rng()-0.5)*140, 26+rng()*14, (rng()-0.5)*140);
        g.add(cloud);
      }
    } else if(w.decor==='dunes'){
      for(let i=0;i<18;i++){
        const a = rng()*Math.PI*2, r = 35+rng()*60;
        const h = 4+rng()*8;
        const dune = new THREE.Mesh(new THREE.SphereGeometry(8+rng()*7,8,6,0,Math.PI*2,0,Math.PI/2), new THREE.MeshStandardMaterial({ color:new THREE.Color(w.platform).lerp(new THREE.Color(0xffe6b0),rng()*0.5).getHex(), ...flat }));
        dune.position.set(Math.cos(a)*r, -4, Math.sin(a)*r);
        dune.scale.y = h/8;
        g.add(dune);
      }
      const sun = new THREE.Mesh(new THREE.SphereGeometry(9,16,16), new THREE.MeshBasicMaterial({ color:0xfff3c0 }));
      sun.position.set(-60,45,-90);
      g.add(sun);
    } else if(w.decor==='crystals'){
      for(let i=0;i<20;i++){
        const a = rng()*Math.PI*2, r = 30+rng()*55;
        const cryst = new THREE.Mesh(new THREE.OctahedronGeometry(2+rng()*3,0), new THREE.MeshStandardMaterial({ color:0xaeefff, emissive:0x3fa8e0, emissiveIntensity:0.6, metalness:0.6, roughness:0.1, ...flat }));
        cryst.position.set(Math.cos(a)*r, -2+rng()*20, Math.sin(a)*r);
        cryst.rotation.set(rng()*Math.PI,rng()*Math.PI,0);
        g.add(cryst);
      }
    } else if(w.decor==='volcanic'){
      for(let i=0;i<16;i++){
        const a = rng()*Math.PI*2, r = 32+rng()*50;
        const h = 8+rng()*16;
        const rock = new THREE.Mesh(new THREE.ConeGeometry(5+rng()*5,h,5), new THREE.MeshStandardMaterial({ color:0x2a1410, emissive:0xff4400, emissiveIntensity:0.15+rng()*0.25, ...flat }));
        rock.position.set(Math.cos(a)*r, h/2-4, Math.sin(a)*r);
        g.add(rock);
      }
      for(let i=0;i<24;i++){
        const ember = new THREE.Mesh(new THREE.SphereGeometry(0.25+rng()*0.25,6,6), new THREE.MeshBasicMaterial({ color:0xff7a2a }));
        ember.position.set((rng()-0.5)*90,rng()*30-2,(rng()-0.5)*90);
        ember.userData.driftSpeed = 0.6+rng()*0.8;
        ember.userData.baseY = ember.position.y;
        g.add(ember);
      }
    } else if(w.decor==='towers'){
      const grid = new THREE.Mesh(new THREE.PlaneGeometry(300,300,1,1), new THREE.MeshBasicMaterial({ color:0x120a2a }));
      grid.rotation.x=-Math.PI/2; grid.position.y=-15; g.add(grid);
      for(let i=0;i<18;i++){
        const a = rng()*Math.PI*2, r = 26+rng()*60;
        const h = 14+rng()*40;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(4+rng()*4,h,4+rng()*4), new THREE.MeshStandardMaterial({ color:0x151530, emissive: (i%2? 0x00e5ff:0xaa4aff), emissiveIntensity:0.35, ...flat }));
        tower.position.set(Math.cos(a)*r, h/2-15, Math.sin(a)*r);
        g.add(tower);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tower.geometry), new THREE.LineBasicMaterial({ color: i%2? 0x00e5ff:0xaa4aff }));
        tower.add(edges);
      }
    } else if(w.decor==='stars'){
      const count = 900;
      const positions = new Float32Array(count*3);
      for(let i=0;i<count;i++){
        const r = 60+rng()*75;
        const theta = rng()*Math.PI*2, phi = Math.acos(2*rng()-1);
        positions[i*3] = r*Math.sin(phi)*Math.cos(theta);
        positions[i*3+1] = Math.abs(r*Math.cos(phi))*0.6;
        positions[i*3+2] = r*Math.sin(phi)*Math.sin(theta);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
      const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color:0xffffff, size:0.6, sizeAttenuation:true }));
      g.add(stars);
      for(let i=0;i<6;i++){
        const a = rng()*Math.PI*2, r = 45+rng()*40;
        const planet = new THREE.Mesh(new THREE.SphereGeometry(2+rng()*4,14,10), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rng(),0.5,0.5).getHex(), emissiveIntensity:0.2, ...flat }));
        planet.position.set(Math.cos(a)*r, (rng()-0.3)*30, Math.sin(a)*r);
        g.add(planet);
      }
    }
  }

  _buildPlayerMesh(){
    const geo = new THREE.SphereGeometry(PLAYER_RADIUS, 24, 18);
    const skin = SKINS.find(s=>s.id===SAVE.equippedSkin) || SKINS[0];
    const mat = new THREE.MeshStandardMaterial({ color:skin.color, emissive:skin.emissive, emissiveIntensity:0.5, metalness:skin.metalness, roughness:skin.roughness });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    const glow = new THREE.PointLight(skin.emissive, 0.6, 6);
    mesh.add(glow);
    return mesh;
  }

  refreshSkin(){
    const skin = SKINS.find(s=>s.id===SAVE.equippedSkin) || SKINS[0];
    this.playerMesh.material.color.setHex(skin.color);
    this.playerMesh.material.emissive.setHex(skin.emissive);
    this.playerMesh.material.metalness = skin.metalness;
    this.playerMesh.material.roughness = skin.roughness;
  }

  resetPlayerState(){
    this.pos = new THREE.Vector3(0,2,0);
    this.vel = new THREE.Vector3(0,0,0);
    this.onGround = false;
    this.jumpsUsed = 0;
    this.standingOn = null;
    this.gravityDir = 1;
    this.checkpoint = new THREE.Vector3(0,1.2,0);
  }

  onResize(){
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w,h,false);
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
  }

  _bindKeyboard(){
    window.addEventListener('keydown', e=>{
      this.keys[e.code] = true;
      if(e.code==='Space' || e.code==='ArrowUp' || e.code==='KeyW'){ if(e.code==='Space') this.input.jumpPressed = true; }
      if(e.code==='KeyP' || e.code==='Escape'){ document.dispatchEvent(new CustomEvent('bu-pause-toggle')); }
    });
    window.addEventListener('keyup', e=>{ this.keys[e.code] = false; });
  }

  pollKeyboard(){
    let x=0, z=0;
    if(this.keys['KeyA']||this.keys['ArrowLeft']) x -= 1;
    if(this.keys['KeyD']||this.keys['ArrowRight']) x += 1;
    if(this.keys['KeyW']||this.keys['ArrowUp']) z -= 1;
    if(this.keys['KeyS']||this.keys['ArrowDown']) z += 1;
    if(this.keys['Space']) this.input.jumpHeld = true; else this.input.jumpHeld = false;
    if(x||z){ this.input.x = x; this.input.z = z; }
    else if(!this._touchActive){ this.input.x = 0; this.input.z = 0; }
  }

  setTouchVector(x,z){ this._touchActive = (x!==0||z!==0); this.input.x = x; this.input.z = z; }
  triggerJump(){ this.input.jumpPressed = true; }

  /* --------------------------- level loading ---------------------------- */

  loadLevel(level){
    this.clearLevel();
    this.level = level;
    const w = level.world;
    this.scene.background = new THREE.Color(w.sky);
    this.scene.fog = new THREE.FogExp2(w.fog, w.fogDensity);
    this.sun.color.setHex(w.dir);
    this.ambient.color.setHex(w.ambient);
    this.groundVoid.material.color.setHex(new THREE.Color(w.sky).multiplyScalar(0.3).getHex());
    this._setSkyColors(w.sky, w.skyBottom);
    if(this._lastDecorWorld !== level.worldIdx){ this._buildDecor(level.worldIdx); this._lastDecorWorld = level.worldIdx; }

    for(const p of level.platforms) this._spawnPlatform(p);
    for(const c of level.coins) this._spawnCoin(c);
    for(const o of level.orbs) this._spawnOrb(o);
    for(const pu of level.powerups) this._spawnPowerup(pu);
    for(const e of level.enemies) this._spawnEnemy(e);
    for(const h of level.hazards) this._spawnHazard(h);
    this._spawnPortal(level.portal);

    this.resetPlayerState();
    const start = level.platforms.find(p=>p.start) || level.platforms[0];
    this.pos.set(start.x, start.y + start.h/2 + PLAYER_RADIUS + 0.05, start.z);
    this.checkpoint.copy(this.pos);
    this.playerMesh.position.copy(this.pos);

    this.elapsed = 0;
    this.coinsThisRun = 0;
    this.hitTaken = false;
    this.activePowerups = {};
    this.finished = false;
  }

  clearLevel(){
    for(const arr of [this.dynamicMeshes,this.coinMeshes,this.orbMeshes,this.powerupMeshes,this.enemyMeshes,this.hazardMeshes]){
      for(const item of arr){ this.scene.remove(item.mesh); }
      arr.length = 0;
    }
    if(this.portalMesh){ this.scene.remove(this.portalMesh); this.portalMesh=null; }
  }

  _platMat(color, opts={}){
    return new THREE.MeshStandardMaterial({ color, roughness:0.6, metalness:0.15, ...opts });
  }

  _spawnPlatform(def){
    const w = this.level.world;
    let color = w.platform;
    if(def.type==='moving') color = new THREE.Color(w.platform).lerp(new THREE.Color(0xffffff),0.15).getHex();
    if(def.type==='rotating') color = new THREE.Color(w.accent).lerp(new THREE.Color(w.platform),0.4).getHex();
    if(def.type==='falling') color = new THREE.Color(0xff6a4a).lerp(new THREE.Color(w.platform),0.3).getHex();
    if(def.start) color = 0x66e07a;
    if(def.end) color = 0xffd54a;
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const neonWorld = w.decor==='towers' || w.decor==='stars' || w.decor==='volcanic';
    const mat = this._platMat(color, {
      emissive: def.end?0x664400: (neonWorld?w.accent:0x000000),
      emissiveIntensity: def.end?0.4:(neonWorld?0.25:0.4),
      metalness: w.decor==='crystals'?0.55:0.15,
      roughness: w.decor==='crystals'?0.1:0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(def.x, def.y, def.z);
    mesh.receiveShadow = true; mesh.castShadow = false;
    if(neonWorld && !def.start){
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color:w.accent }));
      mesh.add(edges);
    }
    this.scene.add(mesh);
    const state = { basePos: mesh.position.clone(), t: (def.phase||0), fallen:false, fallTimer:0, standing:false, prevPos: mesh.position.clone() };
    this.dynamicMeshes.push({ mesh, def, state });
  }

  _spawnCoin(c){
    const geo = new THREE.CylinderGeometry(0.32,0.32,0.1,14);
    const mat = new THREE.MeshStandardMaterial({ color:0xffd54a, emissive:0xffb300, emissiveIntensity:0.7, metalness:0.8, roughness:0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI/2;
    mesh.position.set(c.x,c.y,c.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.coinMeshes.push({ mesh, def:c, taken:false });
  }

  _spawnOrb(o){
    const geo = new THREE.IcosahedronGeometry(0.36,1);
    const mat = new THREE.MeshStandardMaterial({ color:0x66ffe0, emissive:0x22ffcc, emissiveIntensity:1.0, metalness:0.3, roughness:0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(o.x,o.y,o.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.orbMeshes.push({ mesh, def:o, taken:false });
  }

  _spawnPowerup(p){
    const color = POWERUP_COLORS[p.type];
    const geo = new THREE.OctahedronGeometry(0.42,0);
    const mat = new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:0.9, metalness:0.4, roughness:0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x,p.y,p.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.powerupMeshes.push({ mesh, def:p, taken:false });
  }

  _spawnEnemy(e){
    let mesh;
    if(e.type==='roller'){
      const geo = new THREE.SphereGeometry(0.55,16,12);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:0xff3b3b, emissive:0x330000, roughness:0.5 }));
    } else if(e.type==='turret'){
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,0.5,12), new THREE.MeshStandardMaterial({ color:0x555566 }));
      group.add(base);
      const beamGeo = new THREE.BoxGeometry(e.dir==='x'?12:0.15, 0.15, e.dir==='x'?0.15:12);
      const beamMat = new THREE.MeshStandardMaterial({ color:0xff2a2a, emissive:0xff2a2a, emissiveIntensity:2, transparent:true, opacity:0.85 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 0.3;
      beam.userData.isBeam = true;
      group.add(beam);
      mesh = group;
    } else if(e.type==='crusher'){
      const geo = new THREE.BoxGeometry(1.6,1.2,1.6);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:0x888899, metalness:0.6, roughness:0.3 }));
      mesh.castShadow = true;
    } else {
      const geo = new THREE.ConeGeometry(0.4,0.6,8);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:0x9a4aff, emissive:0x4a0088 }));
    }
    mesh.position.set(e.x,e.y,e.z);
    mesh.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
    this.scene.add(mesh);
    this.enemyMeshes.push({ mesh, def:e, t: e.phase||0 });
  }

  _spawnHazard(h){
    const geo = new THREE.BoxGeometry(h.w,h.h,h.d);
    const mat = new THREE.MeshStandardMaterial({ color:0xff3300, emissive:0xff2200, emissiveIntensity:0.8, roughness:0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(h.x,h.y,h.z);
    this.scene.add(mesh);
    this.hazardMeshes.push({ mesh, def:h });
  }

  _spawnPortal(p){
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1,0.16,12,28), new THREE.MeshStandardMaterial({ color:0x66e0ff, emissive:0x00c8ff, emissiveIntensity:1.4 }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0,24), new THREE.MeshBasicMaterial({ color:0x00e0ff, transparent:true, opacity:0.35, side:THREE.DoubleSide }));
    group.add(ring); group.add(disc);
    group.position.set(p.x,p.y,p.z);
    const light = new THREE.PointLight(0x00e0ff, 1.2, 8);
    group.add(light);
    this.scene.add(group);
    this.portalMesh = group;
  }

  /* --------------------------- physics step ------------------------------ */

  step(dt){
    dt = Math.min(dt, 1/30);
    this.pollKeyboard();
    this.elapsed += dt;

    // update powerup timers
    for(const k of Object.keys(this.activePowerups)){
      this.activePowerups[k] -= dt;
      if(this.activePowerups[k] <= 0) delete this.activePowerups[k];
    }

    this._updateDynamics(dt);
    this._updateEnemies(dt);
    this._integratePlayer(dt);
    this._collide(dt);
    this._checkPickups();
    this._checkHazardsAndEnemies();
    this._checkPortal();
    this._updateCamera(dt);
    this._animateCollectibles(dt);
    this._animateDecor(dt);

    this.playerMesh.position.copy(this.pos);
    const speed = Math.hypot(this.vel.x,this.vel.z);
    if(speed > 0.05){
      const axis = new THREE.Vector3(-this.vel.z,0,this.vel.x).normalize();
      this.playerMesh.rotateOnWorldAxis(axis, speed*dt/PLAYER_RADIUS);
    }

    if(this.input.jumpPressed) this.input.jumpPressed = false;
  }

  _updateDynamics(dt){
    for(const item of this.dynamicMeshes){
      const { mesh, def, state } = item;
      state.prevPos.copy(mesh.position);
      if(def.type==='moving'){
        state.t += dt*def.speed;
        const off = Math.sin(state.t + (def.phase||0)) * def.range;
        const base = state.basePos;
        if(def.axis==='x') mesh.position.set(base.x+off, base.y, base.z);
        else if(def.axis==='y') mesh.position.set(base.x, base.y+off, base.z);
        else mesh.position.set(base.x, base.y, base.z+off);
      } else if(def.type==='rotating'){
        mesh.rotation.y += dt*def.rotSpeed;
      } else if(def.type==='falling'){
        if(state.standing && !state.fallen){
          state.fallTimer += dt;
          const s = 1 - Math.min(1,state.fallTimer/0.15);
          mesh.scale.set(1, s*0.9+0.1, 1);
          if(state.fallTimer > (def.fallDelay||0.6)){
            state.fallen = true; state.fallTimer = 0;
            mesh.visible = false;
          }
        } else if(state.fallen){
          state.fallTimer += dt;
          if(state.fallTimer > 3.0){
            state.fallen = false; mesh.visible = true; mesh.scale.set(1,1,1);
            mesh.position.copy(state.basePos);
          }
        }
      }
      state.standing = false; // reset each frame; set true in collide if player lands
    }
  }

  _updateEnemies(dt){
    for(const item of this.enemyMeshes){
      const { mesh, def } = item;
      item.t += dt;
      if(def.type==='roller'){
        const off = Math.sin(item.t*def.speed) * def.range;
        if(def.axis==='x') mesh.position.x = def.x+off; else mesh.position.z = def.z+off;
        mesh.rotation.x += dt*3;
      } else if(def.type==='turret'){
        const cycle = def.onTime+def.offTime;
        const ph = (item.t+ (def.phase||0)) % cycle;
        const on = ph < def.onTime;
        const beam = mesh.children.find(c=>c.userData.isBeam);
        if(beam) beam.visible = on;
        item.beamOn = on;
        if(def.spin) mesh.rotation.y += dt*1.4;
      } else if(def.type==='crusher'){
        const y = def.y - (Math.max(0, Math.sin((item.t+ (def.phase||0))*Math.PI/def.period)) ) * def.dropHeight;
        mesh.position.y = y;
      } else if(def.type==='drone'){
        mesh.position.x = def.x + Math.cos(item.t)*2;
        mesh.position.z = def.z + Math.sin(item.t)*2;
        mesh.position.y = def.y + Math.sin(item.t*2)*0.4;
      }
    }
  }

  _integratePlayer(dt){
    const p = this.input;
    const grounded = this.onGround;
    const accel = MOVE_ACCEL * (this.activePowerups.speed? 1.6:1) * (grounded?1:0.5);
    this.vel.x += p.x*accel*dt;
    this.vel.z += p.z*accel*dt;

    const friction = grounded ? (this.level.world.slippery?2.2:FRICTION_GROUND) : FRICTION_AIR;
    const fx = Math.sign(this.vel.x)*Math.min(Math.abs(this.vel.x), friction*dt);
    const fz = Math.sign(this.vel.z)*Math.min(Math.abs(this.vel.z), friction*dt);
    if(!p.x) this.vel.x -= fx;
    if(!p.z) this.vel.z -= fz;

    const maxSpd = MAX_SPEED * (this.activePowerups.speed?1.5:1);
    const horiz = Math.hypot(this.vel.x,this.vel.z);
    if(horiz > maxSpd){ this.vel.x *= maxSpd/horiz; this.vel.z *= maxSpd/horiz; }

    const g = (this.level.world.lowGravity ? GRAVITY*0.45 : GRAVITY) * this.gravityDir;
    this.vel.y += g*dt;

    if(p.jumpPressed){
      const jumpMul = this.activePowerups.superJump ? 1.5 : 1;
      if(this.onGround){
        this.vel.y = JUMP_VELOCITY*jumpMul*Math.sign(this.gravityDir||1);
        this.onGround = false; this.jumpsUsed = 1;
        AUDIO.jump();
      } else if(SAVE.doubleJumpUnlocked && this.jumpsUsed < 2){
        this.vel.y = DOUBLE_JUMP_VELOCITY*jumpMul*Math.sign(this.gravityDir||1);
        this.jumpsUsed = 2;
        AUDIO.doubleJump();
        this._spawnJumpParticles();
      }
    }

    this.pos.x += this.vel.x*dt;
    this.pos.y += this.vel.y*dt;
    this.pos.z += this.vel.z*dt;

    // carry along standing platform delta
    if(this.standingOn){
      const item = this.standingOn;
      const delta = new THREE.Vector3().subVectors(item.mesh.position, item.state.prevPos);
      this.pos.add(delta);
    }
  }

  _collide(dt){
    this.onGround = false;
    let landedOn = null;
    for(const item of this.dynamicMeshes){
      const { mesh, def, state } = item;
      if(def.type==='falling' && state.fallen) continue;
      const half = new THREE.Vector3(def.w/2, def.h/2, def.d/2);
      const c = mesh.position;
      const localX = this.pos.x - c.x, localZ = this.pos.z - c.z;
      let lx = localX, lz = localZ;
      if(def.type==='rotating'){
        const ang = -mesh.rotation.y;
        lx = localX*Math.cos(ang) - localZ*Math.sin(ang);
        lz = localX*Math.sin(ang) + localZ*Math.cos(ang);
      }
      const closestX = clamp(lx, -half.x, half.x);
      const closestZ = clamp(lz, -half.z, half.z);
      const topY = c.y + half.y;
      const withinXZ = Math.abs(lx-closestX) < PLAYER_RADIUS*0.98 && Math.abs(lz-closestZ) < PLAYER_RADIUS*0.98;

      if(withinXZ){
        const fallingOnto = this.pos.y + PLAYER_RADIUS >= topY - 0.35 && this.pos.y - PLAYER_RADIUS <= topY + 0.5 && this.vel.y*this.gravityDir <= 0.05;
        if(fallingOnto && this.gravityDir>0){
          this.pos.y = topY + PLAYER_RADIUS;
          this.vel.y = 0; this.onGround = true; this.jumpsUsed = 0; landedOn = item; state.standing = true;
        } else if(this.gravityDir<0){
          const botY = c.y - half.y;
          const risingInto = this.pos.y - PLAYER_RADIUS <= botY + 0.35 && this.vel.y >= -0.05;
          if(risingInto){ this.pos.y = botY - PLAYER_RADIUS; this.vel.y = 0; this.onGround = true; this.jumpsUsed=0; landedOn=item; state.standing=true; }
        } else {
          // side collision push-out
          const dx = lx-closestX, dz = lz-closestZ;
          const dist = Math.hypot(dx,dz);
          if(dist>0.0001 && dist < PLAYER_RADIUS){
            const push = (PLAYER_RADIUS-dist);
            let nx=dx/dist, nz=dz/dist;
            if(def.type==='rotating'){
              const ang = mesh.rotation.y;
              const wx = nx*Math.cos(ang) - nz*Math.sin(ang);
              const wz = nx*Math.sin(ang) + nz*Math.cos(ang);
              nx=wx; nz=wz;
            }
            this.pos.x += nx*push; this.pos.z += nz*push;
          }
        }
      }
    }
    this.standingOn = landedOn;
    if(this.pos.y < -20){ this._respawn(); }
  }

  _respawn(playHit=true){
    this.pos.copy(this.checkpoint);
    this.vel.set(0,0,0);
    if(playHit){ AUDIO.hit(); this.hitTaken = true; }
    if(this.hardcore && playHit){
      document.dispatchEvent(new CustomEvent('bu-hardcore-fail'));
    }
  }

  _checkPickups(){
    for(const c of this.coinMeshes){
      if(c.taken) continue;
      if(this.pos.distanceTo(c.mesh.position) < PLAYER_RADIUS+0.5){
        c.taken = true; c.mesh.visible = false;
        const mult = this.activePowerups.doubleCoins ? 2 : 1;
        this.coinsThisRun += 1*mult;
        SAVE.coins += 1*mult; SAVE.coinsTotalCollected += 1*mult;
        AUDIO.coin();
        document.dispatchEvent(new CustomEvent('bu-hud-update'));
      } else if(this.activePowerups.magnet && this.pos.distanceTo(c.mesh.position) < 5){
        c.mesh.position.lerp(this.pos, 0.12);
      }
    }
    for(const o of this.orbMeshes){
      if(o.taken) continue;
      if(this.pos.distanceTo(o.mesh.position) < PLAYER_RADIUS+0.55){
        o.taken = true; o.mesh.visible = false;
        SAVE.orbsCollected += 1;
        AUDIO.orb();
        if(SAVE.orbsCollected >= 15 && !SAVE.doubleJumpUnlocked){
          SAVE.doubleJumpUnlocked = true;
          unlockAchievement('double_trouble');
          document.dispatchEvent(new CustomEvent('bu-toast', { detail:'Double Jump Unlocked!' }));
        }
        if(SAVE.orbsCollected >= 15) unlockAchievement('orb_hunter');
        persistSave();
        document.dispatchEvent(new CustomEvent('bu-hud-update'));
      }
    }
    for(const pu of this.powerupMeshes){
      if(pu.taken) continue;
      if(this.pos.distanceTo(pu.mesh.position) < PLAYER_RADIUS+0.6){
        pu.taken = true; pu.mesh.visible = false;
        this.activePowerups[pu.def.type] = POWERUP_DURATION;
        AUDIO.power();
        document.dispatchEvent(new CustomEvent('bu-hud-update'));
      }
    }
    if(SAVE.coinsTotalCollected >= 100) unlockAchievement('coin_collector');
  }

  _checkHazardsAndEnemies(){
    if(this.activePowerups.shield) return;
    for(const h of this.hazardMeshes){
      if(this.pos.distanceTo(h.mesh.position) < PLAYER_RADIUS+0.6){ this._respawn(); return; }
    }
    for(const item of this.enemyMeshes){
      const { mesh, def } = item;
      if(def.type==='turret'){
        if(!item.beamOn) continue;
        const dy = Math.abs(this.pos.y-mesh.position.y-0.3);
        const inLine = def.dir==='x' ? Math.abs(this.pos.z-mesh.position.z) < 0.5 : Math.abs(this.pos.x-mesh.position.x) < 0.5;
        if(inLine && dy < 0.6){ this._respawn(); return; }
      } else {
        const r = def.type==='crusher' ? 1.2 : 0.85;
        if(this.pos.distanceTo(mesh.position) < PLAYER_RADIUS+r){ this._respawn(); return; }
      }
    }
  }

  _checkPortal(){
    if(this.finished || !this.portalMesh) return;
    if(this.pos.distanceTo(this.portalMesh.position) < 1.3){
      this.finished = true;
      AUDIO.portal();
      document.dispatchEvent(new CustomEvent('bu-level-complete'));
    }
  }

  _updateCamera(dt){
    const target = new THREE.Vector3().copy(this.pos).add(this.camOffset);
    this.camTarget.lerp(target, 1-Math.pow(0.001, dt));
    this.camera.position.copy(this.camTarget);
    const look = new THREE.Vector3().copy(this.pos).add(new THREE.Vector3(0,0.6,0));
    this.camera.lookAt(look);
    this.sun.target.position.copy(this.pos);
    this.sun.position.copy(this.pos).add(new THREE.Vector3(8,14,6));
  }

  _animateCollectibles(dt){
    const t = this.elapsed;
    for(const c of this.coinMeshes) if(!c.taken) c.mesh.rotation.z = t*2;
    for(const o of this.orbMeshes) if(!o.taken){ o.mesh.rotation.y = t*1.5; o.mesh.position.y = o.def.y+Math.sin(t*2+o.def.x)*0.12; }
    for(const pu of this.powerupMeshes) if(!pu.taken){ pu.mesh.rotation.y = t*2.2; pu.mesh.rotation.x = t*1.3; }
    if(this.portalMesh) this.portalMesh.rotation.y = t*0.6;
  }

  _animateDecor(dt){
    // distant backdrop follows the player horizontally only, like a skybox, so it never gets "left behind"
    this.decorGroup.position.set(this.pos.x, 0, this.pos.z);
    this.skyDome.position.set(this.pos.x, 0, this.pos.z);
    for(const child of this.decorGroup.children){
      if(child.userData.driftSpeed){
        const rise = (this.elapsed*child.userData.driftSpeed*2) % 26;
        child.position.y = child.userData.baseY + rise + Math.sin(this.elapsed*2+child.position.x)*0.6;
      } else if(child.geometry && child.geometry.type==='OctahedronGeometry'){
        child.rotation.y += dt*0.4;
      }
    }
  }

  _spawnJumpParticles(){
    // lightweight burst — small quick fading spheres, capped count for perf
    for(let i=0;i<6;i++){
      const geo = new THREE.SphereGeometry(0.08,6,6);
      const mat = new THREE.MeshBasicMaterial({ color:0x66ffe0, transparent:true, opacity:0.8 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(this.pos);
      const v = new THREE.Vector3((Math.random()-0.5)*3, Math.random()*2, (Math.random()-0.5)*3);
      this.scene.add(m);
      this.particles.push({ mesh:m, vel:v, life:0.5 });
    }
  }

  updateParticles(dt){
    for(let i=this.particles.length-1;i>=0;i--){
      const p = this.particles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = Math.max(0,p.life/0.5);
      if(p.life<=0){ this.scene.remove(p.mesh); this.particles.splice(i,1); }
    }
  }

  render(){
    this.renderer.render(this.scene, this.camera);
  }
}

export {
  Game, WORLDS, LEVELS_PER_WORLD, SKINS, ACHIEVEMENTS, POWERUP_TYPES,
  generateLevel, SAVE, persistSave, addXP, unlockAchievement, AUDIO, xpForLevel,
};
