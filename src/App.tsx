import React, { useEffect, useRef, useState } from 'react';

// Dimensions of the simulated game world
const WORLD_W = 1600;
const WORLD_H = 900;
const G = 0.15;
const MAX_PULL = 150;
const LAUNCH_POWER_SCALE = 0.085;

class Vec2 {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  copy() {
    return new Vec2(this.x, this.y);
  }
  add(v: Vec2) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  sub(v: Vec2) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  mult(n: number) {
    this.x *= n;
    this.y *= n;
    return this;
  }
  magSq() {
    return this.x * this.x + this.y * this.y;
  }
  mag() {
    return Math.sqrt(this.magSq());
  }
  normalize() {
    const m = this.mag();
    if (m !== 0) this.mult(1 / m);
    return this;
  }
  dist(v: Vec2) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

class SoundFX {
  ctx: AudioContext | null = null;
  enabled = true;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', startVol = 0.1, endVol = 0.001) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(startVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(endVol, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Ignore audio errors
    }
  }

  playLaunch() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {
      // Ignore audio errors
    }
  }

  playCollect() {
    this.playTone(880, 0.15, 'sine', 0.15);
  }

  playVictory() {
    this.playTone(523.25, 0.15, 'sine', 0.15);
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.15), 120);
    setTimeout(() => this.playTone(783.99, 0.3, 'sine', 0.2), 240);
  }

  playDeath() {
    this.playTone(100, 0.4, 'sawtooth', 0.2, 0.001);
  }
}

interface LevelBlackHole {
  x: number;
  y: number;
  mass: number;
  eventRadius: number;
  isRepulsor?: boolean;
}

interface LevelObstacle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  minY: number;
  maxY: number;
}

interface LevelDef {
  id: number;
  title: string;
  hint: string;
  probe: { x: number; y: number };
  target: { x: number; y: number; r: number };
  optimalLaunch?: { dx: number; dy: number };
  computedOptimalLaunch?: { dx: number; dy: number };
  blackHoles: LevelBlackHole[];
  beacons: { x: number; y: number }[];
  obstacles: LevelObstacle[];
}

const LEVELS: LevelDef[] = [
  {
    id: 1,
    title: 'FIRST ORBIT',
    hint: 'Slingshot over the black hole in a smooth arc to gather all 3 beacons before entering the wormhole.',
    probe: { x: 200, y: 450 },
    target: { x: 1400, y: 450, r: 42 },
    optimalLaunch: { dx: 102, dy: -72 },
    blackHoles: [{ x: 800, y: 600, mass: 28000, eventRadius: 32 }],
    beacons: [{ x: 500, y: 300 }, { x: 800, y: 220 }, { x: 1100, y: 300 }],
    obstacles: []
  },
  {
    id: 2,
    title: 'DIAGONAL GRAVITY DIP',
    hint: 'Launch diagonally down-right to skim past the gravitational well and gather all three beacons.',
    probe: { x: 220, y: 220 },
    target: { x: 1380, y: 680, r: 42 },
    optimalLaunch: { dx: 115, dy: 18 },
    blackHoles: [{ x: 750, y: 380, mass: 24000, eventRadius: 32 }],
    beacons: [{ x: 480, y: 360 }, { x: 800, y: 540 }, { x: 1120, y: 620 }],
    obstacles: []
  },
  {
    id: 3,
    title: 'BINARY GRAVITY SYSTEM',
    hint: 'Steer an S-curve trajectory between twin black holes to collect all research data packets.',
    probe: { x: 200, y: 280 },
    target: { x: 1400, y: 620, r: 42 },
    optimalLaunch: { dx: 125, dy: 12 },
    blackHoles: [
      { x: 600, y: 550, mass: 24000, eventRadius: 32 },
      { x: 1000, y: 330, mass: 24000, eventRadius: 32 }
    ],
    beacons: [{ x: 460, y: 340 }, { x: 800, y: 450 }, { x: 1140, y: 560 }],
    obstacles: []
  },
  {
    id: 4,
    title: 'ASTEROID FIELD DRIFT',
    hint: 'Time your launch when the moving asteroid shifts downward, sweeping high through the beacon field.',
    probe: { x: 200, y: 450 },
    target: { x: 1400, y: 450, r: 42 },
    optimalLaunch: { dx: 110, dy: -80 },
    blackHoles: [{ x: 800, y: 650, mass: 30000, eventRadius: 32 }],
    beacons: [{ x: 500, y: 300 }, { x: 800, y: 200 }, { x: 1100, y: 300 }],
    obstacles: [{ x: 800, y: 360, r: 22, vx: 0, vy: 1.0, minY: 260, maxY: 480 }]
  },
  {
    id: 5,
    title: 'COSMIC GAUNTLET',
    hint: 'Combine three gravitational force fields into a masterwork cosmic slingshot trajectory.',
    probe: { x: 180, y: 620 },
    target: { x: 1420, y: 280, r: 42 },
    optimalLaunch: { dx: 125, dy: -60 },
    blackHoles: [
      { x: 500, y: 500, mass: 24000, eventRadius: 32 },
      { x: 800, y: 620, mass: -16000, eventRadius: 28, isRepulsor: true },
      { x: 1100, y: 360, mass: 26000, eventRadius: 32 }
    ],
    beacons: [{ x: 440, y: 420 }, { x: 780, y: 280 }, { x: 1100, y: 220 }],
    obstacles: []
  },
  {
    id: 6,
    title: 'TRIPLE GRAVITY SLINGSHOT',
    hint: '利用三个黑洞连环引力场呈 S 型波浪轨迹，顺次收集全部 3 个数据信标并安全穿入虫洞！',
    probe: { x: 180, y: 450 },
    target: { x: 1420, y: 450, r: 48 },
    optimalLaunch: { dx: 108, dy: -48 },
    blackHoles: [
      { x: 480, y: 640, mass: 20000, eventRadius: 30 },
      { x: 800, y: 260, mass: 22000, eventRadius: 30 },
      { x: 1120, y: 640, mass: 20000, eventRadius: 30 }
    ],
    beacons: [{ x: 460, y: 320 }, { x: 800, y: 380 }, { x: 1140, y: 320 }],
    obstacles: []
  }
];

