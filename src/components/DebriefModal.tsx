import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, RotateCcw, ArrowLeft, Rocket } from 'lucide-react';
import { GROUND_Y, TOWER_TOP_Y, TOWER_X } from '../game/constants';
import {
  getAssistModeLabel,
  getStageLocalized,
  getTranslations,
  type Locale,
} from '../game/i18n';
import type { GameResult, TelemetryFrame } from '../game/types';

export interface DebriefModalProps {
  result: GameResult;
  locale: Locale;
  onRetry: () => void;
  onPlayManual?: () => void;
  onMissionSelect: () => void;
}

type SeriesKey =
  | 'altitude'
  | 'velY'
  | 'velX'
  | 'fuelPct'
  | 'activeEngines'
  | 'gForce';

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  unit: string;
  color: string;
  format: (v: number) => string;
}

export const DebriefModal: React.FC<DebriefModalProps> = ({
  result,
  locale,
  onRetry,
  onPlayManual,
  onMissionSelect,
}) => {
  const t = getTranslations(locale);
  const stageCopy = getStageLocalized(result.stage.id, locale);
  const modeLabel = getAssistModeLabel(result.assistMode, locale);
  const isDemo = result.mode === 'demo';

  const seriesList = useMemo<SeriesMeta[]>(
    () => [
      {
        key: 'altitude',
        label: t.debrief.series.altitude,
        unit: 'm',
        color: '#38bdf8',
        format: (v) => `${Math.round(v).toLocaleString()} m`,
      },
      {
        key: 'velY',
        label: t.debrief.series.velY,
        unit: 'm/s',
        color: '#f59e0b',
        format: (v) => `${v.toFixed(1)} m/s`,
      },
      {
        key: 'velX',
        label: t.debrief.series.velX,
        unit: 'm/s',
        color: '#a78bfa',
        format: (v) => `${v.toFixed(1)} m/s`,
      },
      {
        key: 'fuelPct',
        label: t.debrief.series.fuelPct,
        unit: '%',
        color: '#10b981',
        format: (v) => `${v.toFixed(1)}%`,
      },
      {
        key: 'activeEngines',
        label: t.debrief.series.activeEngines,
        unit: 'eng',
        color: '#ef4444',
        format: (v) => t.common.engineUnit(Math.round(v)),
      },
      {
        key: 'gForce',
        label: t.debrief.series.gForce,
        unit: 'G',
        color: '#f472b6',
        format: (v) => `${v.toFixed(2)} G`,
      },
    ],
    [t]
  );

  const [enabledSeries, setEnabledSeries] = useState<Record<SeriesKey, boolean>>({
    altitude: true,
    velY: true,
    velX: false,
    fuelPct: true,
    activeEngines: true,
    gForce: false,
  });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const timeSeriesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trajectoryCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const frames = result.telemetry;

  // Compute min/max bounds for each series once per result
  const seriesRanges = useMemo(() => {
    const ranges: Record<SeriesKey, { min: number; max: number }> = {
      altitude: { min: 0, max: 1 },
      velY: { min: -10, max: 10 },
      velX: { min: -10, max: 10 },
      fuelPct: { min: 0, max: 100 },
      activeEngines: { min: 0, max: 6 },
      gForce: { min: 0, max: 5 },
    };
    if (frames.length === 0) return ranges;

    for (const meta of seriesList) {
      if (meta.key === 'fuelPct') {
        ranges.fuelPct = { min: 0, max: 100 };
        continue;
      }
      if (meta.key === 'activeEngines') {
        ranges.activeEngines = { min: 0, max: 6 };
        continue;
      }
      let min = Infinity;
      let max = -Infinity;
      for (const f of frames) {
        const val = f[meta.key];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      if (meta.key === 'gForce') {
        min = 0;
        max = Math.max(2, max * 1.1);
      } else if (Math.abs(max - min) < 1e-3) {
        min -= 1;
        max += 1;
      } else {
        const pad = (max - min) * 0.08;
        min -= pad;
        max += pad;
      }
      ranges[meta.key] = { min, max };
    }
    return ranges;
  }, [frames, seriesList]);

  const toggleSeries = (key: SeriesKey) => {
    setEnabledSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Draw Time-Series Telemetry Graph
  useEffect(() => {
    const canvas = timeSeriesCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.round(rect.width));
    const height = Math.max(180, Math.round(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#060A13';
    ctx.fillRect(0, 0, width, height);

    const padL = 14;
    const padR = 14;
    const padT = 14;
    const padB = 24;
    const plotW = Math.max(10, width - padL - padR);
    const plotH = Math.max(10, height - padT - padB);

    // Subtle gridlines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const x = padL + (plotW * i) / 5;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    if (frames.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.debrief.noSamples, width / 2, height / 2);
      return;
    }

    const maxTime = Math.max(0.1, frames[frames.length - 1].time);

    // Time axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const tVal = (maxTime * i) / 5;
      const x = padL + (plotW * i) / 5;
      ctx.fillText(`${tVal.toFixed(1)}s`, x, height - 7);
    }

    const getPointXY = (frameIdx: number, key: SeriesKey) => {
      const f = frames[frameIdx];
      const { min, max } = seriesRanges[key];
      const normY = Math.max(0, Math.min(1, (f[key] - min) / (max - min)));
      const x = padL + (f.time / maxTime) * plotW;
      const y = padT + plotH * (1 - normY);
      return { x, y };
    };

    // Draw each enabled series line
    for (const meta of seriesList) {
      if (!enabledSeries[meta.key]) continue;
      ctx.save();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = meta.key === 'activeEngines' ? 1.6 : 2;
      ctx.beginPath();

      for (let i = 0; i < frames.length; i++) {
        const { x, y } = getPointXY(i, meta.key);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else if (meta.key === 'activeEngines') {
          const prev = getPointXY(i - 1, meta.key);
          ctx.lineTo(x, prev.y);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw hover scrub crosshair & sample points
    if (hoverIndex !== null && frames[hoverIndex]) {
      const hf = frames[hoverIndex];
      const hx = padL + (hf.time / maxTime) * plotW;

      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const meta of seriesList) {
        if (!enabledSeries[meta.key]) continue;
        const { x, y } = getPointXY(hoverIndex, meta.key);
        ctx.fillStyle = meta.color;
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#060A13';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [frames, enabledSeries, hoverIndex, seriesRanges, seriesList, t.debrief.noSamples]);

  // Draw 2D Spatial Trajectory Map (Horizontal X vs Altitude Y)
  useEffect(() => {
    const canvas = trajectoryCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, Math.round(rect.width));
    const height = Math.max(180, Math.round(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#060A13';
    ctx.fillRect(0, 0, width, height);

    if (frames.length === 0) return;

    // Bounding box including tower, catch origin (0,0), ground, and all telemetry points
    let minX = -35;
    let maxX = 45;
    let minY = GROUND_Y - 10;
    let maxY = Math.max(80, TOWER_TOP_Y + 20);

    for (const f of frames) {
      if (f.horizontalPos < minX) minX = f.horizontalPos;
      if (f.horizontalPos > maxX) maxX = f.horizontalPos;
      if (f.altitude < minY) minY = f.altitude;
      if (f.altitude > maxY) maxY = f.altitude;
    }

    const spanX = Math.max(80, maxX - minX);
    const spanY = Math.max(80, maxY - minY);
    const padPx = 22;
    const drawW = width - padPx * 2;
    const drawH = height - padPx * 2;
    const scale = Math.min(drawW / (spanX * 1.12), drawH / (spanY * 1.12));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const toPx = (wx: number, wy: number) => ({
      x: width / 2 + (wx - centerX) * scale,
      y: height / 2 - (wy - centerY) * scale,
    });

    // Ground line
    const gLeft = toPx(centerX - drawW / scale, GROUND_Y);
    const gRight = toPx(centerX + drawW / scale, GROUND_Y);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, gLeft.y);
    ctx.lineTo(width, gRight.y);
    ctx.stroke();

    // Mechazilla tower marker
    const towerBase = toPx(TOWER_X, GROUND_Y);
    const towerTop = toPx(TOWER_X + 10, TOWER_TOP_Y);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
    ctx.fillRect(
      Math.min(towerBase.x, towerTop.x),
      towerTop.y,
      Math.max(4, Math.abs(towerTop.x - towerBase.x)),
      Math.max(8, towerBase.y - towerTop.y)
    );

    // Catch reticle at (0, 0)
    const catchPt = toPx(0, 0);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(catchPt.x, catchPt.y, 5, 0, Math.PI * 2);
    ctx.stroke();

    // Trajectory segments: red when burning, cyan when coasting
    for (let i = 1; i < frames.length; i++) {
      const a = toPx(frames[i - 1].horizontalPos, frames[i - 1].altitude);
      const b = toPx(frames[i].horizontalPos, frames[i].altitude);
      const burning = frames[i].activeEngines > 0;
      ctx.strokeStyle = burning ? '#ef4444' : '#38bdf8';
      ctx.lineWidth = burning ? 2.6 : 1.7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Start point
    const startPt = toPx(frames[0].horizontalPos, frames[0].altitude);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(startPt.x, startPt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Final point
    const last = frames[frames.length - 1];
    const endPt = toPx(last.horizontalPos, last.altitude);
    ctx.fillStyle = result.success ? '#10b981' : '#ef4444';
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }, [frames, result.success]);

  const handleGraphMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = timeSeriesCanvasRef.current;
    if (!canvas || frames.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const padL = 14;
    const padR = 14;
    const plotW = Math.max(10, rect.width - padL - padR);
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / plotW));
    const maxTime = frames[frames.length - 1].time;
    const targetTime = ratio * maxTime;

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const diff = Math.abs(frames[i].time - targetTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setHoverIndex(bestIdx);
  };

  const handleDownloadCsv = () => {
    const headers = [
      'time_s',
      'altitude_m',
      'horizontal_pos_m',
      'vel_y_ms',
      'vel_x_ms',
      'speed_ms',
      'pitch_deg',
      'gimbal_deg',
      'active_engines',
      'fuel_mass_kg',
      'fuel_pct',
      'g_force',
      'dynamic_press_kpa',
    ];
    const rows = frames.map((f) =>
      [
        f.time.toFixed(2),
        f.altitude.toFixed(2),
        f.horizontalPos.toFixed(2),
        f.velY.toFixed(2),
        f.velX.toFixed(2),
        f.speed.toFixed(2),
        f.pitchDeg.toFixed(2),
        f.gimbalDeg.toFixed(2),
        f.activeEngines,
        f.fuelMass.toFixed(1),
        f.fuelPct.toFixed(2),
        f.gForce.toFixed(3),
        f.dynamicPress.toFixed(3),
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starship-telemetry-${result.stage.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async () => {
    const payload = JSON.stringify(
      {
        stage: result.stage.id,
        assistMode: result.assistMode,
        mode: result.mode,
        outcome: result.outcome,
        reason: result.reason,
        score: result.score,
        telemetry: frames,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedJson(true);
    window.setTimeout(() => setCopiedJson(false), 2000);
  };

  const hoveredFrame: TelemetryFrame | null =
    hoverIndex !== null && frames[hoverIndex] ? frames[hoverIndex] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.debrief.dialogAria}
      className="fixed inset-0 bg-[#05080F]/88 flex items-center justify-center p-4 z-40"
    >
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0B101B] border border-slate-700/80 rounded-xl p-5 md:p-6 text-slate-100">
        {/* Outcome Banner */}
        <div
          className={`rounded-lg border px-4 py-3.5 flex flex-wrap items-center justify-between gap-4 ${
            result.success
              ? 'bg-emerald-950/50 border-emerald-500/60'
              : 'bg-red-950/45 border-red-500/60'
          }`}
        >
          <div>
            <div className="text-xs font-mono-tabular text-slate-300">
              {stageCopy.name} ·{' '}
              <span
                className={
                  result.assistMode === 'assisted'
                    ? 'text-emerald-300 font-semibold'
                    : 'text-cyan-300 font-semibold'
                }
              >
                {modeLabel}
              </span>{' '}
              · {isDemo ? t.debrief.demoCompleted : stageCopy.subtitle} ·{' '}
              {t.debrief.flightTime} {result.flightDuration.toFixed(1)}s
            </div>
            <h2
              className={`font-display text-2xl md:text-3xl font-bold tracking-tight mt-0.5 ${
                result.success ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {result.success ? t.debrief.successTitle : t.debrief.failTitle}
            </h2>
            <p className="text-sm text-slate-200 mt-1">{result.reason}</p>
          </div>

          {result.score ? (
            <div className="text-right">
              <div className="text-xs font-mono-tabular text-emerald-300/90">
                {t.debrief.totalScore} ({t.debrief.stageLabel}{' '}
                {result.score.multiplier.toFixed(1)}× · {t.debrief.modeLabel}{' '}
                {result.score.modeMultiplier.toFixed(1)}×)
              </div>
              <div className="font-mono-tabular text-3xl md:text-4xl font-bold text-slate-50">
                {result.score.totalScore.toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="text-right font-mono-tabular">
              <div className="text-xs text-red-300">{t.debrief.impactSpeed}</div>
              <div className="text-2xl font-bold text-slate-50">
                {result.impactSpeed.toFixed(1)} m/s
              </div>
            </div>
          )}
        </div>

        {/* Score Breakdown or Failure Metrics */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular">
          {result.score ? (
            <>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.posAccuracy}</div>
                <div className="text-xl font-semibold text-cyan-300 mt-0.5">
                  {result.score.positionScore.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {t.debrief.errorLabel} {result.score.distanceErrorM.toFixed(2)} m
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.velAttitude}</div>
                <div className="text-xl font-semibold text-emerald-300 mt-0.5">
                  {result.score.velocityScore.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {result.score.catchSpeedMs.toFixed(2)} m/s ·{' '}
                  {result.score.pitchErrorDeg.toFixed(1)}°
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.fuelEfficiency}</div>
                <div className="text-xl font-semibold text-amber-300 mt-0.5">
                  {result.score.fuelScore.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {t.debrief.remainingLabel} {result.score.remainingFuelPct.toFixed(1)}%
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.maxLoad}</div>
                <div className="text-xl font-semibold text-slate-100 mt-0.5">
                  {result.maxGForce.toFixed(1)} G
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Max-Q {result.maxDynamicPressureKpa.toFixed(1)} kPa
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.finalPinOffset}</div>
                <div className="text-base font-semibold text-slate-100 mt-0.5">
                  {result.pinDeltaX >= 0 ? '+' : ''}
                  {result.pinDeltaX.toFixed(1)}m / {result.pinDeltaY.toFixed(1)}m
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.finalFuel}</div>
                <div className="text-base font-semibold text-amber-300 mt-0.5">
                  {result.finalFrame.fuelPct.toFixed(1)}% (
                  {Math.round(result.finalFrame.fuelMass).toLocaleString()} kg)
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.maxG}</div>
                <div className="text-base font-semibold text-slate-100 mt-0.5">
                  {result.maxGForce.toFixed(1)} G
                </div>
              </div>
              <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] text-slate-400">{t.debrief.maxQ}</div>
                <div className="text-base font-semibold text-slate-100 mt-0.5">
                  {result.maxDynamicPressureKpa.toFixed(1)} kPa
                </div>
              </div>
            </>
          )}
        </div>

        {/* Telemetry Charts Grid */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Multi-Line Time-Series Canvas Graph */}
          <div className="lg:col-span-2 bg-[#070B14] border border-slate-800 rounded-lg p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  {t.debrief.telemetryTitle}
                </h3>
                <p className="text-[11px] text-slate-400">{t.debrief.telemetrySub}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {seriesList.map((meta) => {
                  const active = enabledSeries[meta.key];
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      onClick={() => toggleSeries(meta.key)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono-tabular border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-slate-600 text-slate-100'
                          : 'bg-transparent border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-xs"
                        style={{
                          backgroundColor: active ? meta.color : '#475569',
                        }}
                      />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <canvas
                ref={timeSeriesCanvasRef}
                onMouseMove={handleGraphMouseMove}
                onMouseLeave={() => setHoverIndex(null)}
                className="w-full h-52 rounded border border-slate-800/80 cursor-crosshair block"
              />
            </div>

            {/* Scrub Readout Strip */}
            <div className="mt-2 min-h-[24px] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-slate-300">
              {hoveredFrame ? (
                <>
                  <span className="text-slate-100 font-semibold">
                    T+{hoveredFrame.time.toFixed(1)}s
                  </span>
                  {seriesList.filter((m) => enabledSeries[m.key]).map((meta) => (
                    <span key={meta.key} style={{ color: meta.color }}>
                      {meta.label}: {meta.format(hoveredFrame[meta.key])}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-slate-500">
                  {t.debrief.samplesCount(frames.length)}
                </span>
              )}
            </div>
          </div>

          {/* 2D Trajectory Map */}
          <div className="bg-[#070B14] border border-slate-800 rounded-lg p-3.5 flex flex-col">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {t.debrief.trajectoryTitle}
              </h3>
              <div className="flex items-center gap-2.5 text-[10px] font-mono-tabular text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-red-500 inline-block" />
                  {t.debrief.burnLegend}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
                  {t.debrief.coastLegend}
                </span>
              </div>
            </div>
            <canvas
              ref={trajectoryCanvasRef}
              className="w-full flex-1 min-h-[208px] rounded border border-slate-800/80 block"
            />
          </div>
        </div>

        {/* Footer Actions: Export + Retry / Mission Select */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.debrief.downloadCsv}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors cursor-pointer"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">{t.debrief.copiedJson}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t.debrief.copyJson}</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onMissionSelect}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-transparent hover:bg-slate-800/70 border border-slate-700 text-sm font-medium text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.debrief.missionSelect}</span>
            </button>
            {isDemo ? (
              <>
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t.debrief.watchDemoAgain}</span>
                </button>
                <button
                  type="button"
                  data-start="true"
                  data-play-manual="true"
                  onClick={onPlayManual ?? onRetry}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{t.debrief.tryYourself}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-start="true"
                onClick={onRetry}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t.debrief.retryMission}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
