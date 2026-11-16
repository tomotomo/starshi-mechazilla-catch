import {
  AERO_DAMP_COEFF,
  AREA_BASE,
  AREA_SIDE,
  CD_COEFF,
  CL_COEFF,
  DRY_MASS,
  EXHAUST_VELOCITY,
  G0,
  getAssistModeConfig,
  GIMBAL_RATE_RAD,
  GIMBAL_RETURN_RATE_RAD,
  GRIDFIN_TORQUE_COEFF,
  GROUND_Y,
  MAX_GIMBAL_RAD,
  ORBITAL_EFFECTIVE_RADIUS,
  R_CATCH_PIN,
  R_ENGINE,
  R_NOSE,
  RCS_TORQUE,
  RHO_0,
  SCALE_HEIGHT,
  SHIP_DIAMETER,
  SHIP_LENGTH,
  TOWER_STRUCTURE_MIN_X,
  TOWER_TOP_Y,
  UNIT_THRUST,
} from './constants';
import { formatOutcomeReason, type Locale } from './i18n';
import type {
  AssistMode,
  ControlInput,
  EngineCount,
  OutcomeKind,
  RocketState,
  ScoreBreakdown,
  StageConfig,
  TelemetryFrame,
} from './types';

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Normalize angle to [-PI, PI]
 */
export function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function atmosphericDensity(altitudeY: number): number {
  const effectiveAlt = Math.max(0, altitudeY - GROUND_Y);
  return RHO_0 * Math.exp(-effectiveAlt / SCALE_HEIGHT);
}

/**
 * Computes normalized reentry bow-shock plasma intensity [0, 1] using a
 * convective heat-flux proxy proportional to sqrt(rho) * v^3 so hypersonic
 * upper-atmosphere ionization appears realistically from ~100 km down to ~25 km.
 */
export function computeReentryPlasmaIntensity(
  altitudeY: number,
  speed: number
): number {
  if (speed <= 360) return 0;
  const rho = atmosphericDensity(altitudeY);
  const heatFlux = Math.sqrt(rho / RHO_0) * Math.pow(speed / 1000, 3);
  return Math.max(0, Math.min(1, (heatFlux - 0.014) / 0.24));
}

export function getCatchPinPosition(state: Pick<RocketState, 'x' | 'y' | 'theta'>): {
  x: number;
  y: number;
} {
  return {
    x: state.x + R_CATCH_PIN * Math.sin(state.theta),
    y: state.y + R_CATCH_PIN * Math.cos(state.theta),
  };
}

export function getBottomPosition(state: Pick<RocketState, 'x' | 'y' | 'theta'>): {
  x: number;
  y: number;
} {
  return {
    x: state.x - R_ENGINE * Math.sin(state.theta),
    y: state.y - R_ENGINE * Math.cos(state.theta),
  };
}

export function getNosePosition(state: Pick<RocketState, 'x' | 'y' | 'theta'>): {
  x: number;
  y: number;
} {
  return {
    x: state.x + R_NOSE * Math.sin(state.theta),
    y: state.y + R_NOSE * Math.cos(state.theta),
  };
}

export function getEffectiveInitialFuelKg(
  stage: StageConfig,
  assistMode: AssistMode = 'realistic'
): number {
  return Math.round(stage.initialFuelKg * getAssistModeConfig(assistMode).fuelFactor);
}

export function createInitialRocketState(
  stage: StageConfig,
  assistMode: AssistMode = 'realistic'
): RocketState {
  const state: RocketState = {
    x: stage.initialX,
    y: stage.initialY,
    vx: stage.initialVx,
    vy: stage.initialVy,
    theta: degToRad(stage.initialThetaDeg),
    omega: 0,
    gimbal: 0,
    fuelMass: getEffectiveInitialFuelKg(stage, assistMode),
    selectedEngines: 3,
    throttleOn: false,
    activeEngines: 0,
    time: 0,
    ax: 0,
    ay: 0,
    gForce: 0,
    dynamicPressureKpa: 0,
    hoverslamStopPinY: null,
    hoverslamCanStop: true,
    hoverslamStopPinY3: null,
    hoverslam3CanStop: true,
  };
  const predCurrent = estimateHoverslamPrediction(state, state.selectedEngines);
  const pred3 = estimateHoverslamPrediction(state, 3);
  state.hoverslamStopPinY = predCurrent.stopPinY;
  state.hoverslamCanStop = predCurrent.canStop;
  state.hoverslamStopPinY3 = pred3.stopPinY;
  state.hoverslam3CanStop = pred3.canStop;
  return state;
}