function simulateLaunch(lvl: LevelDef, dx: number, dy: number) {
  const launchVel = new Vec2(dx, dy).mult(LAUNCH_POWER_SCALE);
  const simPos = new Vec2(lvl.probe.x, lvl.probe.y);
  const simVel = launchVel.copy();

  let beaconsHitCount = 0;
  const beaconHit = lvl.beacons.map(() => false);

  const simObs = lvl.obstacles.map(o => ({
    pos: new Vec2(o.x, o.y),
    r: o.r,
    vx: o.vx,
    vy: o.vy,
    minY: o.minY,
    maxY: o.maxY
  }));

  const steps = 1200;
  const subSteps = 6;
  const subDt = 1.0 / subSteps;

  for (let i = 0; i < steps; i++) {
    for (let s = 0; s < subSteps; s++) {
      const totalAcc = new Vec2(0, 0);
      for (const bh of lvl.blackHoles) {
        const dir = new Vec2(bh.x, bh.y).sub(simPos);
        let distSq = dir.magSq();
        if (distSq < 64) distSq = 64;
        const forceMag = (G * bh.mass) / distSq;
        totalAcc.add(dir.normalize().mult(forceMag));
      }
      simVel.add(totalAcc.mult(subDt));
      simPos.add(simVel.copy().mult(subDt));

      // Bounds Check
      if (simPos.x < 10 || simPos.x > WORLD_W - 10 || simPos.y < 10 || simPos.y > WORLD_H - 10) {
        return { success: false, beaconsCollected: 0 };
      }

      // Black Hole Collision
      for (const bh of lvl.blackHoles) {
        if (simPos.dist(new Vec2(bh.x, bh.y)) <= bh.eventRadius) {
          return { success: false, beaconsCollected: 0 };
        }
      }

      // Obstacle Collision
      for (const o of simObs) {
        if (simPos.dist(o.pos) <= o.r + 8) {
          return { success: false, beaconsCollected: 0 };
        }
      }

      // Beacon Collection
      for (let bIdx = 0; bIdx < lvl.beacons.length; bIdx++) {
        if (!beaconHit[bIdx]) {
          const b = lvl.beacons[bIdx];
          if (simPos.dist(new Vec2(b.x, b.y)) <= 8 + 8 + 28) {
            beaconHit[bIdx] = true;
            beaconsHitCount++;
          }
        }
      }

      // Target Arrival
      if (simPos.dist(new Vec2(lvl.target.x, lvl.target.y)) <= lvl.target.r) {
        return { success: true, beaconsCollected: beaconsHitCount };
      }
    }

    for (const o of simObs) {
      o.pos.y += o.vy;
      if (o.pos.y < o.minY || o.pos.y > o.maxY) o.vy *= -1;
    }
  }

  return { success: false, beaconsCollected: beaconsHitCount };
}

function refineLaunch(lvl: LevelDef, baseDx: number, baseDy: number) {
  const baseMag = Math.sqrt(baseDx * baseDx + baseDy * baseDy);
  const baseAngle = Math.atan2(baseDy, baseDx);
  let best = { dx: baseDx, dy: baseDy };
  let maxBeacons = -1;

  for (let dMag = -5; dMag <= 5; dMag += 0.5) {
    const mag = baseMag + dMag;
    if (mag < 10 || mag > MAX_PULL) continue;
    for (let dAngle = -0.1; dAngle <= 0.1; dAngle += 0.005) {
      const angle = baseAngle + dAngle;
      const dx = Math.cos(angle) * mag;
      const dy = Math.sin(angle) * mag;
      const res = simulateLaunch(lvl, dx, dy);
      if (res.success && res.beaconsCollected > maxBeacons) {
        maxBeacons = res.beaconsCollected;
        best = { dx, dy };
        if (maxBeacons === lvl.beacons.length) return best;
      }
    }
  }
  return best;
}

