import React from 'react';
import { Pause, RotateCcw, Volume2, VolumeX, FastForward } from 'lucide-react';
import { CATCH_MAX_THETA_DEG, CATCH_MAX_VX, CATCH_MAX_VY, UNIT_THRUST } from '../game/constants';
import { getCatchPinPosition, radToDeg } from '../game/physics';
import type {
  DemoGuidanceOutput,
  EngineCount,
  FlightMode,
  RocketState,
  StageConfig,
} from '../game/types';

export interface TelemetryHudProps {
  state: RocketState;
  stage: StageConfig;
  flightMode: FlightMode;
  demoGuidance: DemoGuidanceOutput | null;
  timeWarp: 1 | 5;
  muted: boolean;
  onSelectEngines: (count: EngineCount) => void;
  onToggleWarp: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRetry: () => void;
}

const RAPTOR_LAYOUT: { x: number; y: number }[] = [
  // Inner ring (3 sea-level gimbaled Raptors)
  { x: 32, y: 21 },
  { x: 22.5, y: 37.5 },
  { x: 41.5, y: 37.5 },
  // Outer ring (3 booster/vacuum Raptors)
  { x: 32, y: 10 },
  { x: 13, y: 43 },
  { x: 51, y: 43 },
];

export const TelemetryHud: React.FC<TelemetryHudProps> = ({
  state,
  stage,
  flightMode,
  demoGuidance,
  timeWarp,
  muted,
  onSelectEngines,
  onToggleWarp,
  onToggleMute,
  onPause,
  onRetry,
}) => {
  const isDemo = flightMode === 'demo';
  const pin = getCatchPinPosition(state);
  const speed = Math.hypot(state.vx, state.vy);
  const pitchDeg = radToDeg(state.theta);
  const gimbalDeg = radToDeg(state.gimbal);
  const fuelPct =
    stage.initialFuelKg > 0
      ? Math.max(0, Math.min(100, (state.fuelMass / stage.initialFuelKg) * 100))
      : 0;
  const warpEligible = state.y >= 2_000 && !state.throttleOn;

  const fuelBarColor =
    fuelPct < 10
      ? 'bg-red-500'
      : fuelPct < 25
        ? 'bg-amber-400'
        : 'bg-cyan-400';

  const vyOk = Math.abs(state.vy) <= CATCH_MAX_VY;
  const vxOk = Math.abs(state.vx) <= CATCH_MAX_VX;
  const pitchOk = Math.abs(pitchDeg) <= CATCH_MAX_THETA_DEG;

  const formatT = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(1).padStart(4, '0');
    return `${String(mins).padStart(2, '0')}:${rem}`;
  };

  const stopAltText =
    state.hoverslamStopPinY !== null
      ? `${Math.round(state.hoverslamStopPinY)} m`
      : '--';

  return (
    <div className="fixed inset-0 pointer-events-none select-none flex flex-col justify-between p-4">
      {/* Top Bar: Left Mission Time & Warp | Right Compact Utility Buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#0B101B]/90 border border-slate-700/60 rounded-lg px-3.5 py-2">
          <div>
            <div className="text-[11px] tracking-wide">
              {isDemo ? (
                <span className="text-cyan-300 font-semibold">
                  {stage.name} · お手本再生中（観戦専用）
                </span>
              ) : (
                <span className="text-slate-400">
                  {stage.name} · {stage.multiplier.toFixed(1)}×
                </span>
              )}
            </div>
            <div className="font-mono-tabular text-base font-semibold text-slate-100 leading-tight">
              T+{formatT(state.time)}
            </div>
          </div>
          <div className="h-7 w-px bg-slate-700/70" />
          <button
            type="button"
            tabIndex={-1}
            disabled={!warpEligible && timeWarp === 1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleWarp();
            }}
            title="Time Warp (T) — 高度 2,000m 以上・エンジンOFF時のみ使用可能"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono-tabular font-medium border transition-colors whitespace-nowrap shrink-0 ${
              timeWarp === 5
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : warpEligible
                  ? 'bg-slate-800/90 border-slate-600 text-slate-200 hover:border-cyan-400'
                  : 'bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>{timeWarp}× [T]</span>
          </button>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#0B101B]/90 border border-slate-700/60 text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
            title="Audio Mute [M]"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Retry Mission"
            onClick={(e) => {
              e.currentTarget.blur();
              onRetry();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#0B101B]/90 border border-slate-700/60 text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
            title="Retry [R]"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Simulation"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#0B101B]/90 border border-slate-700/60 text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
            title="Pause [P / Esc]"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Center: Optional Demo Autopilot Commentary + SpaceX-Inspired Telemetry Console */}
      <div className="flex flex-col items-center gap-2">
        {isDemo && demoGuidance && (
          <div
            data-testid="demo-hud-strip"
            className="pointer-events-auto w-full max-w-4xl bg-[#0B101B]/94 border border-cyan-500/45 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
          >
            {/* Virtual Keycap Indicators */}
            <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular text-xs font-bold">
              <span
                data-key-active={demoGuidance.input.gimbalLeft ? 'true' : 'false'}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  demoGuidance.input.gimbalLeft
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-500 border-slate-700'
                }`}
              >
                A
              </span>
              <span
                data-key-active={demoGuidance.input.gimbalRight ? 'true' : 'false'}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  demoGuidance.input.gimbalRight
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-500 border-slate-700'
                }`}
              >
                D
              </span>
              <span
                data-key-active={demoGuidance.input.throttleHold ? 'true' : 'false'}
                className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap ${
                  demoGuidance.input.throttleHold
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-900 text-slate-500 border-slate-700'
                }`}
              >
                W / SPACE
              </span>
              <span className="ml-1 px-2 py-1 rounded border border-cyan-500/40 bg-cyan-950/50 text-cyan-200 whitespace-nowrap">
                {demoGuidance.selectedEngines}基
              </span>
            </div>

            {/* Phase Name + Live Commentary */}
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
              <span className="font-display text-xs font-bold text-cyan-300 whitespace-nowrap shrink-0">
                {demoGuidance.phaseTitle}
              </span>
              <span className="text-xs text-slate-200 leading-snug">
                {demoGuidance.commentary}
              </span>
            </div>
          </div>
        )}

        <div className="pointer-events-auto w-full max-w-4xl bg-[#0B101B]/92 border border-slate-700/60 rounded-xl px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Left: Flight Kinematics (Speed, Alt, G, Max-Q, Hoverslam) */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
            <div>
              <div className="text-[10px] tracking-wider text-slate-400">SPEED</div>
              <div className="font-mono-tabular text-lg font-semibold text-slate-50 leading-tight">
                {Math.round(speed)}
                <span className="text-[10px] text-slate-400 ml-1">m/s</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-slate-400">ALT (PIN)</div>
              <div className="font-mono-tabular text-lg font-semibold text-cyan-300 leading-tight">
                {Math.abs(pin.y) >= 1000
                  ? `${(pin.y / 1000).toFixed(2)}`
                  : `${Math.round(pin.y)}`}
                <span className="text-[10px] text-slate-400 ml-1">
                  {Math.abs(pin.y) >= 1000 ? 'km' : 'm'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-slate-400">OFFSET X</div>
              <div className="font-mono-tabular text-lg font-semibold text-slate-100 leading-tight">
                {pin.x >= 0 ? '+' : ''}
                {Math.round(pin.x)}
                <span className="text-[10px] text-slate-400 ml-1">m</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] tracking-wider text-slate-400">VEL X / Y</div>
              <div className="font-mono-tabular text-xs font-medium leading-tight">
                <span className={vxOk ? 'text-emerald-400' : 'text-slate-200'}>
                  {state.vx >= 0 ? '+' : ''}
                  {Math.round(state.vx)}
                </span>
                <span className="text-slate-500"> / </span>
                <span className={vyOk ? 'text-emerald-400' : 'text-slate-200'}>
                  {Math.round(state.vy)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-slate-400">G / Q</div>
              <div className="font-mono-tabular text-xs font-medium text-slate-200 leading-tight">
                {state.gForce.toFixed(1)}G · {Math.round(state.dynamicPressureKpa)}kPa
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-slate-400">STOP ALT</div>
              <div
                className={`font-mono-tabular text-xs font-medium leading-tight ${
                  state.hoverslamStopPinY !== null && state.hoverslamStopPinY < -2
                    ? 'text-red-400'
                    : 'text-cyan-300'
                }`}
              >
                {stopAltText}
              </div>
            </div>
          </div>

          {/* Center: 6-Raptor Engine Ring + Gimbal + Selector Buttons */}
          <div className="flex items-center justify-center gap-4 border-y md:border-y-0 md:border-x border-slate-800 py-2 md:py-0 md:px-4">
            <svg
              viewBox="0 0 64 64"
              className="w-16 h-16 shrink-0"
              aria-label="Raptor Engine Cluster Status"
            >
              <circle
                cx="32"
                cy="32"
                r="29"
                fill="#070B14"
                stroke="#334155"
                strokeWidth="1.5"
              />
              {RAPTOR_LAYOUT.map((pos, idx) => {
                const isSelected = idx < state.selectedEngines;
                const isFiring = idx < state.activeEngines;
                return (
                  <g key={idx}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="6.2"
                      fill={
                        isFiring
                          ? '#38bdf8'
                          : isSelected
                            ? '#0f172a'
                            : '#090d16'
                      }
                      stroke={
                        isFiring
                          ? '#e0f2fe'
                          : isSelected
                            ? '#06b6d4'
                            : '#334155'
                      }
                      strokeWidth={isSelected ? '1.6' : '1'}
                    />
                    {isFiring && (
                      <circle cx={pos.x} cy={pos.y} r="2.6" fill="#ffffff" />
                    )}
                  </g>
                );
              })}
            </svg>

            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] tracking-wider text-slate-400">
                  RAPTOR THRUST
                </span>
                <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                  {((state.activeEngines * UNIT_THRUST) / 1_000_000).toFixed(1)} MN
                </span>
              </div>

              <div className="flex items-center gap-1">
                {([1, 2, 3, 6] as EngineCount[]).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    tabIndex={-1}
                    disabled={isDemo}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (!isDemo) {
                        onSelectEngines(cnt);
                      }
                    }}
                    className={`flex-1 py-1 text-xs font-mono-tabular font-semibold rounded border transition-colors ${
                      state.selectedEngines === cnt
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : isDemo
                          ? 'bg-slate-900/70 border-slate-800 text-slate-600 cursor-default'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
                <span>GIMBAL</span>
                <span className="text-slate-200">
                  {gimbalDeg >= 0 ? '+' : ''}
                  {gimbalDeg.toFixed(1)}°
                </span>
              </div>
            </div>
          </div>

          {/* Right: Propellant Gauge (LOX/CH4) + Attitude Silhouette */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] tracking-wider text-slate-400">
                  CH4 / LOX
                </span>
                <span
                  className={`font-mono-tabular text-sm font-semibold ${
                    fuelPct < 10
                      ? 'text-red-400'
                      : fuelPct < 25
                        ? 'text-amber-300'
                        : 'text-slate-100'
                  }`}
                >
                  {fuelPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-sm overflow-hidden border border-slate-700/80">
                <div
                  className={`h-full w-full origin-left ${fuelBarColor}`}
                  style={{ transform: `scaleX(${fuelPct / 100})` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
                <span>{Math.round(state.fuelMass).toLocaleString()} kg</span>
                <span className={pitchOk ? 'text-emerald-400' : 'text-slate-300'}>
                  {pitchDeg >= 0 ? '+' : ''}
                  {pitchDeg.toFixed(1)}°
                </span>
              </div>
            </div>

            {/* Live Rocket Attitude Silhouette */}
            <svg
              viewBox="0 0 48 48"
              className="w-12 h-12 shrink-0"
              aria-label="Vehicle Attitude Indicator"
            >
              <circle
                cx="24"
                cy="24"
                r="22"
                fill="#070B14"
                stroke="#334155"
                strokeWidth="1.2"
              />
              <line
                x1="4"
                y1="24"
                x2="44"
                y2="24"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <g transform={`translate(24 24) rotate(${pitchDeg})`}>
                <path
                  d="M -3 13 L -3 -6 Q 0 -15 3 -6 L 3 13 Z"
                  fill={pitchOk ? '#10b981' : '#e2e8f0'}
                />
                <line
                  x1="0"
                  y1="13"
                  x2={Math.sin(state.gimbal) * 8}
                  y2={13 + Math.cos(state.gimbal) * 8}
                  stroke={state.activeEngines > 0 ? '#38bdf8' : '#64748b'}
                  strokeWidth="2"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