export interface HoverslamPrediction {
  stopPinY: number | null;
  canStop: boolean;
}

/**
 * Estimates the catch-pin Y altitude where vertical velocity would reach 0
 * if burning `engineCount` engines upright from the current state.
 * Also flags `canStop = false` when net deceleration <= 0 or fuel is depleted.
 */
export function estimateHoverslamPrediction(
  state: Pick<RocketState, 'y' | 'theta' | 'vy' | 'fuelMass'>,
  engineCount: 1 | 2 | 3 | 6 = 3
): HoverslamPrediction {
  if (state.vy >= -0.5) {
    return { stopPinY: null, canStop: true };
  }
  if (state.fuelMass <= 0) {
    return { stopPinY: null, canStop: false };
  }
  const totalMass = DRY_MASS + state.fuelMass;
  const thrustAcc = (engineCount * UNIT_THRUST) / totalMass;
  const netDecel = thrustAcc - G0;
  if (netDecel <= 0.05) {
    return { stopPinY: null, canStop: false };
  }

  const stopDist = (state.vy * state.vy) / (2 * netDecel);
  const pinY = state.y + R_CATCH_PIN * Math.cos(state.theta);
  return { stopPinY: pinY - stopDist, canStop: true };
}

export function estimateHoverslamStopPinY(
  state: Pick<RocketState, 'y' | 'theta' | 'vy' | 'fuelMass'>,
  engineCount: 1 | 2 | 3 | 6 = 3
): number | null {
  return estimateHoverslamPrediction(state, engineCount).stopPinY;
}

/**
 * Advances rigid-body rocket physics by `dt` seconds.
 * Coordinate convention:
 * - +x right, +y up
 * - theta = 0 upright (+y), clockwise positive
 * - gimbalLeft (A / ArrowLeft) -> positive gimbal -> nozzle pushes tail right -> counter-clockwise torque (theta decreases)
 * - gimbalRight (D / ArrowRight) -> negative gimbal -> nozzle pushes tail left -> clockwise torque (theta increases)
 */
