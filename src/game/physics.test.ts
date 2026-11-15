import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRY_MASS,
  EXHAUST_VELOCITY,
  FIXED_DT,
  G0,
  GROUND_Y,
  MAX_GIMBAL_DEG,
  STAGES,
  UNIT_THRUST,
} from './constants';
import {
  atmosphericDensity,
  calculateScore,
  createInitialRocketState,
  degToRad,
  evaluateOutcome,
  getCatchPinPosition,
  radToDeg,
  stepRocketPhysics,
} from './physics';
import { computeEasyDemoGuidance } from './autopilot';
import type { ControlInput, RocketState } from './types';

const NO_INPUT: ControlInput = {
  gimbalLeft: false,
  gimbalRight: false,
  throttleHold: false,
};

test('atmospheric density decreases exponentially with altitude', () => {
  const seaLevel = atmosphericDensity(GROUND_Y);
  const highAlt = atmosphericDensity(GROUND_Y + 8500);
  assert.ok(Math.abs(seaLevel - 1.225) < 1e-6);
  assert.ok(Math.abs(highAlt - 1.225 / Math.E) < 1e-4);
});

test('Raptor engine thrust and propellant consumption follow Tsiolkovsky equation', () => {
  const stage = STAGES[0];
  const s0 = createInitialRocketState(stage);
  s0.theta = 0;
  s0.omega = 0;
  s0.vx = 0;
  s0.vy = 0;
  s0.y = 50000; // Near vacuum so drag is negligible
  s0.selectedEngines = 3;

  const s1 = stepRocketPhysics(
    s0,
    { gimbalLeft: false, gimbalRight: false, throttleHold: true },
    FIXED_DT
  );

  const expectedThrust = 3 * UNIT_THRUST;
  const expectedMdot = expectedThrust / EXHAUST_VELOCITY;
  const expectedFuel = s0.fuelMass - expectedMdot * FIXED_DT;

  assert.equal(s1.activeEngines, 3);
  assert.ok(Math.abs(s1.fuelMass - expectedFuel) < 1e-6);

  const totalMass = DRY_MASS + s0.fuelMass;
  const expectedVy = (expectedThrust / totalMass - G0) * FIXED_DT;
  assert.ok(Math.abs(s1.vy - expectedVy) < 0.01);
});

test('gimbal input smoothly deflects nozzle and produces matching nose rotation direction', () => {
  const stage = STAGES[0];
  let s = createInitialRocketState(stage);
  s.theta = 0;
  s.omega = 0;
  s.y = 5000;
  s.selectedEngines = 3;

  // Hold gimbalLeft -> nose should rotate counter-clockwise (theta < 0)
  for (let i = 0; i < 20; i++) {
    s = stepRocketPhysics(
      s,
      { gimbalLeft: true, gimbalRight: false, throttleHold: true },
      FIXED_DT
    );
  }
  assert.ok(radToDeg(s.gimbal) > 0 && radToDeg(s.gimbal) <= MAX_GIMBAL_DEG + 0.01);
  assert.ok(s.theta < 0, 'gimbalLeft should pitch nose counter-clockwise (negative theta)');

  // Release gimbal -> returns toward 0
  const gimbalBeforeRelease = s.gimbal;
  s = stepRocketPhysics(s, NO_INPUT, FIXED_DT);
  assert.ok(Math.abs(s.gimbal) < Math.abs(gimbalBeforeRelease));
});

test('belly-flop broadside orientation produces dramatically higher drag than vertical orientation', () => {
  const stage = STAGES[2];
  const vertical = createInitialRocketState(stage);
  vertical.y = 5000;
  vertical.vx = 0;
  vertical.vy = -250;
  vertical.theta = 0; // falling tail-first

  const belly = createInitialRocketState(stage);
  belly.y = 5000;
  belly.vx = 0;
  belly.vy = -250;
  belly.theta = Math.PI / 2; // belly horizontal to vertical airflow

  const vNext = stepRocketPhysics(vertical, NO_INPUT, FIXED_DT);
  const bNext = stepRocketPhysics(belly, NO_INPUT, FIXED_DT);

  assert.ok(
    bNext.vy > vNext.vy,
    `Belly flop should decelerate downward speed more (belly vy=${bNext.vy}, vert vy=${vNext.vy})`
  );
  assert.ok(bNext.gForce > vNext.gForce * 5);
});

