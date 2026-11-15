import {
  getAssistModeConfig,
  GROUND_Y,
  R_CATCH_PIN,
  SHIP_DIAMETER,
  SHIP_LENGTH,
  TOWER_TOP_Y,
  TOWER_X,
} from './constants';
import { getTranslations, type Locale } from './i18n';
import { getBottomPosition, getCatchPinPosition } from './physics';
import type { AssistMode, OutcomeKind, RocketState } from './types';

type ParticleKind = 'exhaust' | 'dust' | 'plasma' | 'fire' | 'debris';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
}

const PARTICLE_POOL_SIZE = 700;

interface Star {
  nx: number;
  ny: number;
  size: number;
  phase: number;
}

export class GameCanvasRenderer {
  private particles: Particle[];
  private poolCursor = 0;
  private stars: Star[];
  private camX = 0;
  private camY = 0;
  private camZoom = 3.2; // pixels per meter
  private cameraInitialized = false;
  private shakeTrauma = 0;
  private chopstickClose = 0; // 0 = open, 1 = clamped shut
  private catchSnapStart: { x: number; y: number; theta: number } | null = null;
  private catchSnapProgress = 0;
  private timeAccum = 0;

  constructor() {
    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      kind: 'exhaust' as ParticleKind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      maxAge: 1,
      size: 1,
    }));

    this.stars = Array.from({ length: 140 }, () => ({
      nx: Math.random(),
      ny: Math.random() * 0.85,
      size: 0.7 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  public resetVisuals(state?: RocketState): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
    }
    this.shakeTrauma = 0;
    this.chopstickClose = 0;
    this.catchSnapStart = null;
    this.catchSnapProgress = 0;
    this.cameraInitialized = false;
    if (state) {
      this.camX = state.x * 0.5;
      this.camY = Math.max(0, state.y * 0.6);
    }
  }

  public triggerExplosion(x: number, y: number): void {
    this.shakeTrauma = 1.0;
    for (let i = 0; i < 85; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 12 + Math.random() * 95;
      this.spawnParticle(
        i % 3 === 0 ? 'debris' : 'fire',
        x + (Math.random() - 0.5) * 8,
        y + (Math.random() - 0.5) * 14,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd + 12,
        0.5 + Math.random() * 1.3,
        i % 3 === 0 ? 1.8 + Math.random() * 2.4 : 4 + Math.random() * 11
      );
    }
  }

  public triggerCatchClamp(state?: RocketState): void {
    this.shakeTrauma = 0.25;
    this.catchSnapStart = state
      ? { x: state.x, y: state.y, theta: state.theta }
      : null;
    this.catchSnapProgress = 0;
  }

  private spawnParticle(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    maxAge: number,
    size: number
  ): void {
    const p = this.particles[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.maxAge = maxAge;
    p.size = size;
  }

  public updateEffects(
    state: RocketState,
    dt: number,
    outcome: OutcomeKind | null
  ): void {
    this.timeAccum += dt;
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.4);

    if (outcome === 'CATCH_SUCCESS') {
      this.chopstickClose = Math.min(1, this.chopstickClose + dt * 5.5);
      this.catchSnapProgress = Math.min(1, this.catchSnapProgress + dt * 3.0);
    } else {
      this.chopstickClose = Math.max(0, this.chopstickClose - dt * 3);
      this.catchSnapProgress = 0;
    }

    // Spawn engine exhaust & pad dust if engines are firing
    if (state.activeEngines > 0 && !outcome) {
      const nozzleAngle = state.theta + state.gimbal;
      const dirX = -Math.sin(nozzleAngle);
      const dirY = -Math.cos(nozzleAngle);
      const bot = getBottomPosition(state);
      const engRatio = state.activeEngines / 6;
      const count = state.activeEngines >= 6 ? 7 : state.activeEngines >= 3 ? 4 : 2;
      const spread = 0.08 + engRatio * 0.14;
      const exhaustSpeed = 135 + engRatio * 75;

      for (let i = 0; i < count; i++) {
        const jitter = (Math.random() - 0.5) * spread;
        const a = Math.atan2(dirX, dirY) + jitter;
        const spd = exhaustSpeed * (0.8 + Math.random() * 0.4);
        this.spawnParticle(
          'exhaust',
          bot.x + (Math.random() - 0.5) * (2.5 + engRatio * 3.5),
          bot.y + (Math.random() - 0.5) * 2,
          state.vx * 0.35 + Math.sin(a) * spd,
          state.vy * 0.35 + Math.cos(a) * spd,
          0.16 + engRatio * 0.18 + Math.random() * 0.12,
          2.0 + engRatio * 3.2 + Math.random() * 1.6
        );
      }

      // Ground dust / steam kick-up when close to concrete pad
      if (bot.y < GROUND_Y + 95) {
        const proximity = Math.max(0, 1 - (bot.y - GROUND_Y) / 95);
        const dustCount = Math.ceil(proximity * 4 * Math.max(0.4, engRatio));
        for (let i = 0; i < dustCount; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.spawnParticle(
            'dust',
            bot.x + (Math.random() - 0.5) * 14,
            GROUND_Y + 1 + Math.random() * 3,
            side * (16 + Math.random() * 48) * proximity,
            4 + Math.random() * 14 * proximity,
            0.55 + Math.random() * 0.7,
            4 + Math.random() * 8
          );
        }
      }

      // Subtle camera shake from 6 engines
      if (state.activeEngines >= 3) {
        this.shakeTrauma = Math.max(
          this.shakeTrauma,
          state.activeEngines === 6 ? 0.14 : 0.07
        );
      }
    }

    // Reentry plasma particles during high dynamic pressure & speed
    const speed = Math.hypot(state.vx, state.vy);
    if (state.dynamicPressureKpa > 5 && speed > 360 && !outcome) {
      const intensity = Math.min(1, (state.dynamicPressureKpa - 5) / 28);
      const count = Math.ceil(intensity * 3);
      for (let i = 0; i < count; i++) {
        this.spawnParticle(
          'plasma',
          state.x + (Math.random() - 0.5) * 14,
          state.y + (Math.random() - 0.5) * 32,
          -state.vx * 0.25 + (Math.random() - 0.5) * 30,
          -state.vy * 0.25 + (Math.random() - 0.5) * 30,
          0.18 + Math.random() * 0.18,
          2.2 + Math.random() * 4.5
        );
      }
    }

    // Update all active particles in-place
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      if (p.kind === 'debris') {
        p.vy -= 9.81 * dt;
      } else if (p.kind === 'dust') {
        p.vx *= 1 - dt * 1.4;
        p.vy += 4 * dt;
      } else if (p.kind === 'fire') {
        p.vx *= 1 - dt * 1.8;
        p.vy += 12 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < GROUND_Y && p.kind !== 'exhaust') {
        p.y = GROUND_Y;
        p.vy = Math.abs(p.vy) * 0.2;
      }
    }
  }

  public renderTitleBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number
  ): void {
    this.timeAccum = timeSec;
    this.drawSkyGradient(ctx, width, height, 60);
    this.drawStars(ctx, width, height, 0.22);

    // Frame tower in the right-center third so upper-left stays clean negative space
    const zoom = Math.max(2.6, Math.min(4.6, height / 195));
    const camX = -width * 0.12 / zoom;
    const camY = -6;

    ctx.save();
    ctx.translate(width * 0.5, height * 0.56);
    ctx.scale(zoom, -zoom);
    ctx.translate(-camX, -camY);

    this.drawGroundAndPad(ctx, camX, width / zoom);
    this.drawMechazillaTower(ctx, false, 'realistic');

    // Show Starship poised beside chopsticks in gentle atmospheric hover showcase
    const bobY = Math.sin(timeSec * 0.8) * 1.8 + 38;
    const showcaseState: RocketState = {
      x: -16,
      y: bobY - R_CATCH_PIN,
      vx: 0,
      vy: 0,
      theta: Math.sin(timeSec * 0.45) * 0.025,
      omega: 0,
      gimbal: Math.sin(timeSec * 1.1) * 0.04,
      fuelMass: 8000,
      selectedEngines: 1,
      throttleOn: false,
      activeEngines: 0,
      time: timeSec,
      ax: 0,
      ay: 0,
      gForce: 0,
      dynamicPressureKpa: 0,
      hoverslamStopPinY: null,
      hoverslamCanStop: true,
      hoverslamStopPinY3: null,
      hoverslam3CanStop: true,
    };
    this.drawStarship(ctx, showcaseState, false);
    ctx.restore();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: RocketState,
    outcome: OutcomeKind | null,
    isDemo = false,
    assistMode: AssistMode = 'realistic',
    locale: Locale = 'ja',
    dt = 1 / 60
  ): void {
    // Smoothly snap caught ship's pin to (0, 0) and pitch to 0 deg as chopsticks close
    let renderState = state;
    if (outcome === 'CATCH_SUCCESS' && this.catchSnapStart) {
      const t = 1 - Math.pow(1 - this.catchSnapProgress, 3);
      renderState = {
        ...state,
        x: this.catchSnapStart.x + (0 - this.catchSnapStart.x) * t,
        y: this.catchSnapStart.y + (-R_CATCH_PIN - this.catchSnapStart.y) * t,
        theta: this.catchSnapStart.theta + (0 - this.catchSnapStart.theta) * t,
      };
    }
    // 1. Compute dynamic target zoom & camera pan based on altitude & distance from tower
    const pin = getCatchPinPosition(state);
    const distToTower = Math.hypot(pin.x, pin.y);
    const minDim = Math.min(width, height);
    const safeDt = Math.max(0, Math.min(0.1, dt));

    let targetZoom: number;
    let targetCamX: number;
    let targetCamY: number;
    let isHighAltTrack = false;

    if (distToTower < 180) {
      // Close-in catch framing: tower and ship clearly visible together
      targetZoom = Math.max(2.6, Math.min(5.2, (minDim * 0.56) / 145));
      targetCamX = state.x * 0.35 + 2;
      targetCamY = Math.max(-18, state.y * 0.48 - 4);
    } else if (state.y < 1_600) {
      // Mid-altitude approach: keep ship and catch point both framed when possible
      const span = Math.max(240, distToTower * 1.38);
      targetZoom = Math.max(0.32, (minDim * 0.72) / span);
      targetCamX = state.x * 0.52;
      targetCamY = Math.max(10, state.y * 0.48);
    } else {
      // High-altitude / reentry: lock directly onto interpolated ship center to avoid velocity-lag jitter
      const altFactor = Math.min(1, (state.y - 1_600) / 30_000);
      targetZoom = 1.45 - altFactor * 0.55; // ~1.45 -> ~0.90 px/m
      targetCamX = state.x;
      targetCamY = state.y;
      isHighAltTrack = true;
    }

    if (!this.cameraInitialized) {
      this.camX = targetCamX;
      this.camY = targetCamY;
      this.camZoom = targetZoom;
      this.cameraInitialized = true;
    } else {
      const zoomAlpha = 1 - Math.exp(-6.5 * safeDt);
      this.camZoom += (targetZoom - this.camZoom) * zoomAlpha;
      if (isHighAltTrack) {
        this.camX = targetCamX;
        this.camY = targetCamY;
      } else {
        const posAlpha = 1 - Math.exp(-8.5 * safeDt);
        this.camX += (targetCamX - this.camX) * posAlpha;
        this.camY += (targetCamY - this.camY) * posAlpha;
      }
    }

    // Apply decaying trauma camera shake
    const shakeMag = this.shakeTrauma * this.shakeTrauma * 11;
    const shakePxX = (Math.random() - 0.5) * 2 * shakeMag;
    const shakePxY = (Math.random() - 0.5) * 2 * shakeMag;

    // 2. Draw sky gradient & stars according to rocket altitude
    this.drawSkyGradient(ctx, width, height, state.y);
    const starAlpha = Math.max(0, Math.min(1, (state.y - 1_500) / 28_000));
    if (starAlpha > 0.02) {
      this.drawStars(ctx, width, height, starAlpha);
    }

    // 3. World-space render
    ctx.save();
    ctx.translate(width * 0.5 + shakePxX, height * 0.52 + shakePxY);
    ctx.scale(this.camZoom, -this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    const viewWorldWidth = width / this.camZoom;
    const viewBottomY = this.camY - (height * 0.55) / this.camZoom;

    // Draw ground & pad if visible in camera frustum
    if (viewBottomY < GROUND_Y + 400) {
      this.drawGroundAndPad(ctx, this.camX, viewWorldWidth);
    }

    // Draw altitude grid markers at low/mid altitude for motion depth cues
    this.drawAltitudeGuides(ctx, this.camX, this.camY, viewWorldWidth, height / this.camZoom);

    // Draw tower if within reasonable view range
    if (this.camY < 2_500) {
      this.drawMechazillaTower(ctx, outcome === 'CATCH_SUCCESS', assistMode);
    }

    // Assisted Mode ONLY: World-space Suicide Burn / Hoverslam horizontal target bar along x = 0
    if (
      assistMode === 'assisted' &&
      !isDemo &&
      !outcome &&
      renderState.vy < -0.5 &&
      this.camY < 12_000
    ) {
      this.drawHoverslamIndicator(ctx, renderState, height, locale);
    }

    // Draw particles behind / around vehicle
    this.drawParticles(ctx);

    // Draw Starship unless completely vaporized in RUD
    const isRud = outcome !== null && outcome !== 'CATCH_SUCCESS';
    if (!isRud) {
      this.drawStarship(ctx, renderState, outcome === 'CATCH_SUCCESS');
      this.drawTacticalVectors(ctx, renderState);
    }

    ctx.restore();

    // 4. Screen-space target beacon if tower (0, 0) is outside viewport
    this.drawOffscreenTargetIndicator(ctx, width, height, renderState, isDemo, locale);
  }

  private cachedSkyKey = '';
  private cachedSkyGrad: CanvasGradient | null = null;

  private drawSkyGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    altitudeY: number
  ): void {
    // Altitude blend: 0m (Starbase coastal dusk-blue) -> 25km (stratosphere) -> 80km+ (LEO space)
    const altBucket = Math.round(Math.max(0, altitudeY) / 250);
    const skyKey = `${width}x${height}x${altBucket}`;
    if (skyKey !== this.cachedSkyKey || !this.cachedSkyGrad) {
      const tSpace = Math.max(0, Math.min(1, altitudeY / 65_000));
      const tMid = Math.max(0, Math.min(1, altitudeY / 18_000));

      const lerpChannel = (a: number, b: number, t: number) =>
        Math.round(a + (b - a) * t);

      const topR = lerpChannel(18, 3, tSpace);
      const topG = lerpChannel(42, 5, tSpace);
      const topB = lerpChannel(76, 10, tSpace);

      const botR = lerpChannel(46, 8, tMid);
      const botG = lerpChannel(88, 16, tMid);
      const botB = lerpChannel(132, 34, tMid);

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, `rgb(${topR}, ${topG}, ${topB})`);
      grad.addColorStop(1, `rgb(${botR}, ${botG}, ${botB})`);
      this.cachedSkyKey = skyKey;
      this.cachedSkyGrad = grad;
    }

    ctx.fillStyle = this.cachedSkyGrad;
    ctx.fillRect(0, 0, width, height);
  }

  private drawStars(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    alpha: number
  ): void {
    ctx.save();
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const twinkle = 0.65 + 0.35 * Math.sin(this.timeAccum * 2.2 + s.phase);
      ctx.fillStyle = `rgba(226, 232, 240, ${(alpha * twinkle).toFixed(2)})`;
      ctx.fillRect(s.nx * width, s.ny * height, s.size, s.size);
    }
    ctx.restore();
  }

  private drawAltitudeGuides(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number
  ): void {
    const step =
      viewH > 4000 ? 2000 : camY > 15_000 ? 1000 : viewH > 900 ? 500 : 100;
    const minY = Math.max(0, Math.floor((camY - viewH * 0.6) / step) * step);
    const maxY = Math.ceil((camY + viewH * 0.6) / step) * step;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = Math.max(0.5, 1 / this.camZoom);
    ctx.setLineDash([6 / this.camZoom, 10 / this.camZoom]);

    for (let y = minY; y <= maxY; y += step) {
      if (y === 0) continue;
      ctx.beginPath();
      ctx.moveTo(camX - viewW * 0.6, y);
      ctx.lineTo(camX + viewW * 0.6, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGroundAndPad(
    ctx: CanvasRenderingContext2D,
    camX: number,
    viewW: number
  ): void {
    const left = camX - viewW;
    const right = camX + viewW;

    // Distant Gulf horizon strip
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(left, GROUND_Y - 120, right - left, 120);

    // Coastal terrain / concrete apron
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(left, GROUND_Y - 8, right - left, 8);

    // Orbital launch mount concrete pad around tower
    ctx.fillStyle = '#334155';
    ctx.fillRect(-55, GROUND_Y - 3, 105, 4);

    // Pad hazard stripe & flame trench recess under catch zone (x = 0)
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(-10, GROUND_Y - 2.5, 20, 2.5);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(0.4, 1.5 / this.camZoom);
    ctx.beginPath();
    ctx.moveTo(-55, GROUND_Y + 0.5);
    ctx.lineTo(50, GROUND_Y + 0.5);
    ctx.stroke();
  }

  private drawMechazillaTower(
    ctx: CanvasRenderingContext2D,
    caught: boolean,
    assistMode: AssistMode
  ): void {
    const modeCfg = getAssistModeConfig(assistMode);
    const tolX = modeCfg.catchToleranceX;
    const tolY = modeCfg.catchToleranceY;

    const towerLeft = TOWER_X;
    const towerWidth = 11;
    const towerRight = towerLeft + towerWidth;
    const topY = TOWER_TOP_Y;

    // Main structural steel truss columns
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(towerLeft, GROUND_Y, towerWidth, topY - GROUND_Y);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(0.35, 1.4 / this.camZoom);
    ctx.strokeRect(towerLeft, GROUND_Y, towerWidth, topY - GROUND_Y);

    // Cross-bracing bays
    const bayH = 10;
    ctx.beginPath();
    for (let y = GROUND_Y; y < topY; y += bayH) {
      const nextY = Math.min(topY, y + bayH);
      ctx.moveTo(towerLeft, y);
      ctx.lineTo(towerRight, nextY);
      ctx.moveTo(towerRight, y);
      ctx.lineTo(towerLeft, nextY);
      ctx.moveTo(towerLeft, nextY);
      ctx.lineTo(towerRight, nextY);
    }
    ctx.stroke();

    // Lightning arrestor mast on top of tower
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(towerLeft + towerWidth * 0.5, topY);
    ctx.lineTo(towerLeft + towerWidth * 0.5, topY + 12);
    ctx.stroke();

    // Tower top beacon light
    const blink = 0.5 + 0.5 * Math.sin(this.timeAccum * 4);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + blink * 0.6})`;
    ctx.beginPath();
    ctx.arc(towerLeft + towerWidth * 0.5, topY + 12.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Catch carriage collar sliding along tower at y = 0
    ctx.fillStyle = '#475569';
    ctx.fillRect(towerLeft - 1.5, -5, 4, 10);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(0.3, 1 / this.camZoom);
    ctx.strokeRect(towerLeft - 1.5, -5, 4, 10);

    // Chopstick arms (open wide during descent, clamp onto pin rails when caught)
    const armSpread = 1 - this.chopstickClose * 0.55;
    const armYOffset = (assistMode === 'assisted' ? 4.4 : 3.2) * armSpread;
    const tipX = assistMode === 'assisted' ? -9.5 : -7.5;

    ctx.fillStyle = caught ? '#10b981' : '#94a3b8';
    // Upper arm beam
    ctx.beginPath();
    ctx.moveTo(towerLeft - 0.5, armYOffset + 1.8);
    ctx.lineTo(tipX, armYOffset + 0.6);
    ctx.lineTo(tipX, armYOffset - 0.8);
    ctx.lineTo(towerLeft - 0.5, armYOffset - 1.4);
    ctx.closePath();
    ctx.fill();

    // Lower arm beam (drawn slightly below catch pin axis)
    ctx.fillStyle = caught ? '#059669' : '#64748b';
    ctx.beginPath();
    ctx.moveTo(towerLeft - 0.5, -armYOffset + 1.2);
    ctx.lineTo(tipX, -armYOffset + 0.6);
    ctx.lineTo(tipX, -armYOffset - 1.0);
    ctx.lineTo(towerLeft - 0.5, -armYOffset - 1.6);
    ctx.closePath();
    ctx.fill();

    // Catch Zone target reticle brackets at (0, 0)
    if (!caught) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
      ctx.lineWidth = Math.max(0.25, 1.4 / this.camZoom);
      ctx.setLineDash([2.2, 2.2]);
      ctx.strokeRect(-tolX, -tolY, tolX * 2, tolY * 2);
      ctx.setLineDash([]);

      // Center crosshair dot
      ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHoverslamIndicator(
    ctx: CanvasRenderingContext2D,
    state: RocketState,
    viewportHeight: number,
    locale: Locale
  ): void {
    const t = getTranslations(locale);
    const invZoom = 1 / this.camZoom;
    const hudClearWorldY =
      this.camY - Math.max(40, viewportHeight * 0.48 - 208) * invZoom;
    const stopY = state.hoverslamStopPinY;
    const canStop = state.hoverslamCanStop;

    const isDanger = !canStop || stopY === null || stopY < -4;
    const isBurnNow = !isDanger && stopY >= -4 && stopY <= 20;

    // Anchor along catch arm center axis (x = 0); clamp above bottom HUD console if below viewport fold
    const rawTargetY = stopY !== null ? Math.max(GROUND_Y + 4, stopY) : 0;
    const barY = Math.max(hudClearWorldY, rawTargetY);
    const halfBarWidth = Math.max(18, 42 * invZoom);

    ctx.save();

    if (isBurnNow) {
      // Green glowing horizontal target bar
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.32)';
      ctx.lineWidth = 7 * invZoom;
      ctx.beginPath();
      ctx.moveTo(-halfBarWidth, barY);
      ctx.lineTo(halfBarWidth, barY);
      ctx.stroke();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.4 * invZoom;
      ctx.beginPath();
      ctx.moveTo(-halfBarWidth, barY);
      ctx.lineTo(halfBarWidth, barY);
      ctx.stroke();
    } else if (isDanger) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.92)';
      ctx.lineWidth = 2.4 * invZoom;
      ctx.beginPath();
      ctx.moveTo(-halfBarWidth, barY);
      ctx.lineTo(halfBarWidth, barY);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.8 * invZoom;
      ctx.setLineDash([5 * invZoom, 4 * invZoom]);
      ctx.beginPath();
      ctx.moveTo(-halfBarWidth, barY);
      ctx.lineTo(halfBarWidth, barY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // End ticks for [--- BURN TARGET ---] framing
    const tickH = 5 * invZoom;
    ctx.strokeStyle = isDanger ? '#ef4444' : isBurnNow ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 2 * invZoom;
    ctx.beginPath();
    ctx.moveTo(-halfBarWidth, barY - tickH);
    ctx.lineTo(-halfBarWidth, barY + tickH);
    ctx.moveTo(halfBarWidth, barY - tickH);
    ctx.lineTo(halfBarWidth, barY + tickH);
    ctx.stroke();

    // Screen-readable upright text label centered above the horizontal target bar
    ctx.save();
    ctx.translate(0, barY + 12 * invZoom);
    ctx.scale(invZoom, -invZoom);
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    if (isBurnNow) {
      const blinkAlpha = Math.sin(this.timeAccum * 12) >= -0.25 ? 1 : 0.25;
      ctx.fillStyle = `rgba(52, 211, 153, ${blinkAlpha})`;
      ctx.fillText(t.canvas.burnNow(Math.round(stopY)), 0, 0);
    } else if (isDanger) {
      ctx.fillStyle = '#f87171';
      const detail =
        !canStop || stopY === null
          ? t.canvas.dangerNoDecel
          : `${Math.round(stopY)}m`;
      ctx.fillText(t.canvas.dangerPullUp(detail), 0, 0);
    } else {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(t.canvas.burnTarget(Math.round(stopY!)), 0, 0);
    }
    ctx.restore();

    ctx.restore();
  }

  private drawStarship(
    ctx: CanvasRenderingContext2D,
    state: RocketState,
    caught: boolean
  ): void {
    const halfL = SHIP_LENGTH / 2; // 35m
    const halfD = SHIP_DIAMETER / 2; // 4.5m

    ctx.save();
    ctx.translate(state.x, state.y);
    // World uses +y up, clockwise positive theta -> in flipped y canvas scale, rotate(-theta) rotates nose clockwise!
    ctx.rotate(-state.theta);

    // 1. Engine Plume Cone + Mach Shock Diamonds (drawn behind nozzles)
    if (state.activeEngines > 0) {
      this.drawMethanePlume(ctx, state);
    }

    // 2. Reentry plasma shockwave halo when dynamic pressure is high
    const speed = Math.hypot(state.vx, state.vy);
    if (state.dynamicPressureKpa > 6 && speed > 360) {
      const heatAlpha = Math.min(0.65, (state.dynamicPressureKpa - 6) / 30);
      ctx.strokeStyle = `rgba(251, 146, 60, ${heatAlpha.toFixed(2)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, halfD + 2.8, halfL + 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Aft & Forward Aerodynamic Flaps
    const flapArticulation = Math.max(-0.25, Math.min(0.25, state.gimbal * 1.4));
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = Math.max(0.2, 0.9 / this.camZoom);

    // Aft flaps (near bottom)
    ctx.beginPath();
    ctx.moveTo(-halfD, -halfL + 16);
    ctx.lineTo(-halfD - 4.2, -halfL + 3 + flapArticulation * 4);
    ctx.lineTo(-halfD - 4.2, -halfL + 0.5);
    ctx.lineTo(-halfD, -halfL + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(halfD, -halfL + 16);
    ctx.lineTo(halfD + 4.2, -halfL + 3 - flapArticulation * 4);
    ctx.lineTo(halfD + 4.2, -halfL + 0.5);
    ctx.lineTo(halfD, -halfL + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Forward flaps (near nose cone taper)
    ctx.beginPath();
    ctx.moveTo(-halfD + 0.4, halfL - 15);
    ctx.lineTo(-halfD - 2.6, halfL - 19);
    ctx.lineTo(-halfD - 2.2, halfL - 23);
    ctx.lineTo(-halfD, halfL - 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(halfD - 0.4, halfL - 15);
    ctx.lineTo(halfD + 2.6, halfL - 19);
    ctx.lineTo(halfD + 2.2, halfL - 23);
    ctx.lineTo(halfD, halfL - 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Stainless Steel Cylindrical Hull + Ogive Nosecone
    const hullGrad = ctx.createLinearGradient(-halfD, 0, halfD, 0);
    hullGrad.addColorStop(0, '#64748b');
    hullGrad.addColorStop(0.35, '#e2e8f0');
    hullGrad.addColorStop(0.65, '#cbd5e1');
    hullGrad.addColorStop(1, '#334155');

    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(-halfD, -halfL);
    ctx.lineTo(-halfD, halfL - 16);
    ctx.quadraticCurveTo(-halfD * 0.7, halfL - 3, 0, halfL);
    ctx.quadraticCurveTo(halfD * 0.7, halfL - 3, halfD, halfL - 16);
    ctx.lineTo(halfD, -halfL);
    ctx.closePath();
    ctx.fill();

    // Black TPS Heatshield Tiles on right/windward side
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(halfD * 0.15, -halfL);
    ctx.lineTo(halfD * 0.15, halfL - 1.5);
    ctx.quadraticCurveTo(halfD * 0.75, halfL - 4, halfD, halfL - 16);
    ctx.lineTo(halfD, -halfL);
    ctx.closePath();
    ctx.fill();

    // Subtle weld ring lines along stainless body
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = Math.max(0.18, 0.7 / this.camZoom);
    ctx.beginPath();
    for (let ry = -halfL + 10; ry < halfL - 16; ry += 10) {
      ctx.moveTo(-halfD, ry);
      ctx.lineTo(halfD, ry);
    }
    ctx.stroke();

    // 5. Upper Catch Pins (at +20m above CoM)
    ctx.fillStyle = caught ? '#10b981' : '#f59e0b';
    ctx.fillRect(-halfD - 1.3, R_CATCH_PIN - 0.8, 1.5, 1.6);
    ctx.fillRect(halfD - 0.2, R_CATCH_PIN - 0.8, 1.5, 1.6);

    // 6. Raptor Engine Nozzles at bottom (-35m), visibly gimbaled by state.gimbal
    ctx.save();
    ctx.translate(0, -halfL);
    ctx.rotate(-state.gimbal);
    const bellOffsets = [-2.4, 0, 2.4];
    for (const bx of bellOffsets) {
      ctx.fillStyle = state.activeEngines > 0 ? '#38bdf8' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(bx - 0.8, 0.2);
      ctx.lineTo(bx + 0.8, 0.2);
      ctx.lineTo(bx + 1.25, -2.4);
      ctx.lineTo(bx - 1.25, -2.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  private drawMethanePlume(
    ctx: CanvasRenderingContext2D,
    state: RocketState
  ): void {
    const halfL = SHIP_LENGTH / 2;
    const engCount = state.activeEngines;
    const flicker = 0.9 + Math.random() * 0.2;
    const plumeLen =
      (engCount === 6 ? 48 : engCount === 3 ? 33 : engCount === 2 ? 25 : 17) *
      flicker;
    const plumeWidth =
      engCount === 6 ? 6.2 : engCount === 3 ? 4.4 : engCount === 2 ? 3.4 : 2.3;

    ctx.save();
    ctx.translate(0, -halfL - 1.5);
    ctx.rotate(-state.gimbal);

    // Outer methalox blue-violet plasma envelope
    const outerGrad = ctx.createLinearGradient(0, 0, 0, -plumeLen);
    outerGrad.addColorStop(0, 'rgba(56, 189, 248, 0.92)');
    outerGrad.addColorStop(0.45, 'rgba(14, 165, 233, 0.55)');
    outerGrad.addColorStop(1, 'rgba(30, 58, 138, 0)');

    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.moveTo(-plumeWidth, 0);
    ctx.lineTo(plumeWidth, 0);
    ctx.lineTo(plumeWidth * 0.35, -plumeLen);
    ctx.lineTo(-plumeWidth * 0.35, -plumeLen);
    ctx.closePath();
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = 'rgba(224, 242, 254, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-plumeWidth * 0.45, 0);
    ctx.lineTo(plumeWidth * 0.45, 0);
    ctx.lineTo(0, -plumeLen * 0.55);
    ctx.closePath();
    ctx.fill();

    // Mach shock diamonds along plume centerline
    const diamondCount = engCount >= 3 ? 4 : 3;
    for (let d = 1; d <= diamondCount; d++) {
      const dy = -(plumeLen * 0.17 * d);
      const dw = plumeWidth * (0.45 - d * 0.06);
      const dh = plumeLen * 0.07;
      ctx.fillStyle = `rgba(240, 249, 255, ${(0.85 - d * 0.14).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, dy + dh);
      ctx.lineTo(dw, dy);
      ctx.lineTo(0, dy - dh);
      ctx.lineTo(-dw, dy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const life = 1 - p.age / p.maxAge;

      if (p.kind === 'exhaust') {
        ctx.fillStyle = `rgba(125, 211, 252, ${(life * 0.55).toFixed(3)})`;
      } else if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(203, 213, 225, ${(life * 0.36).toFixed(3)})`;
      } else if (p.kind === 'plasma') {
        ctx.fillStyle = `rgba(251, 146, 60, ${(life * 0.72).toFixed(3)})`;
      } else if (p.kind === 'fire') {
        const g = Math.round(70 + life * 140);
        ctx.fillStyle = `rgba(255, ${g}, 20, ${(life * 0.85).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(226, 232, 240, ${(life * 0.9).toFixed(3)})`;
      }

      const radius =
        p.kind === 'dust'
          ? p.size * (1 + (1 - life) * 1.8)
          : p.size * (0.4 + life * 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTacticalVectors(
    ctx: CanvasRenderingContext2D,
    state: RocketState
  ): void {
    const speed = Math.hypot(state.vx, state.vy);
    const invZoom = 1 / this.camZoom;

    // 1. Prograde velocity vector (cyan arrow from CoM)
    if (speed > 2) {
      const vDirX = state.vx / speed;
      const vDirY = state.vy / speed;
      const arrowLen = Math.min(68, 22 + speed * 0.08) * invZoom;

      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.82)';
      ctx.lineWidth = 1.6 * invZoom;
      ctx.beginPath();
      ctx.moveTo(state.x, state.y);
      ctx.lineTo(state.x + vDirX * arrowLen, state.y + vDirY * arrowLen);
      ctx.stroke();

      // Retrograde marker (-v direction)
      const rDist = 42 * invZoom;
      const rx = state.x - vDirX * rDist;
      const ry = state.y - vDirY * rDist;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.78)';
      ctx.lineWidth = 1.5 * invZoom;
      ctx.beginPath();
      ctx.arc(rx, ry, 5 * invZoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Target catch direction chevron when far from (0, 0)
    const pin = getCatchPinPosition(state);
    const dist = Math.hypot(pin.x, pin.y);
    if (dist > 60) {
      const tx = -pin.x / dist;
      const ty = -pin.y / dist;
      const markerDist = 54 * invZoom;
      const mx = state.x + tx * markerDist;
      const my = state.y + ty * markerDist;
      const angle = Math.atan2(ty, tx);

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.beginPath();
      ctx.moveTo(7 * invZoom, 0);
      ctx.lineTo(-4 * invZoom, 4.5 * invZoom);
      ctx.lineTo(-2 * invZoom, 0);
      ctx.lineTo(-4 * invZoom, -4.5 * invZoom);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawOffscreenTargetIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: RocketState,
    isDemo: boolean,
    locale: Locale
  ): void {
    const t = getTranslations(locale);
    // Project catch origin (0, 0) to screen pixels
    const screenX = width * 0.5 + (0 - this.camX) * this.camZoom;
    const screenY = height * 0.52 - (0 - this.camY) * this.camZoom;

    const pad = 48;
    const bottomReserve = isDemo ? 235 : 175;
    const inBounds =
      screenX >= pad &&
      screenX <= width - pad &&
      screenY >= pad &&
      screenY <= height - bottomReserve;

    if (inBounds) return;

    const dx = screenX - width * 0.5;
    const dy = screenY - height * 0.5;
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.max(pad, Math.min(width - pad, screenX));
    const clampedY = Math.max(pad, Math.min(height - bottomReserve, screenY));
    const pin = getCatchPinPosition(state);
    const distM = Math.hypot(pin.x, pin.y);

    ctx.save();
    ctx.translate(clampedX, clampedY);

    // Directional chevron
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#a7f3d0';
    ctx.textAlign = 'center';
    const formattedDist =
      distM >= 1000
        ? `${(distM / 1000).toFixed(1)} km`
        : `${Math.round(distM)} m`;
    ctx.fillText(t.canvas.lzDistance(formattedDist), 0, 22);
    ctx.restore();
  }
}