export function stepRocketPhysics(
  prev: RocketState,
  input: ControlInput,
  dt: number
): RocketState {
  const totalMass = DRY_MASS + prev.fuelMass;
  const inertia = (1 / 12) * totalMass * SHIP_LENGTH * SHIP_LENGTH;

  // 1. Update gimbal angle smoothly
  let targetGimbal = 0;
  if (input.gimbalLeft && !input.gimbalRight) {
    targetGimbal = MAX_GIMBAL_RAD;
  } else if (input.gimbalRight && !input.gimbalLeft) {
    targetGimbal = -MAX_GIMBAL_RAD;
  }

  let gimbal = prev.gimbal;
  const gimbalDiff = targetGimbal - gimbal;
  const rate = targetGimbal === 0 ? GIMBAL_RETURN_RATE_RAD : GIMBAL_RATE_RAD;
  const maxDelta = rate * dt;
  if (Math.abs(gimbalDiff) <= maxDelta) {
    gimbal = targetGimbal;
  } else {
    gimbal += Math.sign(gimbalDiff) * maxDelta;
  }

  // 2. Engine thrust & propellant consumption
  const hasFuel = prev.fuelMass > 0;
  const activeEngines: 0 | 1 | 2 | 3 | 6 =
    input.throttleHold && hasFuel ? prev.selectedEngines : 0;

  let thrustForce = 0;
  let nextFuelMass = prev.fuelMass;
  if (activeEngines > 0) {
    thrustForce = activeEngines * UNIT_THRUST;
    const massFlowRate = thrustForce / EXHAUST_VELOCITY;
    const burned = massFlowRate * dt;
    if (burned >= prev.fuelMass) {
      // Scale final frame thrust proportionally to remaining propellant
      const frac = prev.fuelMass / burned;
      thrustForce *= frac;
      nextFuelMass = 0;
    } else {
      nextFuelMass = prev.fuelMass - burned;
    }
  }

  // Thrust vector in world frame
  const thrustFx = thrustForce * Math.sin(prev.theta + gimbal);
  const thrustFy = thrustForce * Math.cos(prev.theta + gimbal);

  // Gimbal torque: tau = -F_T * sin(gimbal) * r_engine
  const thrustTorque = -thrustForce * Math.sin(gimbal) * R_ENGINE;

  // 3. Atmospheric density & aerodynamic drag
  const rho = atmosphericDensity(prev.y);
  const speedSq = prev.vx * prev.vx + prev.vy * prev.vy;
  const speed = Math.sqrt(speedSq);

  let dragFx = 0;
  let dragFy = 0;
  let liftFx = 0;
  let liftFy = 0;
  let dynamicPressurePa = 0;

  if (speed > 1e-4) {
    const ux = Math.sin(prev.theta);
    const uy = Math.cos(prev.theta);
    const vHatX = prev.vx / speed;
    const vHatY = prev.vy / speed;

    // Angle of attack alpha between ship axis and velocity vector
    const uDotV = Math.max(-1, Math.min(1, ux * vHatX + uy * vHatY));
    const absCosAlpha = Math.abs(uDotV);
    const absSinAlpha = Math.sqrt(Math.max(0, 1 - absCosAlpha * absCosAlpha));

    const projectedArea = AREA_BASE * absCosAlpha + AREA_SIDE * absSinAlpha;
    dynamicPressurePa = 0.5 * rho * speedSq;
    const dragMag = dynamicPressurePa * CD_COEFF * projectedArea;

    dragFx = -dragMag * vHatX;
    dragFy = -dragMag * vHatY;

    // Cross-flow aerodynamic body/flap lift perpendicular to velocity vector
    const uPerpX = ux - uDotV * vHatX;
    const uPerpY = uy - uDotV * vHatY;
    const liftScale = dynamicPressurePa * CL_COEFF * AREA_SIDE * uDotV;
    liftFx = liftScale * uPerpX;
    liftFy = liftScale * uPerpY;
  }

  // 4. Aerodynamic rotational damping + gridfin/RCS attitude control
  const gimbalControlRatio = gimbal / MAX_GIMBAL_RAD; // +1 for left (CCW), -1 for right (CW)
  const airspeedFactor = Math.min(2.5, Math.max(0.35, speed / 90));
  const gridfinTorque =
    -gimbalControlRatio * (rho / RHO_0) * GRIDFIN_TORQUE_COEFF * airspeedFactor;
  const rcsTorque = -gimbalControlRatio * RCS_TORQUE;
  const aeroDampTorque = -AERO_DAMP_COEFF * (rho / RHO_0) * prev.omega;

  const totalTorque = thrustTorque + gridfinTorque + rcsTorque + aeroDampTorque;

  // 5. Net forces and integration (Semi-implicit Euler for energy stability)
  const netNonGravFx = thrustFx + dragFx + liftFx;
  const netNonGravFy = thrustFy + dragFy + liftFy;

  const axNonGrav = netNonGravFx / totalMass;
  const ayNonGrav = netNonGravFy / totalMass;

  // Smooth orbital centrifugal relief for high horizontal speeds (vx > 380 m/s),
  // preserving vy = 0 circular orbit equilibrium at 200km+ without affecting 3km/10km/50km stages.
  const orbS = Math.max(0, Math.min(1, (Math.abs(prev.vx) - 380) / (650 - 380)));
  const orbBlend = orbS * orbS * (3 - 2 * orbS);
  const centrifugalAcc =
    orbBlend * ((prev.vx * prev.vx) / ORBITAL_EFFECTIVE_RADIUS);

  const totalAx = axNonGrav;
  const totalAy = ayNonGrav - G0 + centrifugalAcc;
  const alphaAng = totalTorque / inertia;

  const nextVx = prev.vx + totalAx * dt;
  const nextVy = prev.vy + totalAy * dt;
  const nextX = prev.x + nextVx * dt;
  const nextY = prev.y + nextVy * dt;

  const nextOmega = prev.omega + alphaAng * dt;
  const nextTheta = normalizeAngle(prev.theta + nextOmega * dt);

  const feltG = Math.hypot(axNonGrav, ayNonGrav) / G0;

  const nextState: RocketState = {
    x: nextX,
    y: nextY,
    vx: nextVx,
    vy: nextVy,
    theta: nextTheta,
    omega: nextOmega,
    gimbal,
    fuelMass: nextFuelMass,
    selectedEngines: prev.selectedEngines,
    throttleOn: activeEngines > 0,
    activeEngines,
    time: prev.time + dt,
    ax: axNonGrav,
    ay: ayNonGrav,
    gForce: feltG,
    dynamicPressureKpa: dynamicPressurePa / 1000,
    hoverslamStopPinY: null,
    hoverslamCanStop: true,
    hoverslamStopPinY3: null,
    hoverslam3CanStop: true,
  };

  const predCurrent = estimateHoverslamPrediction(nextState, prev.selectedEngines);
  const pred3 = estimateHoverslamPrediction(nextState, 3);
  nextState.hoverslamStopPinY = predCurrent.stopPinY;
  nextState.hoverslamCanStop = predCurrent.canStop;
  nextState.hoverslamStopPinY3 = pred3.stopPinY;
  nextState.hoverslam3CanStop = pred3.canStop;

  return nextState;
}

