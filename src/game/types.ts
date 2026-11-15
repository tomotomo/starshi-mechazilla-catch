export type DifficultyId = 'easy' | 'normal' | 'hard' | 'extreme';

export type AssistMode = 'realistic' | 'assisted';

export interface AssistModeConfig {
  id: AssistMode;
  label: string;
  shortLabel: string;
  fuelFactor: number;
  fuelFullScoreRatio: number;
  modeMultiplier: number;
  catchToleranceX: number;
  catchToleranceY: number;
  catchMaxVy: number;
  catchMaxVx: number;
  catchMaxThetaDeg: number;
  catchMaxOmegaDeg: number;
}

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type EngineCount = 1 | 2 | 3 | 6;

export interface StageConfig {
  id: DifficultyId;
  levelNumber: number;
  name: string;
  subtitle: string;
  initialY: number;      // [m] CoM altitude above catch point (0,0)
  initialX: number;      // [m] CoM horizontal offset
  initialVx: number;     // [m/s]
  initialVy: number;     // [m/s]
  initialThetaDeg: number; // [deg] clockwise positive
  initialFuelKg: number; // [kg]
  multiplier: number;    // Score multiplier
  strategyTip: string;
}

export interface RocketState {
  x: number;             // [m] CoM horizontal position
  y: number;             // [m] CoM vertical position (0 = catch center height)
  vx: number;            // [m/s]
  vy: number;            // [m/s]
  theta: number;         // [rad] 0 = upright +y, clockwise positive
  omega: number;         // [rad/s]
  gimbal: number;        // [rad] nozzle gimbal angle [-deltaMax, +deltaMax]
  fuelMass: number;      // [kg]
  selectedEngines: EngineCount; // 1, 2, 3, or 6
  throttleOn: boolean;
  activeEngines: 0 | 1 | 2 | 3 | 6;
  time: number;          // [s] elapsed flight time
  ax: number;            // [m/s^2] non-gravitational felt acceleration x
  ay: number;            // [m/s^2] non-gravitational felt acceleration y
  gForce: number;        // [G] felt acceleration / g0
  dynamicPressureKpa: number; // [kPa]
  hoverslamStopPinY: number | null; // Estimated catch-pin Y when stopping with selectedEngines
  hoverslamCanStop: boolean; // False when selectedEngines net deceleration <= 0 or no fuel
  hoverslamStopPinY3: number | null; // Estimated catch-pin Y when stopping with 3 engines
  hoverslam3CanStop: boolean; // False when 3-engine net deceleration <= 0 or no fuel
}

export interface ControlInput {
  gimbalLeft: boolean;
  gimbalRight: boolean;
  throttleHold: boolean;
}

export interface TelemetryFrame {
  time: number;          // [s]
  altitude: number;      // [m] catch pin altitude relative to catch zone (y_pin)
  horizontalPos: number; // [m] catch pin horizontal pos (x_pin)
  velY: number;          // [m/s]
  velX: number;          // [m/s]
  speed: number;         // [m/s]
  pitchDeg: number;      // [deg]
  gimbalDeg: number;     // [deg]
  activeEngines: number; // 0, 1, 2, 3, 6
  fuelMass: number;      // [kg]
  fuelPct: number;       // [%]
  gForce: number;        // [G]
  dynamicPress: number;  // [kPa]
}

export interface ScoreBreakdown {
  positionScore: number; // max 3000
  velocityScore: number; // max 4000
  fuelScore: number;     // max 3000
  baseScore: number;     // max 10000
  multiplier: number;    // stage multiplier
  modeMultiplier: number; // realistic: 1.0, assisted: 0.7
  totalScore: number;
  distanceErrorM: number;
  catchSpeedMs: number;
  pitchErrorDeg: number;
  remainingFuelPct: number;
}

export type OutcomeKind = 'CATCH_SUCCESS' | 'RUD_GROUND' | 'RUD_TOWER' | 'RUD_CATCH_FAIL';

export type FlightMode = 'manual' | 'demo';

export type DemoPhaseId = 'aero_glide' | 'hoverslam' | 'terminal_catch';

export interface DemoGuidanceOutput {
  input: ControlInput;
  selectedEngines: EngineCount;
  phaseId: DemoPhaseId;
  phaseTitle: string;
  commentary: string;
}

export interface GameResult {
  mode: FlightMode;
  assistMode: AssistMode;
  initialFuelKg: number;
  outcome: OutcomeKind;
  success: boolean;
  reason: string;
  stage: StageConfig;
  finalFrame: TelemetryFrame;
  score: ScoreBreakdown | null;
  telemetry: TelemetryFrame[];
  pinDeltaX: number;
  pinDeltaY: number;
  impactSpeed: number;
  maxGForce: number;
  maxDynamicPressureKpa: number;
  flightDuration: number;
}