test('catch evaluation succeeds only when all 5 criteria are met inside catch zone', () => {
  const stage = STAGES[0];
  const nominal = createInitialRocketState(stage);
  // Place catch pin at (1.0, 1.0) -> CoM at (1.0, -19.0) when upright
  nominal.theta = degToRad(1.5);
  nominal.omega = degToRad(1.0);
  nominal.vx = 0.4;
  nominal.vy = -1.2;
  nominal.x = 1.0 - 20 * Math.sin(nominal.theta);
  nominal.y = 1.0 - 20 * Math.cos(nominal.theta);

  const okRes = evaluateOutcome(nominal);
  assert.equal(okRes.terminated, true);
  assert.equal(okRes.outcome, 'CATCH_SUCCESS');

  // Exceed vertical velocity limit -> should NOT succeed
  const tooFast = { ...nominal, vy: -3.2 };
  const failRes = evaluateOutcome(tooFast);
  assert.notEqual(failRes.outcome, 'CATCH_SUCCESS');

  // Exceed pitch angle limit -> should NOT succeed
  const tooTilted: RocketState = {
    ...nominal,
    theta: degToRad(6.5),
  };
  const tiltRes = evaluateOutcome(tooTilted);
  assert.notEqual(tiltRes.outcome, 'CATCH_SUCCESS');
});

test('score calculation returns up to 10,000 * multiplier and handles zero-error catch', () => {
  const stage = STAGES[1]; // Normal: 1.5x multiplier
  const perfect = createInitialRocketState(stage);
  perfect.x = 0;
  perfect.y = -20; // pin at (0, 0)
  perfect.vx = 0;
  perfect.vy = 0;
  perfect.theta = 0;
  perfect.omega = 0;
  perfect.fuelMass = stage.initialFuelKg * 0.09; // >8% remaining -> max fuel score

  const pin = getCatchPinPosition(perfect);
  assert.ok(Math.hypot(pin.x, pin.y) < 1e-6);

  const score = calculateScore(perfect, stage);
  assert.equal(score.positionScore, 3000);
  assert.equal(score.velocityScore, 4000);
  assert.equal(score.fuelScore, 3000);
  assert.equal(score.baseScore, 10000);
  assert.equal(score.totalScore, 15000);
});

test('all 4 stages are physically winnable with remaining fuel margin (no impossible stages)', () => {
  // Closed-loop PD guidance test to confirm stage fuel budgets & physics tuning
  for (const stage of STAGES) {
    let s = createInitialRocketState(stage);
    let outcome = evaluateOutcome(s);
    let steps = 0;
    const maxSteps = 60 * 300; // 5 min max flight

    while (!outcome.terminated && steps < maxSteps) {
      const pin = getCatchPinPosition(s);
      const speed = Math.hypot(s.vx, s.vy);
      const totalMass = DRY_MASS + s.fuelMass;
      const decel6 = (6 * UNIT_THRUST) / totalMass - G0;
      const decel3 = (3 * UNIT_THRUST) / totalMass - G0;
      const decel1 = (1 * UNIT_THRUST) / totalMass - G0;

      const stopDist3 = s.vy < 0 ? (s.vy * s.vy) / (2 * decel3) : 0;
      const stopDist6 = s.vy < 0 ? (s.vy * s.vy) / (2 * decel6) : 0;

      let desiredThetaDeg = 0;
      let throttleHold = false;

      // Ballistic time-to-ground estimate in thin upper air
      const disc = s.vy * s.vy + 2 * G0 * Math.max(0, s.y);
      const tBallistic = s.y > 0 ? (s.vy + Math.sqrt(disc)) / G0 : 0;
      const tAeroEff = Math.min(Math.max(0, tBallistic), stage.id === 'extreme' ? 92 : 65);
      const estImpactX = pin.x + s.vx * tAeroEff * 0.72;

      if (
        (stage.id === 'extreme' && s.y > 85_000 && s.vx > 152) ||
        (stage.id === 'hard' && s.y > 26_000 && estImpactX > -450 && s.vx > 75)
      ) {
        // Horizontal entry burn to bring ballistic trajectory within aero-glide range
        desiredThetaDeg = stage.id === 'extreme' ? -88 : -84;
        s.selectedEngines = stage.id === 'extreme' ? 6 : 3;
        throttleHold = true;
      } else if (pin.y > Math.max(stopDist3 * 1.15 + 40, 180)) {
        // Aerodynamic glide / belly flop toward smooth glide slope west of tower
        const targetX = Math.max(-25, -8 - pin.y * 0.005);
        const tEst = pin.y / Math.max(35, -s.vy);
        const desiredVx = Math.max(-160, Math.min(160, (targetX - pin.x) / Math.max(2.0, tEst * 0.7)));
        const vxErr = desiredVx - s.vx;

        if (speed > 260 && s.y > 3_500) {
          // Continuous belly-flop around -90 deg: -60 glides right (+x), -120 glides left (-x), -90 max drag
          desiredThetaDeg = Math.max(-118, Math.min(-55, -90 + vxErr * 0.45));
        } else {
          desiredThetaDeg = Math.max(-42, Math.min(42, -vxErr * 1.4));
        }
        throttleHold = false;
      } else {
        // Terminal powered descent & Hoverslam into (0, 0)
        const desiredVx = Math.max(-10, Math.min(10, (-0.8 - pin.x) * 0.18));
        const vxErr = desiredVx - s.vx;
        const maxTilt = Math.min(20, Math.max(3.5, pin.y * 0.18));
        desiredThetaDeg = Math.max(-maxTilt, Math.min(maxTilt, vxErr * 2.5));

        if (pin.y < stopDist6 * 1.08 + 8 && Math.abs(s.vy) > 95) {
          s.selectedEngines = 6;
          throttleHold = true;
        } else if (pin.y < stopDist3 * 1.12 + 4 && s.vy < -10) {
          s.selectedEngines = 3;
          throttleHold = true;
        } else if (pin.y < 100 && s.vy < 1.5) {
          const neededAcc = s.vy < 0 ? (s.vy * s.vy) / Math.max(1, 2 * Math.max(0.5, pin.y)) : 0;
          if (neededAcc > decel1 * 0.7 || s.vy < -2.1 || (pin.y < 4 && s.vy < -0.9) || (pin.y < 60 && Math.abs(s.vx) > 1.4)) {
            s.selectedEngines = 1;
            throttleHold = true;
          }
        }
      }

      // Critically damped PD attitude control (no bang-bang overshoot)
      const thetaErr = degToRad(desiredThetaDeg) - s.theta;
      const pdCmd = thetaErr * 3.5 - s.omega * 2.2;

      const input: ControlInput = {
        gimbalLeft: pdCmd < -0.06,
        gimbalRight: pdCmd > 0.06,
        throttleHold,
      };

      s = stepRocketPhysics(s, input, FIXED_DT);
      outcome = evaluateOutcome(s);
      steps++;
    }

    const pin = getCatchPinPosition(s);
    const fuelPct = (s.fuelMass / stage.initialFuelKg) * 100;
    console.log(
      `Stage ${stage.id}: outcome=${outcome.outcome}, fuel=${fuelPct.toFixed(1)}% (${s.fuelMass.toFixed(0)}kg), t=${s.time.toFixed(1)}s, pin=(${pin.x.toFixed(2)}, ${pin.y.toFixed(2)}), v=(${s.vx.toFixed(2)}, ${s.vy.toFixed(2)}), theta=${radToDeg(s.theta).toFixed(2)}deg`
    );

    assert.equal(
      outcome.outcome,
      'CATCH_SUCCESS',
      `Stage ${stage.id} failed with ${outcome.outcome}: ${outcome.reason}`
    );
    assert.ok(
      fuelPct > 3 && fuelPct < 60,
      `Stage ${stage.id} remaining fuel ${fuelPct.toFixed(1)}% should be positive and bounded (3-60%)`
    );
  }
});