/**
 * Interpolates kinematic state between two consecutive fixed-timestep physics
 * states so high-speed flight (e.g. 1,500 m/s in LEO) renders smoothly across
 * variable rAF intervals and 60Hz/120Hz/144Hz displays without step-aliasing jitter.
 */
export function interpolateRocketState(
  prev: RocketState,
  curr: RocketState,
  alpha: number
): RocketState {
  const t = Math.max(0, Math.min(1, alpha));
  if (t <= 0) return prev;
  if (t >= 1) return curr;

  const lerp = (a: number, b: number) => a + (b - a) * t;
  const thetaDiff = normalizeAngle(curr.theta - prev.theta);

  return {
    ...curr,
    x: lerp(prev.x, curr.x),
    y: lerp(prev.y, curr.y),
    vx: lerp(prev.vx, curr.vx),
    vy: lerp(prev.vy, curr.vy),
    theta: normalizeAngle(prev.theta + thetaDiff * t),
    gimbal: lerp(prev.gimbal, curr.gimbal),
    dynamicPressureKpa: lerp(prev.dynamicPressureKpa, curr.dynamicPressureKpa),
    hoverslamStopPinY:
      prev.hoverslamStopPinY !== null && curr.hoverslamStopPinY !== null
        ? lerp(prev.hoverslamStopPinY, curr.hoverslamStopPinY)
        : curr.hoverslamStopPinY,
    hoverslamStopPinY3:
      prev.hoverslamStopPinY3 !== null && curr.hoverslamStopPinY3 !== null
        ? lerp(prev.hoverslamStopPinY3, curr.hoverslamStopPinY3)
        : curr.hoverslamStopPinY3,
  };
}

export interface CollisionCheckResult {
  terminated: boolean;
  outcome: OutcomeKind | null;
  reason: string;
  pinDeltaX: number;
  pinDeltaY: number;
  impactSpeed: number;
}

