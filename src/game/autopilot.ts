import { DRY_MASS, G0, UNIT_THRUST } from './constants';
import type { Locale } from './i18n';
import { degToRad, getCatchPinPosition } from './physics';
import type {
  ControlInput,
  DemoGuidanceOutput,
  DemoPhaseId,
  EngineCount,
  RocketState,
} from './types';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Closed-loop PD guidance controller for Stage 1 (Easy / 3km) Demo Mode.
 * Demonstrates:
 * 1. Fuel-free aerodynamic horizontal alignment during descent
 * 2. 3-engine Hoverslam ignition timed against stopping distance
 * 3. 1-engine precision final approach into Mechazilla catch zone (0, 0)
 */
export function computeEasyDemoGuidance(
  state: RocketState,
  locale: Locale = 'ja'
): DemoGuidanceOutput {
  const pin = getCatchPinPosition(state);
  const totalMass = DRY_MASS + state.fuelMass;
  const decel3 = (3 * UNIT_THRUST) / totalMass - G0;
  const decel1 = (1 * UNIT_THRUST) / totalMass - G0;

  const stopDist3 = state.vy < 0 ? (state.vy * state.vy) / (2 * decel3) : 0;

  let desiredThetaDeg = 0;
  let throttleHold = false;
  let selectedEngines: EngineCount = state.selectedEngines;
  let phaseId: DemoPhaseId = 'aero_glide';
  let phaseTitle = locale === 'en' ? 'Aerodynamic Glide' : '空力誘導フェーズ';
  let commentary =
    locale === 'en'
      ? 'Tilting vehicle to steer horizontally toward the tower using aerodynamic drag and lift'
      : '機体を傾けて空気抵抗と揚力でタワー方向へ水平位置を合わせています';

  const hoverslamTriggerAlt = Math.max(stopDist3 * 1.15 + 40, 180);

  if (pin.y > hoverslamTriggerAlt) {
    // Phase 1: Coasting aerodynamic glide toward tower approach corridor
    phaseId = 'aero_glide';
    selectedEngines = 3;
    throttleHold = false;

    const targetX = Math.max(-18, -2 - pin.y * 0.003);
    const tEst = pin.y / Math.max(35, -state.vy);
    const desiredVx = clamp((targetX - pin.x) / Math.max(2.0, tEst * 0.7), -160, 160);
    const vxErr = desiredVx - state.vx;
    desiredThetaDeg = clamp(-vxErr * 1.4, -42, 42);

    phaseTitle = locale === 'en' ? 'Aero Glide & Freefall' : '空力誘導・自由落下';
    if (Math.abs(pin.x) > 12) {
      commentary =
        locale === 'en'
          ? 'Conserving fuel while steering horizontally toward the tower via attitude (A / D aero control)'
          : '燃料を温存しつつ姿勢角で水平位置をタワー方向へ誘導しています（A / Dで空力操舵）';
    } else {
      commentary =
        locale === 'en'
          ? 'Aligned horizontally. Freefalling until predicted stopping altitude (STOP ALT) reaches 0 m'
          : '水平軸が揃いました。停止予測高度 (STOP ALT) が 0m に重なる瞬間まで自由落下で待機します';
    }
  } else {
    // Terminal powered descent & Hoverslam into (0, 0)
    const desiredVx = clamp((0 - pin.x) * 0.22, -8, 8);
    const vxErr = desiredVx - state.vx;
    const maxTilt = Math.min(20, Math.max(4.5, pin.y * 0.18));
    desiredThetaDeg = clamp(vxErr * 2.9, -maxTilt, maxTilt);

    if (pin.y < stopDist3 * 1.12 + 4 && state.vy < -10) {
      // Phase 2: 3-Engine Hoverslam deceleration burn
      phaseId = 'hoverslam';
      selectedEngines = 3;
      throttleHold = true;
      phaseTitle = locale === 'en' ? '3-Engine Hoverslam' : '3基 Hoverslam 減速';
      commentary =
        locale === 'en'
          ? 'Stopping target reached! Firing 3 Raptors simultaneously to kill descent velocity with minimal fuel'
          : '停止予測高度が目標に到達！3基を同時点火し、最小の燃料で落下速度を一気に殺します';
    } else if (pin.y < 100 && state.vy < 1.5) {
      // Phase 3: 1-Engine precision pin alignment inside tower corridor
      phaseId = 'terminal_catch';
      selectedEngines = 1;
      const neededAcc =
        state.vy < 0 ? (state.vy * state.vy) / Math.max(1, 2 * Math.max(0.5, pin.y)) : 0;
      if (
        state.vy < 0.15 &&
        (neededAcc > decel1 * 0.72 ||
          state.vy < -1.8 ||
          (pin.y < 6 && state.vy < -0.85))
      ) {
        throttleHold = true;
      }
      phaseTitle = locale === 'en' ? '1-Engine Precision Catch' : '1基 精密アプローチ';
      commentary = throttleHold
        ? locale === 'en'
          ? 'Stepped down to 1 engine for fine control. Guiding into chopsticks (0, 0) within ±2.5 m/s and ±5°'
          : '1基へ切替えて微調整中。速度 ±2.5 m/s・姿勢 ±5° 以内でチョップスティック (0, 0) へ導きます'
        : locale === 'en'
          ? 'Coasting smoothly with fine gimbal attitude control toward the final catch target (0, 0)'
          : '推力オフで位置と姿勢を整えつつ、最終キャッチポイント (0, 0) へ静かに降下しています';
    } else {
      // Brief coast between Hoverslam pulses or attitude settling
      phaseId = pin.y < 100 ? 'terminal_catch' : 'hoverslam';
      selectedEngines = pin.y < 100 ? 1 : 3;
      throttleHold = false;
      phaseTitle =
        pin.y < 100
          ? locale === 'en'
            ? '1-Engine Precision Catch'
            : '1基 精密アプローチ'
          : locale === 'en'
            ? 'Hoverslam Attitude Hold'
            : 'Hoverslam 姿勢安定';
      commentary =
        pin.y < 100
          ? locale === 'en'
            ? 'Monitoring sink rate in 1-engine mode on final approach to the catch line'
            : '1基モードで降下速度を見極めながら最終キャッチラインへ進入しています'
          : locale === 'en'
            ? 'Stabilizing upright attitude with gimbal & aero torque ahead of the 3-engine Hoverslam'
            : '3基Hoverslamに備え、ジンバルと空力で機体を直立姿勢に安定させています';
    }
  }

  // Critically damped PD attitude control
  const thetaErr = degToRad(desiredThetaDeg) - state.theta;
  const pdCmd = thetaErr * 3.5 - state.omega * 2.2;

  const input: ControlInput = {
    gimbalLeft: pdCmd < -0.06,
    gimbalRight: pdCmd > 0.06,
    throttleHold,
  };

  return {
    input,
    selectedEngines,
    phaseId,
    phaseTitle,
    commentary,
  };
}