function findOptimalLaunch(levelIdx: number) {
  const lvl = LEVELS[levelIdx];

  if (lvl.optimalLaunch) {
    const res = simulateLaunch(lvl, lvl.optimalLaunch.dx, lvl.optimalLaunch.dy);
    if (res.success && res.beaconsCollected >= lvl.beacons.length) {
      return { dx: lvl.optimalLaunch.dx, dy: lvl.optimalLaunch.dy };
    }
  }

  let bestLaunch: { dx: number; dy: number } | null = null;
  let maxBeacons = -1;

  for (let pMag = 20; pMag <= MAX_PULL; pMag += 2) {
    for (let angle = -Math.PI; angle < Math.PI; angle += Math.PI / 180) {
      const dx = Math.cos(angle) * pMag;
      const dy = Math.sin(angle) * pMag;

      const result = simulateLaunch(lvl, dx, dy);
      if (result.success) {
        if (result.beaconsCollected > maxBeacons) {
          maxBeacons = result.beaconsCollected;
          bestLaunch = { dx, dy };
          if (maxBeacons === lvl.beacons.length) {
            return refineLaunch(lvl, dx, dy);
          }
        }
      }
    }
  }

  if (bestLaunch) {
    const refined = refineLaunch(lvl, bestLaunch.dx, bestLaunch.dy);
    const resRefined = simulateLaunch(lvl, refined.dx, refined.dy);
    if (resRefined.success && resRefined.beaconsCollected >= maxBeacons) {
      return refined;
    }
  }

  return bestLaunch || (lvl.optimalLaunch ? { dx: lvl.optimalLaunch.dx, dy: lvl.optimalLaunch.dy } : { dx: 80, dy: -40 });
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const soundFXRef = useRef<SoundFX>(new SoundFX());

  // UI state
  const [levelIdx, setLevelIdx] = useState(0);
  const [beaconsCollected, setBeaconsCollected] = useState(0);
  const [levelStarScores, setLevelStarScores] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [statusText, setStatusText] = useState('Click & Drag satellite to aim slingshot');
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showOptimalGuide, setShowOptimalGuide] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Modals state
  const [modalType, setModalType] = useState<'none' | 'victory' | 'defeat' | 'levels' | 'help'>('none');
  const [defeatReason, setDefeatReason] = useState({ title: '', desc: '' });
  const [lastScore, setLastScore] = useState(0);

  // Game internal simulation refs
  const stateRef = useRef({
    gameState: 'AIMING' as 'AIMING' | 'FLYING' | 'WON' | 'LOST',
    currentLevelIdx: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartPos: null as Vec2 | null,
    currentMousePos: null as Vec2 | null,
    beaconsCollected: 0,
    probe: {
      pos: new Vec2(200, 450),
      vel: new Vec2(0, 0),
      radius: 8,
      trail: [] as Vec2[],
      maxTrail: 180
    },
    blackHoles: [] as {
      pos: Vec2;
      mass: number;
      eventRadius: number;
      isRepulsor?: boolean;
      pulse: number;
    }[],
    wormhole: {
      pos: new Vec2(1400, 450),
      r: 42,
      angle: 0
    },
    beacons: [] as {
      pos: Vec2;
      r: number;
      collected: boolean;
      pulseAngle: number;
    }[],
    obstacles: [] as {
      pos: Vec2;
      r: number;
      vx: number;
      vy: number;
      minY: number;
      maxY: number;
    }[],
    particles: [] as {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      life: number;
      decay: number;
      size: number;
    }[],
    backgroundStars: [] as {
      x: number;
      y: number;
      size: number;
      alpha: number;
      twinkleSpeed: number;
    }[]
  });

  const showTrajectoryRef = useRef(showTrajectory);
  showTrajectoryRef.current = showTrajectory;

  const showOptimalGuideRef = useRef(showOptimalGuide);
  showOptimalGuideRef.current = showOptimalGuide;

  const spawnExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 1;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1.0,
        decay: Math.random() * 0.03 + 0.015,
        size: Math.random() * 4 + 2
      });
    }
  };

  const spawnSparkles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.02,
        size: Math.random() * 3 + 1
      });
    }
  };

  const applyGravity = (pos: Vec2, vel: Vec2, dt: number) => {
    const totalAcc = new Vec2(0, 0);
    for (const bh of stateRef.current.blackHoles) {
      const dir = bh.pos.copy().sub(pos);
      let distSq = dir.magSq();
      if (distSq < 64) distSq = 64;
      const forceMag = (G * bh.mass) / distSq;
      totalAcc.add(dir.normalize().mult(forceMag));
    }
    vel.add(totalAcc.mult(dt));
  };

  const calculateTrajectory = () => {
    const s = stateRef.current;
    if (!s.isDragging && !showOptimalGuideRef.current) {
      return { points: [], crashPoint: null, hitBeaconIndices: [] };
    }

    let launchVel: Vec2;
    let startPos: Vec2;

    if (s.isDragging && s.dragStartPos && s.currentMousePos) {
      const pullVec = s.dragStartPos.copy().sub(s.currentMousePos);
      const pullMag = Math.min(pullVec.mag(), MAX_PULL);
      launchVel = pullVec.normalize().mult(pullMag * LAUNCH_POWER_SCALE);
      startPos = s.dragStartPos.copy();
    } else {
      const lvl = LEVELS[s.currentLevelIdx];
      const opt = lvl.computedOptimalLaunch || lvl.optimalLaunch || { dx: 100, dy: -50 };
      const guideVec = new Vec2(opt.dx, opt.dy);
      launchVel = guideVec.copy().normalize().mult(guideVec.mag() * LAUNCH_POWER_SCALE);
      startPos = s.probe.pos.copy();
    }

    const simPos = startPos.copy();
    const simVel = launchVel.copy();
    const points = [simPos.copy()];
    let crashPoint: Vec2 | null = null;
    const hitBeaconIndices: number[] = [];

    const simBeaconsCollected = s.beacons.map(() => false);

    const steps = 1200;
    const subSteps = 6;
    const subDt = 1.0 / subSteps;

    for (let i = 0; i < steps; i++) {
      let hitObstacle = false;
      for (let sub = 0; sub < subSteps; sub++) {
        applyGravity(simPos, simVel, subDt);
        simPos.add(simVel.copy().mult(subDt));

        for (let bIdx = 0; bIdx < s.beacons.length; bIdx++) {
          if (!simBeaconsCollected[bIdx]) {
            const b = s.beacons[bIdx];
            if (simPos.dist(b.pos) <= b.r + s.probe.radius + 28) {
              simBeaconsCollected[bIdx] = true;
              hitBeaconIndices.push(bIdx);
            }
          }
        }

        for (const bh of s.blackHoles) {
          if (simPos.dist(bh.pos) <= bh.eventRadius) {
            hitObstacle = true;
            crashPoint = simPos.copy();
            break;
          }
        }
        if (hitObstacle) break;
      }

      points.push(simPos.copy());
      if (hitObstacle) break;

      if (simPos.dist(s.wormhole.pos) <= s.wormhole.r) {
        break;
      }
    }

    return { points, crashPoint, hitBeaconIndices };
  };

  const initLevel = (idx: number) => {
    setLevelIdx(idx);
    setBeaconsCollected(0);
    setModalType('none');

    const lvl = LEVELS[idx];
    const s = stateRef.current;
    s.currentLevelIdx = idx;
    s.gameState = 'AIMING';
    s.beaconsCollected = 0;
    s.particles = [];
    s.isDragging = false;
    s.dragStartPos = null;
    s.currentMousePos = null;

    s.probe = {
      pos: new Vec2(lvl.probe.x, lvl.probe.y),
      vel: new Vec2(0, 0),
      radius: 8,
      trail: [],
      maxTrail: 180
    };

    s.blackHoles = lvl.blackHoles.map(bh => ({
      pos: new Vec2(bh.x, bh.y),
      mass: bh.mass,
      eventRadius: bh.eventRadius,
      isRepulsor: bh.isRepulsor || false,
      pulse: Math.random() * Math.PI * 2
    }));

    s.wormhole = {
      pos: new Vec2(lvl.target.x, lvl.target.y),
      r: lvl.target.r,
      angle: 0
    };

    s.beacons = lvl.beacons.map(b => ({
      pos: new Vec2(b.x, b.y),
      r: 8,
      collected: false,
      pulseAngle: Math.random() * Math.PI * 2
    }));

    s.obstacles = lvl.obstacles
      ? lvl.obstacles.map(o => ({
          pos: new Vec2(o.x, o.y),
          r: o.r,
          vx: o.vx,
          vy: o.vy,
          minY: o.minY,
          maxY: o.maxY
        }))
      : [];

    if (!lvl.computedOptimalLaunch) {
      lvl.computedOptimalLaunch = findOptimalLaunch(idx);
    }

    setStatusText('Click & Drag satellite to aim slingshot');
  };

  const handleDefeat = (title: string, desc: string) => {
    stateRef.current.gameState = 'LOST';
    soundFXRef.current.playDeath();
    setDefeatReason({ title, desc });
    setModalType('defeat');
    setStatusText('Mission failed');
  };

  const handleVictory = () => {
    stateRef.current.gameState = 'WON';
    soundFXRef.current.playVictory();
    spawnSparkles(stateRef.current.wormhole.pos.x, stateRef.current.wormhole.pos.y, '#38bdf8');

    const totalBeacons = LEVELS[stateRef.current.currentLevelIdx].beacons.length;
    const collected = stateRef.current.beaconsCollected;
    const score = 1000 + collected * 500;
    setLastScore(score);

    let stars = 1;
    if (collected >= 2) stars = 2;
    if (collected === totalBeacons) stars = 3;

    setLevelStarScores(prev => {
      const next = [...prev];
      if (stars > next[stateRef.current.currentLevelIdx]) {
        next[stateRef.current.currentLevelIdx] = stars;
      }
      return next;
    });

    setModalType('victory');
    setStatusText('Satellite reached wormhole successfully!');
  };

  const stepPhysics = (dt: number) => {
    const s = stateRef.current;
    if (s.gameState !== 'FLYING') return;

    const subSteps = 6;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      applyGravity(s.probe.pos, s.probe.vel, subDt);
      s.probe.pos.add(s.probe.vel.copy().mult(subDt));

      if (step % 2 === 0) {
        s.probe.trail.push(s.probe.pos.copy());
        if (s.probe.trail.length > s.probe.maxTrail) {
          s.probe.trail.shift();
        }
      }

      // Check black hole collisions
      for (const bh of s.blackHoles) {
        const d = s.probe.pos.dist(bh.pos);
        if (d <= bh.eventRadius) {
          spawnExplosion(s.probe.pos.x, s.probe.pos.y, bh.isRepulsor ? '#38bdf8' : '#f43f5e');
          handleDefeat('EVENT HORIZON COLLAPSE', 'Your satellite was crushed by gravitational singularity.');
          return;
        }
      }

      // Check obstacle collisions
      for (const obs of s.obstacles) {
        const d = s.probe.pos.dist(obs.pos);
        if (d <= obs.r + s.probe.radius) {
          spawnExplosion(s.probe.pos.x, s.probe.pos.y, '#f59e0b');
          handleDefeat('ASTEROID IMPACT', 'Satellite collided with space debris.');
          return;
        }
      }

      // Check beacon collections
      for (const b of s.beacons) {
        if (!b.collected) {
          const d = s.probe.pos.dist(b.pos);
          if (d <= b.r + s.probe.radius + 28) {
            b.collected = true;
            s.beaconsCollected++;
            setBeaconsCollected(s.beaconsCollected);
            soundFXRef.current.playCollect();
            spawnSparkles(b.pos.x, b.pos.y, '#fbbf24');
          }
        }
      }

      // Check target reached
      const distToTarget = s.probe.pos.dist(s.wormhole.pos);
      if (distToTarget <= s.wormhole.r) {
        handleVictory();
        return;
      }

      // Check out of bounds
      if (s.probe.pos.x < 0 || s.probe.pos.x > WORLD_W || s.probe.pos.y < 0 || s.probe.pos.y > WORLD_H) {
        handleDefeat('DRIFTED OUT OF BOUNDS', 'Satellite exited the designated mission sector boundary.');
        return;
      }
    }

    for (const obs of s.obstacles) {
      obs.pos.y += obs.vy;
      if (obs.pos.y < obs.minY || obs.pos.y > obs.maxY) {
        obs.vy *= -1;
      }
    }
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render twinkling background stars
    s.backgroundStars.forEach(star => {
      star.alpha += Math.sin(Date.now() * star.twinkleSpeed) * 0.01;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, Math.min(0.9, star.alpha))})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(s.offsetX, s.offsetY);
    ctx.scale(s.scale, s.scale);

    // World boundary outline
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    // Gravitational space grid warp
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x <= WORLD_W; x += gridSize) {
      ctx.beginPath();
      for (let y = 0; y <= WORLD_H; y += 15) {
        const pt = new Vec2(x, y);
        for (const bh of s.blackHoles) {
          const d = pt.dist(bh.pos);
          const pull = (bh.mass / (d + 80)) * 0.25;
          const dir = bh.pos.copy().sub(pt).normalize().mult(pull);
          pt.add(dir);
        }
        if (y === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Black Holes rendering
    s.blackHoles.forEach(bh => {
      bh.pulse += 0.03;
      const glowR = bh.eventRadius + 20 + Math.sin(bh.pulse) * 4;

      const grad = ctx.createRadialGradient(bh.pos.x, bh.pos.y, bh.eventRadius * 0.5, bh.pos.x, bh.pos.y, glowR * 2);
      if (bh.isRepulsor) {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
        grad.addColorStop(0.4, 'rgba(147, 51, 234, 0.4)');
        grad.addColorStop(1, 'transparent');
      } else {
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.3, 'rgba(244, 63, 94, 0.6)');
        grad.addColorStop(0.7, 'rgba(217, 70, 239, 0.2)');
        grad.addColorStop(1, 'transparent');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bh.pos.x, bh.pos.y, glowR * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = bh.isRepulsor ? '#e0f2fe' : '#000000';
      ctx.beginPath();
      ctx.arc(bh.pos.x, bh.pos.y, bh.eventRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = bh.isRepulsor ? '#38bdf8' : '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bh.pos.x, bh.pos.y, bh.eventRadius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Wormhole / Target
    s.wormhole.angle += 0.02;
    ctx.save();
    ctx.translate(s.wormhole.pos.x, s.wormhole.pos.y);
    ctx.rotate(s.wormhole.angle);

    const whGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, s.wormhole.r + 10);
    whGrad.addColorStop(0, '#ffffff');
    whGrad.addColorStop(0.5, '#38bdf8');
    whGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = whGrad;
    ctx.beginPath();
    ctx.arc(0, 0, s.wormhole.r + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, s.wormhole.r * 0.7, 0, Math.PI * 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Data Beacons
    const { hitBeaconIndices } = calculateTrajectory();

    s.beacons.forEach((b, idx) => {
      if (b.collected) return;
      b.pulseAngle += 0.04;

      const isWillBeHit = hitBeaconIndices.includes(idx);
      const bGlow = b.r + Math.sin(b.pulseAngle) * 3;

      if (isWillBeHit && (s.isDragging || showOptimalGuideRef.current) && s.gameState === 'AIMING') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.r + 12 + Math.sin(Date.now() * 0.01) * 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, bGlow + 10, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, bGlow + 8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isWillBeHit ? '#67e8f9' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Obstacles
    s.obstacles.forEach(obs => {
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(obs.pos.x, obs.pos.y, obs.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Optimal Guide display
    if (showOptimalGuideRef.current && s.gameState === 'AIMING' && !s.isDragging) {
      const lvl = LEVELS[s.currentLevelIdx];
      const opt = lvl.computedOptimalLaunch || lvl.optimalLaunch || { dx: 100, dy: -50 };
      const guideVec = new Vec2(opt.dx, opt.dy);
      const guideTargetPos = s.probe.pos.copy().sub(guideVec);

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(s.probe.pos.x, s.probe.pos.y);
      ctx.lineTo(guideTargetPos.x, guideTargetPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(guideTargetPos.x, guideTargetPos.y, 10, 0, Math.PI * 2);
      ctx.fill();

      const { points } = calculateTrajectory();
      if (points.length > 1) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
    }

    // Trajectory prediction when dragging
    if (showTrajectoryRef.current && s.isDragging && s.gameState === 'AIMING') {
      const { points, crashPoint } = calculateTrajectory();
      if (points.length > 1) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (crashPoint) {
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(crashPoint.x, crashPoint.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Drag slingshot band
    if (s.isDragging && s.dragStartPos && s.currentMousePos && s.gameState === 'AIMING') {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.dragStartPos.x, s.dragStartPos.y);
      ctx.lineTo(s.currentMousePos.x, s.currentMousePos.y);
      ctx.stroke();

      const pullMag = Math.min(s.dragStartPos.dist(s.currentMousePos), MAX_PULL);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.beginPath();
      ctx.arc(s.dragStartPos.x, s.dragStartPos.y, pullMag, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Satellite trailing path
    if (s.probe.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(s.probe.trail[0].x, s.probe.trail[0].y);
      for (let i = 1; i < s.probe.trail.length; i++) {
        ctx.lineTo(s.probe.trail[i].x, s.probe.trail[i].y);
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Satellite Probe
    if (s.gameState !== 'LOST') {
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.probe.pos.x, s.probe.pos.y, s.probe.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Render Particle system
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) {
        s.particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  };

  const getWorldCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return new Vec2(0, 0);
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const worldX = (screenX - stateRef.current.offsetX) / stateRef.current.scale;
    const worldY = (screenY - stateRef.current.offsetY) / stateRef.current.scale;

    return new Vec2(worldX, worldY);
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const s = stateRef.current;
    if (s.gameState !== 'AIMING') return;
    soundFXRef.current.init();

    const coords = getWorldCoords(clientX, clientY);
    const dist = coords.dist(s.probe.pos);

    if (dist < 80 / s.scale) {
      s.isDragging = true;
      s.dragStartPos = s.probe.pos.copy();
      s.currentMousePos = coords.copy();
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    s.currentMousePos = getWorldCoords(clientX, clientY);
  };

  const handlePointerUp = () => {
    const s = stateRef.current;
    if (!s.isDragging || !s.dragStartPos || !s.currentMousePos) return;
    s.isDragging = false;

    const pullVec = s.dragStartPos.copy().sub(s.currentMousePos);
    const pullMag = Math.min(pullVec.mag(), MAX_PULL);

    if (pullMag > 15) {
      s.probe.vel = pullVec.normalize().mult(pullMag * LAUNCH_POWER_SCALE);
      s.gameState = 'FLYING';
      soundFXRef.current.playLaunch();
      setStatusText('Satellite in orbital trajectory...');
    }
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const marginFactor = 0.86;
    const availableW = canvas.width * marginFactor;
    const availableH = canvas.height * marginFactor;

    const s = stateRef.current;
    s.scale = Math.min(availableW / WORLD_W, availableH / WORLD_H);
    s.offsetX = (canvas.width - WORLD_W * s.scale) / 2;
    s.offsetY = (canvas.height - WORLD_H * s.scale) / 2;

    if (s.backgroundStars.length === 0) {
      for (let i = 0; i < 150; i++) {
        s.backgroundStars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.8 + 0.5,
          alpha: Math.random() * 0.7 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005
        });
      }
    }
  };

  useEffect(() => {
    resizeCanvas();
    initLevel(0);

    const onWindowResize = () => {
      resizeCanvas();
    };

    window.addEventListener('resize', onWindowResize);

    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      let dt = (now - lastTime) / 1000;
      if (dt > 0.1) dt = 0.1;
      lastTime = now;

      stepPhysics(dt * 60);
      renderCanvas();

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleAutoLaunch = () => {
    const s = stateRef.current;
    if (s.gameState !== 'AIMING') return;
    soundFXRef.current.init();

    const lvl = LEVELS[s.currentLevelIdx];
    const opt = lvl.computedOptimalLaunch || lvl.optimalLaunch || { dx: 100, dy: -50 };

    const pullVec = new Vec2(opt.dx, opt.dy);
    s.probe.vel = pullVec.copy().normalize().mult(pullVec.mag() * LAUNCH_POWER_SCALE);
    s.gameState = 'FLYING';
    soundFXRef.current.playLaunch();
    setStatusText('Perfect trajectory launched...');
  };

  const handleAudioToggle = () => {
    soundFXRef.current.enabled = !soundFXRef.current.enabled;
    setAudioEnabled(soundFXRef.current.enabled);
  };

  const currentLvl = LEVELS[levelIdx] || LEVELS[0];
  const totalBeacons = currentLvl.beacons.length;
  const currentStars = levelStarScores[levelIdx] || 0;

  return (
    <div className="w-screen h-screen flex flex-col justify-between items-center relative overflow-hidden bg-[#050711]">
      {/* Header UI */}
      <header className="w-full z-20 p-4 px-6 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="glass-panel p-3 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400 text-xl shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <i className="fa-solid font-bold fa-atom"></i>
            </div>
            <div>
              <h1 className="font-orbitron font-bold text-lg md:text-xl text-white tracking-wider neon-text-cyan">
                BLACK HOLE SLINGSHOT
              </h1>
              <p className="text-xs text-slate-400 tracking-wide">GRAVITATIONAL NAVIGATION SIMULATOR</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-4 text-sm font-semibold">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">LEVEL:</span>
              <span className="font-orbitron text-cyan-400 text-base">{levelIdx + 1}</span>
            </div>
            <div className="w-px h-5 bg-slate-700"></div>
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-satellite text-amber-400"></i>
              <span className="font-orbitron text-amber-400 text-base">
                {beaconsCollected} / {totalBeacons}
              </span>
            </div>
          </div>

          <button
            onClick={() => setModalType('levels')}
            className="glass-btn p-3 px-4 rounded-xl text-cyan-300 font-semibold flex items-center gap-2 text-sm"
            title="Mission Select"
          >
            <i className="fa-solid fa-map"></i> <span className="hidden md:inline">LEVELS</span>
          </button>

          <button
            onClick={() => setShowOptimalGuide(!showOptimalGuide)}
            className={`glass-btn p-3 px-4 rounded-xl text-yellow-300 font-semibold flex items-center gap-2 text-sm transition-all ${
              showOptimalGuide ? 'bg-yellow-500/20 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]' : ''
            }`}
            title="Toggle optimal guide vector"
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i> <span className="hidden md:inline">PERFECT AIM</span>
          </button>

          {showOptimalGuide && (
            <button
              onClick={handleAutoLaunch}
              className="glass-btn p-3 px-4 rounded-xl text-emerald-300 font-semibold flex items-center gap-2 text-sm border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/25 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
              title="Auto Launch with perfect angle"
            >
              <i className="fa-solid fa-rocket"></i> <span className="hidden md:inline">AUTO LAUNCH</span>
            </button>
          )}

          <button
            onClick={() => initLevel(levelIdx)}
            className="glass-btn p-3 px-4 rounded-xl text-amber-300 font-semibold flex items-center gap-2 text-sm"
            title="Reset Satellite"
          >
            <i className="fa-solid fa-rotate-left"></i> <span className="hidden md:inline">RESET</span>
          </button>

          <button
            onClick={handleAudioToggle}
            className="glass-btn p-3 w-11 h-11 rounded-xl text-slate-300 flex items-center justify-center text-sm"
            title="Toggle Sound"
          >
            <i className={`fa-solid ${audioEnabled ? 'fa-volume-high' : 'fa-volume-xmark text-rose-400'}`}></i>
          </button>

          <button
            onClick={() => setModalType('help')}
            className="glass-btn p-3 w-11 h-11 rounded-xl text-slate-300 flex items-center justify-center text-sm"
            title="Mission Manual"
          >
            <i className="fa-solid fa-circle-question"></i>
          </button>
        </div>
      </header>

      {/* Main Game Canvas Container */}
      <main className="absolute inset-0 w-full h-full z-0 cursor-crosshair">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onMouseDown={e => handlePointerDown(e.clientX, e.clientY)}
          onMouseMove={e => handlePointerMove(e.clientX, e.clientY)}
          onMouseUp={handlePointerUp}
          onTouchStart={e => {
            if (e.touches[0]) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchMove={e => {
            if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={handlePointerUp}
        />
      </main>

      {/* Footer UI */}
      <footer className="w-full z-20 p-4 px-6 flex justify-between items-end pointer-events-none">
        <div className="glass-panel px-4 py-3 rounded-2xl pointer-events-auto flex items-center gap-4 text-xs md:text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block animate-ping"></span>
            <span className="font-medium text-cyan-300">{statusText}</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-slate-700"></div>
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <i className="fa-solid fa-lightbulb text-amber-400"></i>
            <span>{currentLvl.hint}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowTrajectory(!showTrajectory)}
            className="glass-btn px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-cyan-300 flex items-center gap-2"
          >
            <i className="fa-solid fa-route"></i>
            <span>
              PREDICT TRAJECTORY:{' '}
              <span className={showTrajectory ? 'text-green-400' : 'text-rose-400'}>
                {showTrajectory ? 'ON' : 'OFF'}
              </span>
            </span>
          </button>
        </div>
      </footer>

      {/* Modal Overlay */}
      {modalType !== 'none' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          {/* Victory Modal */}
          {modalType === 'victory' && (
            <div className="glass-panel w-full max-w-md p-6 rounded-3xl text-center space-y-6 border border-cyan-500/40 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400 mx-auto flex items-center justify-center text-cyan-300 text-3xl">
                <i className="fa-solid fa-trophy text-amber-400"></i>
              </div>
              <div>
                <h2 className="font-orbitron text-2xl font-bold text-white neon-text-cyan">
                  {beaconsCollected === totalBeacons ? 'PERFECT 3-STAR SLINGSHOT!' : 'WORMHOLE REACHED!'}
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  {beaconsCollected === totalBeacons
                    ? 'All data beacons collected & wormhole reached safely!'
                    : `Collected ${beaconsCollected}/${totalBeacons} beacons. Try again for 3 stars!`}
                </p>
              </div>

              <div className="flex justify-center gap-3 text-3xl py-2">
                <i
                  className={`fa-solid fa-star ${
                    currentStars >= 1 ? 'text-amber-400 neon-text-gold' : 'text-slate-600'
                  }`}
                ></i>
                <i
                  className={`fa-solid fa-star ${
                    currentStars >= 2 ? 'text-amber-400 neon-text-gold' : 'text-slate-600'
                  }`}
                ></i>
                <i
                  className={`fa-solid fa-star ${
                    currentStars >= 3 ? 'text-amber-400 neon-text-gold' : 'text-slate-600'
                  }`}
                ></i>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Data Beacons Collected:</span>
                  <span className="font-orbitron text-amber-400 font-bold">
                    {beaconsCollected} / {totalBeacons}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Score:</span>
                  <span className="font-orbitron text-cyan-300 font-bold">{lastScore} PTS</span>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => initLevel(levelIdx)}
                  className="glass-btn flex-1 py-3 rounded-xl font-semibold text-amber-300 text-sm"
                >
                  <i className="fa-solid fa-rotate-left mr-2"></i>RETRY
                </button>
                <button
                  onClick={() => {
                    if (levelIdx < LEVELS.length - 1) {
                      initLevel(levelIdx + 1);
                    } else {
                      initLevel(0);
                    }
                  }}
                  className="glass-btn flex-1 py-3 rounded-xl font-semibold bg-cyan-500/30 text-cyan-200 text-sm border-cyan-400"
                >
                  NEXT LEVEL<i className="fa-solid fa-arrow-right ml-2"></i>
                </button>
              </div>
            </div>
          )}

          {/* Defeat Modal */}
          {modalType === 'defeat' && (
            <div className="glass-panel w-full max-w-md p-6 rounded-3xl text-center space-y-6 border border-rose-500/40 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-400 mx-auto flex items-center justify-center text-rose-400 text-3xl">
                <i className="fa-solid fa-circle-radiation"></i>
              </div>
              <div>
                <h2 className="font-orbitron text-2xl font-bold text-rose-400">{defeatReason.title}</h2>
                <p className="text-sm text-slate-300 mt-1">{defeatReason.desc}</p>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  onClick={() => initLevel(levelIdx)}
                  className="glass-btn w-full py-3.5 rounded-xl font-semibold text-amber-300 text-sm bg-amber-500/10 border-amber-500/30"
                >
                  <i className="fa-solid fa-rotate-left mr-2"></i>TRY AGAIN
                </button>
              </div>
            </div>
          )}

          {/* Level Select Modal */}
          {modalType === 'levels' && (
            <div className="glass-panel w-full max-w-xl p-6 rounded-3xl space-y-6 border border-cyan-500/30 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center border-b border-slate-700/60 pb-4">
                <h2 className="font-orbitron text-xl font-bold text-white neon-text-cyan">SELECT MISSION</h2>
                <button
                  onClick={() => setModalType('none')}
                  className="text-slate-400 hover:text-white text-xl cursor-pointer"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
                {LEVELS.map((lvl, idx) => {
                  const stars = levelStarScores[idx] || 0;
                  const isActive = idx === levelIdx;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => initLevel(idx)}
                      className={`glass-btn p-4 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition ${
                        isActive ? 'border-cyan-400 bg-cyan-500/20' : ''
                      }`}
                    >
                      <div className="text-xs text-slate-400 font-orbitron">MISSION 0{lvl.id}</div>
                      <div className="font-bold text-sm text-white">{lvl.title}</div>
                      <div className="text-xs flex gap-1">
                        <i className={`fa-solid fa-star ${stars >= 1 ? 'text-amber-400' : 'text-slate-700'}`}></i>
                        <i className={`fa-solid fa-star ${stars >= 2 ? 'text-amber-400' : 'text-slate-700'}`}></i>
                        <i className={`fa-solid fa-star ${stars >= 3 ? 'text-amber-400' : 'text-slate-700'}`}></i>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Help Modal */}
          {modalType === 'help' && (
            <div className="glass-panel w-full max-w-lg p-6 rounded-3xl space-y-5 border border-cyan-500/30 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
                <h2 className="font-orbitron text-xl font-bold text-white neon-text-cyan flex items-center">
                  <i className="fa-solid fa-book-journal-whills text-cyan-400 mr-2"></i>MISSION MANUAL
                </h2>
                <button
                  onClick={() => setModalType('none')}
                  className="text-slate-400 hover:text-white text-xl cursor-pointer"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="space-y-4 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="fa-solid fa-hand-pointer"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Slingshot Drag Launch</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Click/touch near your satellite, drag backwards to set launch force and angle, then release to
                      launch!
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="fa-solid fa-circle-dot"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Black Hole Gravity & Event Horizon</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Black holes bend your trajectory with gravitational force. Don't cross the inner RED Event Horizon!
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="fa-solid fa-satellite"></i>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Collect Data Beacons & Reach Wormhole</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Collect up to 3 orbiting data beacons in each mission before safely entering the blue spinning
                      wormhole target!
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setModalType('none')}
                className="glass-btn w-full py-3 rounded-xl font-semibold text-cyan-300 text-sm"
              >
                UNDERSTOOD
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