export function evaluateOutcome(
  state: RocketState,
  assistMode: AssistMode = 'realistic',
  locale: Locale = 'ja'
): CollisionCheckResult {
  const cfg = getAssistModeConfig(assistMode);
  const pin = getCatchPinPosition(state);
  const bot = getBottomPosition(state);
  const nose = getNosePosition(state);
  const speed = Math.hypot(state.vx, state.vy);
  const pitchDeg = Math.abs(radToDeg(state.theta));
  const omegaDeg = Math.abs(radToDeg(state.omega));

  // 1. Check Catch Zone conditions first when pin is inside chopstick envelope
  const inCatchX = Math.abs(pin.x) <= cfg.catchToleranceX;
  const inCatchY = Math.abs(pin.y) <= cfg.catchToleranceY;

  if (inCatchX && inCatchY) {
    const velOk =
      Math.abs(state.vy) <= cfg.catchMaxVy && Math.abs(state.vx) <= cfg.catchMaxVx;
    const attitudeOk =
      pitchDeg <= cfg.catchMaxThetaDeg && omegaDeg <= cfg.catchMaxOmegaDeg;

    if (velOk && attitudeOk) {
      return {
        terminated: true,
        outcome: 'CATCH_SUCCESS',
        reason: formatOutcomeReason('CATCH_SUCCESS', locale, {
          vx: state.vx,
          vy: state.vy,
          pitchDeg,
          maxShipX: state.x,
          shipY: state.y,
          speed,
          pinX: pin.x,
        }),
        pinDeltaX: pin.x,
        pinDeltaY: pin.y,
        impactSpeed: speed,
      };
    }

    // Arm collision if descending past center at unsafe speed or severely tilted inside arm gap
    const unsafeSpeedPass = pin.y <= 0 && Math.abs(state.vy) > 18;
    const unsafeTiltInsideArms =
      pitchDeg > Math.max(18, cfg.catchMaxThetaDeg + 6) && pin.y <= 2.5;
    const fallingOutBottom =
      pin.y <= -(cfg.catchToleranceY - 0.6) && state.vy < -cfg.catchMaxVy;

    if (unsafeSpeedPass || unsafeTiltInsideArms || fallingOutBottom) {
      return {
        terminated: true,
        outcome: 'RUD_CATCH_FAIL',
        reason: formatOutcomeReason('RUD_CATCH_FAIL', locale, {
          vx: state.vx,
          vy: state.vy,
          pitchDeg,
          maxShipX: state.x,
          shipY: state.y,
          speed,
          pinX: pin.x,
        }),
        pinDeltaX: pin.x,
        pinDeltaY: pin.y,
        impactSpeed: speed,
      };
    }
  }

  // 2. Tower collision check (tower truss spans x in [TOWER_STRUCTURE_MIN_X, TOWER_MAX_X], y <= TOWER_TOP_Y)
  const halfWidth = SHIP_DIAMETER / 2;
  const maxShipX = Math.max(pin.x, state.x, bot.x, nose.x) + halfWidth;
  const minShipX = Math.min(pin.x, state.x, bot.x, nose.x) - halfWidth;
  const minShipY = Math.min(bot.y, nose.y);
  const maxShipY = Math.max(bot.y, nose.y);
  const towerMaxX = 24.0;

  if (
    maxShipX > TOWER_STRUCTURE_MIN_X &&
    minShipX < towerMaxX &&
    minShipY < TOWER_TOP_Y &&
    maxShipY > GROUND_Y
  ) {
    return {
      terminated: true,
      outcome: 'RUD_TOWER',
      reason: formatOutcomeReason('RUD_TOWER', locale, {
        vx: state.vx,
        vy: state.vy,
        pitchDeg: radToDeg(state.theta),
        maxShipX,
        shipY: state.y,
        speed,
        pinX: pin.x,
      }),
      pinDeltaX: pin.x,
      pinDeltaY: pin.y,
      impactSpeed: speed,
    };
  }

  // 3. Ground impact check
  if (bot.y <= GROUND_Y || nose.y <= GROUND_Y || state.y <= GROUND_Y) {
    return {
      terminated: true,
      outcome: 'RUD_GROUND',
      reason: formatOutcomeReason('RUD_GROUND', locale, {
        vx: state.vx,
        vy: state.vy,
        pitchDeg: radToDeg(state.theta),
        maxShipX,
        shipY: state.y,
        speed,
        pinX: pin.x,
      }),
      pinDeltaX: pin.x,
      pinDeltaY: pin.y,
      impactSpeed: speed,
    };
  }

  return {
    terminated: false,
    outcome: null,
    reason: '',
    pinDeltaX: pin.x,
    pinDeltaY: pin.y,
    impactSpeed: speed,
  };
}

