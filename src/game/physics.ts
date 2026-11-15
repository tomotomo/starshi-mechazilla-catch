import {
  AERO_DAMP_COEFF,
  AREA_BASE,
  AREA_SIDE,
  CATCH_MAX_OMEGA_DEG,
  CATCH_MAX_THETA_DEG,
  CATCH_MAX_VX,
  CATCH_MAX_VY,
  CATCH_TOLERANCE_X,
  CATCH_TOLERANCE_Y,
  CD_COEFF,
  CL_COEFF,
  DRY_MASS,
  EXHAUST_VELOCITY,
  G0,
  GIMBAL_RATE_RAD,
  GIMBAL_RETURN_RATE_RAD,
  GRIDFIN_TORQUE_COEFF,
  GROUND_Y,
  MAX_GIMBAL_RAD,
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
import type {
  ControlInput,
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

export function createInitialRocketState(stage: StageConfig): RocketState {
  const state: RocketState = {
    x: stage.initialX,
    y: stage.initialY,
    vx: stage.initialVx,
    vy: stage.initialVy,
    theta: degToRad(stage.initialThetaDeg),
    omega: 0,
    gimbal: 0,
    fuelMass: stage.initialFuelKg,
    selectedEngines: 3,
    throttleOn: false,
    activeEngines: 0,
    time: 0,
    ax: 0,
    ay: 0,
    gForce: 0,
    dynamicPressureKpa: 0,
    hoverslamStopPinY: null,
  };
  state.hoverslamStopPinY = estimateHoverslamStopPinY(state, 3);
  return state;
}

/**
 * Estimates the catch-pin Y altitude where vertical velocity would reach 0
 * if burning `engineCount` engines upright from the current state.
 * Used as a HUD reference indicator for Suicide Burn / Hoverslam timing.
 */
export function estimateHoverslamStopPinY(
  state: Pick<RocketState, 'y' | 'theta' | 'vy' | 'fuelMass'>,
  engineCount: 1 | 2 | 3 | 6 = 3
): number | null {
  if (state.vy >= -0.5 || state.fuelMass <= 0) {
    return null;
  }
  const totalMass = DRY_MASS + state.fuelMass;
  const thrustAcc = (engineCount * UNIT_THRUST) / totalMass;
  const netDecel = thrustAcc - G0;
  if (netDecel <= 0.1) return null;

  const stopDist = (state.vy * state.vy) / (2 * netDecel);
  const pinY = state.y + R_CATCH_PIN * Math.cos(state.theta);
  return pinY - stopDist;
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

  const totalAx = axNonGrav;
  const totalAy = ayNonGrav - G0;
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
  };

  nextState.hoverslamStopPinY = estimateHoverslamStopPinY(
    nextState,
    prev.selectedEngines
  );

  return nextState;
}

export interface CollisionCheckResult {
  terminated: boolean;
  outcome: OutcomeKind | null;
  reason: string;
  pinDeltaX: number;
  pinDeltaY: number;
  impactSpeed: number;
}

export function evaluateOutcome(state: RocketState): CollisionCheckResult {
  const pin = getCatchPinPosition(state);
  const bot = getBottomPosition(state);
  const nose = getNosePosition(state);
  const speed = Math.hypot(state.vx, state.vy);
  const pitchDeg = Math.abs(radToDeg(state.theta));
  const omegaDeg = Math.abs(radToDeg(state.omega));

  // 1. Check Catch Zone conditions first when pin is inside chopstick envelope
  const inCatchX = Math.abs(pin.x) <= CATCH_TOLERANCE_X;
  const inCatchY = Math.abs(pin.y) <= CATCH_TOLERANCE_Y;

  if (inCatchX && inCatchY) {
    const velOk =
      Math.abs(state.vy) <= CATCH_MAX_VY && Math.abs(state.vx) <= CATCH_MAX_VX;
    const attitudeOk =
      pitchDeg <= CATCH_MAX_THETA_DEG && omegaDeg <= CATCH_MAX_OMEGA_DEG;

    if (velOk && attitudeOk) {
      return {
        terminated: true,
        outcome: 'CATCH_SUCCESS',
        reason: 'Mechazilla Chopstick Catch Confirmed',
        pinDeltaX: pin.x,
        pinDeltaY: pin.y,
        impactSpeed: speed,
      };
    }

    // Arm collision if descending past center at unsafe speed or severely tilted inside arm gap
    const unsafeSpeedPass = pin.y <= 0 && Math.abs(state.vy) > 18;
    const unsafeTiltInsideArms = pitchDeg > 18 && pin.y <= 2.5;
    const fallingOutBottom = pin.y <= -3.4 && state.vy < -CATCH_MAX_VY;

    if (unsafeSpeedPass || unsafeTiltInsideArms || fallingOutBottom) {
      return {
        terminated: true,
        outcome: 'RUD_CATCH_FAIL',
        reason: `Catch Arm Impact: |vx|=${Math.abs(state.vx).toFixed(1)} m/s, |vy|=${Math.abs(state.vy).toFixed(1)} m/s, Pitch=${pitchDeg.toFixed(1)}°`,
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
      reason: `Launch Tower Collision at x=${maxShipX.toFixed(1)}m, y=${state.y.toFixed(1)}m (${speed.toFixed(1)} m/s)`,
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
      reason: `Ground Pad Impact at ${speed.toFixed(1)} m/s (Δx=${pin.x.toFixed(1)}m, Pitch=${radToDeg(state.theta).toFixed(1)}°)`,
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
  stage: StageConfig
): ScoreBreakdown {
  const pin = getCatchPinPosition(state);
  const distanceErrorM = Math.hypot(pin.x, pin.y);
  const dMax = Math.hypot(CATCH_TOLERANCE_X, CATCH_TOLERANCE_Y); // ~5.65685m
  const positionScore = Math.max(
    0,
    3000 * Math.pow(Math.max(0, 1 - distanceErrorM / dMax), 2)
  );

  const catchSpeedMs = Math.hypot(state.vx, state.vy);
  const vMax = Math.hypot(CATCH_MAX_VX, CATCH_MAX_VY); // ~2.9155m/s
  const pitchErrorDeg = Math.abs(radToDeg(state.theta));

  const velComponent =
    3000 * Math.pow(Math.max(0, 1 - catchSpeedMs / vMax), 2);
  const attitudeComponent =
    1000 * Math.max(0, 1 - pitchErrorDeg / CATCH_MAX_THETA_DEG);
  const velocityScore = velComponent + attitudeComponent;

  const remainingFuelRatio =
    stage.initialFuelKg > 0 ? state.fuelMass / stage.initialFuelKg : 0;
  const fuelScore = Math.min(3000, 3000 * (remainingFuelRatio / 0.08));

  const baseScore = positionScore + velocityScore + fuelScore;
  const totalScore = Math.round(baseScore * stage.multiplier);

  return {
    positionScore: Math.round(positionScore),
    velocityScore: Math.round(velocityScore),
    fuelScore: Math.round(fuelScore),
    baseScore: Math.round(baseScore),
    multiplier: stage.multiplier,
    totalScore,
    distanceErrorM,
    catchSpeedMs,
    pitchErrorDeg,
    remainingFuelPct: remainingFuelRatio * 100,
  };
}

export function toTelemetryFrame(
  state: RocketState,
  stage: StageConfig
): TelemetryFrame {
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
    fuelMass: state.fuelMass,
    fuelPct:
      stage.initialFuelKg > 0
        ? (state.fuelMass / stage.initialFuelKg) * 100
        : 0,
    gForce: state.gForce,
    dynamicPress: state.dynamicPressureKpa,
  };
}
