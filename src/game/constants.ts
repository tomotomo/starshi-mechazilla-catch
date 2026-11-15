import type { AssistMode, AssistModeConfig, StageConfig } from './types';

export const FIXED_DT = 1 / 60;

// Starship upper stage physical constants
export const DRY_MASS = 100_000; // [kg] 100 t
export const SHIP_LENGTH = 70; // [m]
export const SHIP_DIAMETER = 9; // [m]
export const R_ENGINE = 35; // [m] CoM to engine nozzle
export const R_CATCH_PIN = 20; // [m] CoM to upper catch pin
export const R_NOSE = 35; // [m] CoM to nose tip

// Raptor engine specifications
export const UNIT_THRUST = 2_300_000; // [N] 2.3 MN per Raptor
export const ISP = 330; // [s]
export const G0 = 9.80665; // [m/s^2]
export const EXHAUST_VELOCITY = ISP * G0; // [m/s]

// Gimbal & aerodynamic control constants
export const MAX_GIMBAL_DEG = 15;
export const MAX_GIMBAL_RAD = (MAX_GIMBAL_DEG * Math.PI) / 180;
export const GIMBAL_RATE_RAD = 2.6; // [rad/s] smooth slew rate
export const GIMBAL_RETURN_RATE_RAD = 3.2; // [rad/s] return-to-center rate

// Atmosphere & aerodynamics
export const RHO_0 = 1.225; // [kg/m^3] sea-level air density
export const SCALE_HEIGHT = 8_500; // [m]
export const AREA_BASE = 64; // [m^2] cross-sectional end area
export const AREA_SIDE = 630; // [m^2] broadside belly area (70m * 9m)
export const CD_COEFF = 0.72; // Blunt-body drag coefficient
export const CL_COEFF = 0.65; // Cross-flow aerodynamic body/flap lift coefficient
export const AERO_DAMP_COEFF = 1.8e7; // Rotational aero damping coefficient
export const GRIDFIN_TORQUE_COEFF = 5.2e6; // Aero flap/gridfin control torque at sea-level density
export const RCS_TORQUE = 6.5e5; // [N*m] Cold-gas/hot-gas RCS attitude authority in vacuum/upper atmosphere

// Tower & environment geometry (Catch point at 0, 0)
export const GROUND_Y = -60; // [m] concrete pad elevation
export const TOWER_X = 12.5; // [m] tower face X position
export const TOWER_STRUCTURE_MIN_X = 12.5; // [m] collision boundary of tower truss
export const TOWER_TOP_Y = 40; // [m] top of launch tower relative to catch zone
export const CATCH_ARM_TIP_X = -6; // [m] open/catch arm span

// Catch envelope tolerances (Realistic baseline constants)
export const CATCH_TOLERANCE_X = 4.0; // [m]
export const CATCH_TOLERANCE_Y = 4.0; // [m]
export const CATCH_MAX_VY = 2.5; // [m/s]
export const CATCH_MAX_VX = 1.5; // [m/s]
export const CATCH_MAX_THETA_DEG = 5.0; // [deg]
export const CATCH_MAX_OMEGA_DEG = 5.0; // [deg/s]

// Assist Mode parameter profiles (Realistic vs Assisted)
export const ASSIST_MODE_CONFIGS: Record<AssistMode, AssistModeConfig> = {
  realistic: {
    id: 'realistic',
    label: '通常モード (Realistic)',
    shortLabel: 'Realistic',
    fuelFactor: 1.0,
    fuelFullScoreRatio: 0.08,
    modeMultiplier: 1.0,
    catchToleranceX: 4.0,
    catchToleranceY: 4.0,
    catchMaxVy: 2.5,
    catchMaxVx: 1.5,
    catchMaxThetaDeg: 5.0,
    catchMaxOmegaDeg: 5.0,
  },
  assisted: {
    id: 'assisted',
    label: '簡易モード (Assisted)',
    shortLabel: 'Assisted',
    fuelFactor: 1.25,
    fuelFullScoreRatio: 0.15,
    modeMultiplier: 0.7,
    catchToleranceX: 8.0,
    catchToleranceY: 8.0,
    catchMaxVy: 6.0,
    catchMaxVx: 4.0,
    catchMaxThetaDeg: 12.0,
    catchMaxOmegaDeg: 15.0,
  },
};

export function getAssistModeConfig(mode: AssistMode = 'realistic'): AssistModeConfig {
  return ASSIST_MODE_CONFIGS[mode];
}

// Stage configurations tuned for tight ~8-15% fuel margin on optimal Hoverslam
export const STAGES: StageConfig[] = [
  {
    id: 'easy',
    levelNumber: 1,
    name: '上空 3km',
    subtitle: 'Final Landing Phase',
    initialY: 3_000,
    initialX: -80,
    initialVx: 15,
    initialVy: -120,
    initialThetaDeg: -5,
    initialFuelKg: 8_200,
    multiplier: 1.0,
    strategyTip: '最終着陸フェーズ。3基で一気に減速し、高度200m付近から1基に切り替えてピンを捉えます。',
  },
  {
    id: 'normal',
    levelNumber: 2,
    name: '上空 10km',
    subtitle: 'Subsonic Terminal Descent',
    initialY: 10_000,
    initialX: -450,
    initialVx: 60,
    initialVy: -240,
    initialThetaDeg: -20,
    initialFuelKg: 8_800,
    multiplier: 1.5,
    strategyTip: '空力で水平位置をタワーへ誘導しつつ終端速度まで落としてから、6基または3基でHoverslam。',
  },
  {
    id: 'hard',
    levelNumber: 3,
    name: '上空 50km',
    subtitle: 'Stratospheric Belly Flop',
    initialY: 50_000,
    initialX: -2_500,
    initialVx: 280,
    initialVy: -650,
    initialThetaDeg: 65,
    initialFuelKg: 18_500,
    multiplier: 2.0,
    strategyTip: '機体の腹を進行方向へ向けるベリーフロップで空気抵抗を最大化しないと燃料が足りません。',
  },
  {
    id: 'extreme',
    levelNumber: 4,
    name: '地球低軌道 (LEO)',
    subtitle: 'Orbital Reentry',
    initialY: 120_000,
    initialX: -15_000,
    initialVx: 1_200,
    initialVy: -900,
    initialThetaDeg: -75,
    initialFuelKg: 56_500,
    multiplier: 3.0,
    strategyTip: '超高高度からの大気圏再突入。6基のエントリーバーンで熱負荷と速度を抑え、空力ブレーキを併用します。',
  },
];

export const TELEMETRY_SAMPLE_INTERVAL = 0.1; // [s] record every 0.1s (6 frames)