export function calculateScore(
  state: RocketState,
  stage: StageConfig,
  assistMode: AssistMode = 'realistic'
): ScoreBreakdown {
  const cfg = getAssistModeConfig(assistMode);
  const initialFuelKg = getEffectiveInitialFuelKg(stage, assistMode);

  const pin = getCatchPinPosition(state);
  const distanceErrorM = Math.hypot(pin.x, pin.y);
  const dMax = Math.hypot(cfg.catchToleranceX, cfg.catchToleranceY);
  const positionScore = Math.max(
    0,
    3000 * Math.pow(Math.max(0, 1 - distanceErrorM / dMax), 2)
  );

  const catchSpeedMs = Math.hypot(state.vx, state.vy);
  const vMax = Math.hypot(cfg.catchMaxVx, cfg.catchMaxVy);
  const pitchErrorDeg = Math.abs(radToDeg(state.theta));

  const velComponent =
    3000 * Math.pow(Math.max(0, 1 - catchSpeedMs / vMax), 2);
  const attitudeComponent =
    1000 * Math.max(0, 1 - pitchErrorDeg / cfg.catchMaxThetaDeg);
  const velocityScore = velComponent + attitudeComponent;

  const remainingFuelRatio =
    initialFuelKg > 0 ? state.fuelMass / initialFuelKg : 0;
  const fuelScore = Math.min(
    3000,
    3000 * (remainingFuelRatio / cfg.fuelFullScoreRatio)
  );

  const baseScore = positionScore + velocityScore + fuelScore;
  const totalScore = Math.round(baseScore * stage.multiplier * cfg.modeMultiplier);

  return {
    positionScore: Math.round(positionScore),
    velocityScore: Math.round(velocityScore),
    fuelScore: Math.round(fuelScore),
    baseScore: Math.round(baseScore),
    multiplier: stage.multiplier,
    modeMultiplier: cfg.modeMultiplier,
    totalScore,
    distanceErrorM,
    catchSpeedMs,
    pitchErrorDeg,
    remainingFuelPct: remainingFuelRatio * 100,
  };
}

export function toTelemetryFrame(
  state: RocketState,
  stage: StageConfig,
  assistMode: AssistMode = 'realistic'
): TelemetryFrame {
  const initialFuelKg = getEffectiveInitialFuelKg(stage, assistMode);
  const pin = getCatchPinPosition(state);
  const speed = Math.hypot(state.vx, state.vy);
  return {
    time: Number(state.time.toFixed(2)),
    altitude: pin.y,
    horizontalPos: pin.x,
    velY: state.vy,
    velX: state.vx,
    speed,
    pitchDeg: radToDeg(state.theta),
    gimbalDeg: radToDeg(state.gimbal),
    activeEngines: state.activeEngines,
    selectedEngines: state.selectedEngines,
    fuelMass: state.fuelMass,
    fuelPct: initialFuelKg > 0 ? (state.fuelMass / initialFuelKg) * 100 : 0,
    gForce: state.gForce,
    dynamicPress: state.dynamicPressureKpa,
  };
}

function coerceActiveEngines(value: number): 0 | 1 | 2 | 3 | 6 {
  if (value === 1 || value === 2 || value === 3 || value === 6) {
    return value;
  }
  return 0;
}

function coerceSelectedEngines(
  selected: EngineCount | undefined,
  active: 0 | 1 | 2 | 3 | 6
): EngineCount {
  if (selected === 1 || selected === 2 || selected === 3 || selected === 6) {
    return selected;
  }
  if (active === 1 || active === 2 || active === 3 || active === 6) {
    return active;
  }
  return 3;
}