test('computeEasyDemoGuidance completes Stage 1 (easy) with clean CATCH_SUCCESS and positive fuel margin', () => {
  const stage = STAGES[0];
  assert.equal(stage.id, 'easy');

  let s = createInitialRocketState(stage);
  let outcome = evaluateOutcome(s);
  let steps = 0;
  const maxSteps = 60 * 120;
  const phasesSeen = new Set<string>();

  while (!outcome.terminated && steps < maxSteps) {
    const guidance = computeEasyDemoGuidance(s);
    phasesSeen.add(guidance.phaseId);
    s = { ...s, selectedEngines: guidance.selectedEngines };
    s = stepRocketPhysics(s, guidance.input, FIXED_DT);
    outcome = evaluateOutcome(s);
    steps++;
  }

  const pin = getCatchPinPosition(s);
  const fuelPct = (s.fuelMass / stage.initialFuelKg) * 100;
  const score = outcome.outcome === 'CATCH_SUCCESS' ? calculateScore(s, stage) : null;
  console.log(
    `Easy Demo Autopilot: outcome=${outcome.outcome}, t=${s.time.toFixed(2)}s, pin=(${pin.x.toFixed(2)}, ${pin.y.toFixed(2)}), v=(${s.vx.toFixed(2)}, ${s.vy.toFixed(2)}), theta=${radToDeg(s.theta).toFixed(2)}deg, fuel=${fuelPct.toFixed(1)}%, score=${score?.totalScore ?? 0}`
  );

  assert.equal(
    outcome.outcome,
    'CATCH_SUCCESS',
    `Demo autopilot failed with ${outcome.outcome}: ${outcome.reason}`
  );
  assert.ok(fuelPct > 3, `Expected positive fuel margin > 3%, got ${fuelPct.toFixed(1)}%`);
  assert.ok(phasesSeen.has('aero_glide'), 'Expected aero_glide phase');
  assert.ok(phasesSeen.has('hoverslam'), 'Expected hoverslam phase');
  assert.ok(phasesSeen.has('terminal_catch'), 'Expected terminal_catch phase');
});
