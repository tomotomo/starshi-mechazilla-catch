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
  getAssistModeConfig,
} from './constants';
import {
  atmosphericDensity,
  calculateScore,
  createInitialRocketState,
  degToRad,
  estimateHoverslamPrediction,
  evaluateOutcome,
  getCatchPinPosition,
  getEffectiveInitialFuelKg,
  interpolateRocketState,
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

      if (stage.id === 'extreme' && s.y > 85_000 && s.vx > 152) {
        // Horizontal entry burn to bring ballistic trajectory within aero-glide range
        desiredThetaDeg = -88;
        s.selectedEngines = 6;
        throttleHold = true;
      } else if (pin.y > Math.max(stopDist3 * 1.15 + 40, 180)) {
        // Aerodynamic glide / belly flop toward smooth glide slope west of tower
        const targetX = stage.id === 'hard'
          ? Math.max(-35, -14 - pin.y * 0.003)
          : Math.max(-25, -8 - pin.y * 0.005);
        const tEst = pin.y / Math.max(35, -s.vy);
        const desiredVx = Math.max(
          stage.id === 'hard' ? -140 : -160,
          Math.min(stage.id === 'hard' ? 140 : 160, (targetX - pin.x) / Math.max(2.0, tEst * (stage.id === 'hard' ? 0.75 : 0.7)))
        );
        const vxErr = desiredVx - s.vx;

        if (stage.id === 'hard' && s.y > 4_000) {
          // Proper belly-flop with black TPS heatshield down (+90 deg):
          // +55 deg pitches nose up-right to glide left (-x), +115 deg pitches nose down-right to glide right (+x)
          desiredThetaDeg = Math.max(55, Math.min(115, 90 + vxErr * 0.25));
        } else if (stage.id === 'hard') {
          desiredThetaDeg = Math.max(-35, Math.min(35, -vxErr * 1.2));
        } else if (speed > 260 && s.y > 3_500) {
          // LEO post-entry belly-flop around -90 deg
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
    const maxExpectedFuelPct = stage.id === 'hard' ? 75 : 60;
    assert.ok(
      fuelPct > 3 && fuelPct < maxExpectedFuelPct,
      `Stage ${stage.id} remaining fuel ${fuelPct.toFixed(1)}% should be positive and bounded (3-${maxExpectedFuelPct}%)`
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

test('Assisted mode scales initial fuel by 1.25x across all stages and keeps Realistic at 1.0x', () => {
  const realisticCfg = getAssistModeConfig('realistic');
  const assistedCfg = getAssistModeConfig('assisted');
  assert.equal(realisticCfg.fuelFactor, 1.0);
  assert.equal(assistedCfg.fuelFactor, 1.25);

  for (const stage of STAGES) {
    const rFuel = getEffectiveInitialFuelKg(stage, 'realistic');
    const aFuel = getEffectiveInitialFuelKg(stage, 'assisted');
    assert.equal(rFuel, stage.initialFuelKg);
    assert.equal(aFuel, Math.round(stage.initialFuelKg * 1.25));

    const rState = createInitialRocketState(stage, 'realistic');
    const aState = createInitialRocketState(stage, 'assisted');
    assert.equal(rState.fuelMass, rFuel);
    assert.equal(aState.fuelMass, aFuel);
  }
});

test('Assisted mode expands catch envelope to ±8m, |vy|<=6, |vx|<=4, |theta|<=12deg, |omega|<=15deg/s', () => {
  const stage = STAGES[0];
  const state = createInitialRocketState(stage, 'assisted');
  // Boundary inside Assisted envelope, outside Realistic envelope
  state.theta = degToRad(10.5);
  state.omega = degToRad(-12.0);
  state.vx = 3.2;
  state.vy = -5.4;
  // Place catch pin at (6.5, -6.5) -> CoM shifted by pin vector
  state.x = 6.5 - 20 * Math.sin(state.theta);
  state.y = -6.5 - 20 * Math.cos(state.theta);

  const realisticRes = evaluateOutcome(state, 'realistic');
  assert.notEqual(realisticRes.outcome, 'CATCH_SUCCESS');

  const assistedRes = evaluateOutcome(state, 'assisted');
  assert.equal(assistedRes.terminated, true);
  assert.equal(assistedRes.outcome, 'CATCH_SUCCESS');

  // Outside Assisted limits -> not caught
  const overPitch: RocketState = { ...state, theta: degToRad(13.0) };
  assert.notEqual(evaluateOutcome(overPitch, 'assisted').outcome, 'CATCH_SUCCESS');

  const overVy: RocketState = { ...state, vy: -6.5 };
  assert.notEqual(evaluateOutcome(overVy, 'assisted').outcome, 'CATCH_SUCCESS');

  const overOmega: RocketState = { ...state, omega: degToRad(16.0) };
  assert.notEqual(evaluateOutcome(overOmega, 'assisted').outcome, 'CATCH_SUCCESS');
});

test('Assisted mode score requires 15% remaining fuel for max fuelScore and applies 0.7x multiplier', () => {
  const stage = STAGES[1]; // Normal: 1.5x stage multiplier
  const assistedInitialFuel = getEffectiveInitialFuelKg(stage, 'assisted');

  const basePerfect = createInitialRocketState(stage, 'assisted');
  basePerfect.x = 0;
  basePerfect.y = -20; // pin at (0, 0)
  basePerfect.vx = 0;
  basePerfect.vy = 0;
  basePerfect.theta = 0;
  basePerfect.omega = 0;

  // At 10% remaining fuel: full fuelScore in Realistic (threshold 8%), 2/3 fuelScore in Assisted (threshold 15%)
  const tenPctFuel = { ...basePerfect, fuelMass: assistedInitialFuel * 0.1 };
  const sTenPct = calculateScore(tenPctFuel, stage, 'assisted');
  assert.equal(sTenPct.fuelScore, 2000);
  assert.equal(sTenPct.modeMultiplier, 0.7);
  assert.equal(sTenPct.totalScore, Math.round((3000 + 4000 + 2000) * 1.5 * 0.7));

  // At 15% remaining fuel: max base score 10,000 -> total = 10,000 * 1.5 * 0.7 = 10,500
  const fifteenPctFuel = { ...basePerfect, fuelMass: assistedInitialFuel * 0.15 };
  const sFifteenPct = calculateScore(fifteenPctFuel, stage, 'assisted');
  assert.equal(sFifteenPct.fuelScore, 3000);
  assert.equal(sFifteenPct.baseScore, 10000);
  assert.equal(sFifteenPct.totalScore, 10500);
});

test('estimateHoverslamPrediction computes stopPinY and flags canStop=false when thrust <= gravity or fuel is empty', () => {
  const stage = STAGES[3];
  const heavy = createInitialRocketState(stage, 'realistic');
  heavy.fuelMass = 150_000; // Total mass 250t -> weight ~2.45 MN > 1 engine (2.3 MN)
  heavy.vy = -100;
  heavy.theta = 0;

  // 1 engine (2.3 MN) cannot overcome ~2.45 MN weight -> canStop = false
  const pred1 = estimateHoverslamPrediction(heavy, 1);
  assert.equal(pred1.canStop, false);
  assert.equal(pred1.stopPinY, null);

  // 3 engines (6.9 MN) > ~2.45 MN -> positive net deceleration -> canStop = true
  const pred3 = estimateHoverslamPrediction(heavy, 3);
  assert.equal(pred3.canStop, true);
  assert.ok(pred3.stopPinY !== null && Number.isFinite(pred3.stopPinY));

  // Empty fuel -> canStop = false
  const emptyFuel = { ...heavy, fuelMass: 0 };
  const predEmpty = estimateHoverslamPrediction(emptyFuel, 3);
  assert.equal(predEmpty.canStop, false);
  assert.equal(predEmpty.stopPinY, null);

  // stepRocketPhysics populates both selected-engine and 3-engine predictions
  heavy.selectedEngines = 1;
  const stepped = stepRocketPhysics(heavy, NO_INPUT, FIXED_DT);
  assert.equal(stepped.hoverslamCanStop, false);
  assert.equal(stepped.hoverslam3CanStop, true);
  assert.ok(stepped.hoverslamStopPinY3 !== null);
});

import {
  TRANSLATIONS,
  detectBrowserLocale,
  getAssistModeLabel,
  getAssistModeShortLabel,
  getStageLocalized,
  resolveLocale,
} from './i18n';

test('detectBrowserLocale maps Japanese tags to ja and non-Japanese/undefined to en', () => {
  assert.deepEqual(detectBrowserLocale({ language: 'ja', languages: ['ja-JP', 'en-US'] }), {
    locale: 'ja',
    rawTag: 'ja-JP',
  });
  assert.deepEqual(detectBrowserLocale({ language: 'ja', languages: [] }), {
    locale: 'ja',
    rawTag: 'ja',
  });
  assert.deepEqual(detectBrowserLocale({ language: 'en-US', languages: ['en-US', 'ja'] }), {
    locale: 'en',
    rawTag: 'en-US',
  });
  assert.deepEqual(detectBrowserLocale({ language: 'fr-FR', languages: ['fr-FR'] }), {
    locale: 'en',
    rawTag: 'fr-FR',
  });
  assert.deepEqual(detectBrowserLocale(null), {
    locale: 'en',
    rawTag: 'en',
  });
  assert.deepEqual(detectBrowserLocale({ language: '', languages: [] }), {
    locale: 'en',
    rawTag: 'en',
  });
});

test('resolveLocale respects auto preference, explicit preference, and URL override', () => {
  assert.equal(resolveLocale('auto', 'ja', null), 'ja');
  assert.equal(resolveLocale('auto', 'en', null), 'en');
  assert.equal(resolveLocale('ja', 'en', null), 'ja');
  assert.equal(resolveLocale('en', 'ja', null), 'en');
  assert.equal(resolveLocale('ja', 'ja', 'en'), 'en');
  assert.equal(resolveLocale('en', 'en', 'ja'), 'ja');
});

test('localized dictionaries and stage copies are populated for both ja and en', () => {
  for (const stage of STAGES) {
    const jaCopy = getStageLocalized(stage.id, 'ja');
    const enCopy = getStageLocalized(stage.id, 'en');
    assert.ok(jaCopy.name.trim().length > 0);
    assert.ok(jaCopy.subtitle.trim().length > 0);
    assert.ok(jaCopy.strategyTip.trim().length > 0);
    assert.ok(enCopy.name.trim().length > 0);
    assert.ok(enCopy.subtitle.trim().length > 0);
    assert.ok(enCopy.strategyTip.trim().length > 0);
    assert.notEqual(jaCopy.name, enCopy.name);
  }

  assert.equal(getAssistModeLabel('assisted', 'ja'), '簡易モード (Assisted)');
  assert.equal(getAssistModeLabel('assisted', 'en'), 'Assisted Mode');
  assert.equal(getAssistModeShortLabel('realistic', 'ja'), '通常 (Realistic)');
  assert.equal(getAssistModeShortLabel('realistic', 'en'), 'Realistic');
  assert.ok(TRANSLATIONS.ja.title.startMission.length > 0);
  assert.ok(TRANSLATIONS.en.title.startMission.length > 0);
  assert.equal(TRANSLATIONS.ja.common.engineUnit(3), '3基');
  assert.equal(TRANSLATIONS.en.common.engineUnit(3), '3 ENG');
});

test('evaluateOutcome and computeEasyDemoGuidance localize reasons and commentary in ja and en', () => {
  const stage = STAGES[0];
  let s = createInitialRocketState(stage, 'realistic');
  const gJa = computeEasyDemoGuidance(s, 'ja');
  const gEn = computeEasyDemoGuidance(s, 'en');
  assert.notEqual(gJa.phaseTitle, gEn.phaseTitle);
  assert.notEqual(gJa.commentary, gEn.commentary);
  assert.match(gEn.commentary, /[A-Za-z]/);

  // Run EN demo autopilot to completion to verify clean catch & localized success reason
  let outcomeEn = evaluateOutcome(s, 'realistic', 'en');
  let steps = 0;
  while (!outcomeEn.terminated && steps < 60 * 120) {
    const guidance = computeEasyDemoGuidance(s, 'en');
    s = { ...s, selectedEngines: guidance.selectedEngines };
    s = stepRocketPhysics(s, guidance.input, FIXED_DT);
    outcomeEn = evaluateOutcome(s, 'realistic', 'en');
    steps++;
  }
  assert.equal(outcomeEn.outcome, 'CATCH_SUCCESS');
  assert.equal(outcomeEn.reason, 'Mechazilla Chopstick Catch Confirmed');

  const outcomeJa = evaluateOutcome(s, 'realistic', 'ja');
  assert.equal(outcomeJa.reason, 'Mechazilla チョップスティックによる空中捕獲を確認');
});

test('50km (hard) stage starts with windward heatshield belly facing oncoming reentry airflow', () => {
  const stage50 = STAGES.find((st) => st.id === 'hard')!;
  assert.equal(stage50.initialThetaDeg, 65);
  const s0 = createInitialRocketState(stage50, 'realistic');

  // Local +x (black TPS heatshield) normal in world space is (cos(theta), -sin(theta))
  const bellyX = Math.cos(s0.theta);
  const bellyY = -Math.sin(s0.theta);
  const speed = Math.hypot(s0.vx, s0.vy);
  const vHatX = s0.vx / speed;
  const vHatY = s0.vy / speed;

  const bellyDotVelocity = bellyX * vHatX + bellyY * vHatY;
  assert.ok(
    bellyDotVelocity > 0.99,
    `Expected TPS heatshield belly to face directly into velocity vector (dot=${bellyDotVelocity.toFixed(4)})`
  );

  // Survives first 3 seconds with zero input cleanly
  let s = s0;
  for (let i = 0; i < 180; i++) {
    s = stepRocketPhysics(s, NO_INPUT, FIXED_DT);
    const res = evaluateOutcome(s, 'realistic');
    assert.equal(res.terminated, false);
  }
});

test('interpolateRocketState eliminates LEO step-aliasing jitter and wraps angles cleanly', () => {
  const leoStage = STAGES.find((st) => st.id === 'extreme')!;
  let prev = createInitialRocketState(leoStage, 'realistic');
  let curr = stepRocketPhysics(prev, NO_INPUT, FIXED_DT);

  // Endpoint exactness
  assert.equal(interpolateRocketState(prev, curr, 0), prev);
  assert.equal(interpolateRocketState(prev, curr, 1), curr);

  // Midpoint interpolation at 1,500 m/s LEO start
  const mid = interpolateRocketState(prev, curr, 0.5);
  assert.ok(Math.abs(mid.x - (prev.x + curr.x) * 0.5) < 1e-9);
  assert.ok(Math.abs(mid.y - (prev.y + curr.y) * 0.5) < 1e-9);

  // Shortest-path angle wrap across +/-PI boundary
  const a0: RocketState = { ...prev, theta: degToRad(175) };
  const a1: RocketState = { ...curr, theta: degToRad(-175) };
  const aMid = interpolateRocketState(a0, a1, 0.5);
  assert.ok(
    Math.abs(Math.abs(radToDeg(aMid.theta)) - 180) < 1e-6,
    `Expected shortest-path midpoint near +/-180deg, got ${radToDeg(aMid.theta)}`
  );

  // Simulate 120Hz (8.33ms) rAF cadence in LEO: interpolated positions must advance monotonically at steady speed
  let acc = 0;
  const frameDt120Hz = 1 / 120;
  const renderedX: number[] = [];
  for (let frame = 0; frame < 20; frame++) {
    acc += frameDt120Hz;
    while (acc >= FIXED_DT) {
      acc -= FIXED_DT;
      prev = curr;
      curr = stepRocketPhysics(curr, NO_INPUT, FIXED_DT);
    }
    const r = interpolateRocketState(prev, curr, acc / FIXED_DT);
    renderedX.push(r.x);
  }
  const deltas = renderedX.slice(3).map((x, idx) => x - renderedX[idx + 2]);
  for (const dx of deltas) {
    assert.ok(
      Math.abs(dx - 1200 * frameDt120Hz) < 0.2,
      `Expected smooth ~10m per 120Hz frame in LEO, got dx=${dx.toFixed(3)}m`
    );
  }
});