/**
 * Reconstructs a full RocketState at an arbitrary flight timestamp `timeSec`
 * by binary-searching and interpolating recorded TelemetryFrame samples.
 */
export function reconstructRocketStateAtTime(
  frames: TelemetryFrame[],
  timeSec: number,
  stage: StageConfig,
  assistMode: AssistMode = 'realistic'
): RocketState {
  if (frames.length === 0) {
    return createInitialRocketState(stage, assistMode);
  }

  const firstTime = frames[0].time;
  const lastIndex = frames.length - 1;
  const lastTime = frames[lastIndex].time;
  const targetTime = Math.max(firstTime, Math.min(lastTime, timeSec));

  let f0 = frames[0];
  let f1 = frames[0];
  let alpha = 0;

  if (frames.length >= 2) {
    if (targetTime >= lastTime) {
      f0 = frames[lastIndex - 1];
      f1 = frames[lastIndex];
      alpha = 1;
    } else if (targetTime > firstTime) {
      let lo = 0;
      let hi = lastIndex - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].time <= targetTime && targetTime <= frames[mid + 1].time) {
          lo = mid;
          break;
        }
        if (frames[mid].time < targetTime) {
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const idx = Math.max(0, Math.min(lastIndex - 1, lo));
      f0 = frames[idx];
      f1 = frames[idx + 1];
      const span = f1.time - f0.time;
      alpha = span > 1e-6 ? Math.max(0, Math.min(1, (targetTime - f0.time) / span)) : 0;
    } else {
      f0 = frames[0];
      f1 = frames[1];
      alpha = 0;
    }
  }

  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const theta0 = degToRad(f0.pitchDeg);
  const theta1 = degToRad(f1.pitchDeg);
  const thetaDiff = normalizeAngle(theta1 - theta0);
  const theta = normalizeAngle(theta0 + thetaDiff * alpha);
  const dt = f1.time - f0.time;
  const omega = dt > 1e-6 ? thetaDiff / dt : 0;
  const gimbal = degToRad(lerp(f0.gimbalDeg, f1.gimbalDeg));

  const pinX = lerp(f0.horizontalPos, f1.horizontalPos);
  const pinY = lerp(f0.altitude, f1.altitude);
  const x = pinX - R_CATCH_PIN * Math.sin(theta);
  const y = pinY - R_CATCH_PIN * Math.cos(theta);

  const vx = lerp(f0.velX, f1.velX);
  const vy = lerp(f0.velY, f1.velY);
  const fuelMass = lerp(f0.fuelMass, f1.fuelMass);
  const gForce = lerp(f0.gForce, f1.gForce);
  const dynamicPressureKpa = lerp(f0.dynamicPress, f1.dynamicPress);

  const discreteFrame = alpha < 1 ? f0 : f1;
  const activeEngines = coerceActiveEngines(discreteFrame.activeEngines);
  const selectedEngines = coerceSelectedEngines(
    discreteFrame.selectedEngines,
    activeEngines
  );

  const state: RocketState = {
    x,
    y,
    vx,
    vy,
    theta,
    omega,
    gimbal,
    fuelMass,
    selectedEngines,
    throttleOn: activeEngines > 0,
    activeEngines,
    time: targetTime,
    ax: 0,
    ay: 0,
    gForce,
    dynamicPressureKpa,
    hoverslamStopPinY: null,
    hoverslamCanStop: true,
    hoverslamStopPinY3: null,
    hoverslam3CanStop: true,
  };

  const predCurrent = estimateHoverslamPrediction(state, selectedEngines);
  const pred3 = estimateHoverslamPrediction(state, 3);
  state.hoverslamStopPinY = predCurrent.stopPinY;
  state.hoverslamCanStop = predCurrent.canStop;
  state.hoverslamStopPinY3 = pred3.stopPinY;
  state.hoverslam3CanStop = pred3.canStop;

  return state;
}
