import React, { useMemo } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw } from 'lucide-react';
import { getTranslations, type Locale } from '../game/i18n';
import type { ReplaySpeedFactor, TelemetryFrame } from '../game/types';

export interface ReplayControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: ReplaySpeedFactor;
  frames: TelemetryFrame[];
  locale: Locale;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onSelectSpeed: (speed: ReplaySpeedFactor) => void;
  onRestart: () => void;
  onExitReplay: () => void;
}

const SPEED_OPTIONS: ReplaySpeedFactor[] = [0.5, 1, 2, 5, 10];

function formatMissionClock(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${String(mins).padStart(2, '0')}:${rem}`;
}

interface BurnSegment {
  leftPct: number;
  widthPct: number;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  currentTime,
  duration,
  isPlaying,
  speed,
  frames,
  locale,
  onTogglePlay,
  onSeek,
  onSelectSpeed,
  onRestart,
  onExitReplay,
}) => {
  const t = getTranslations(locale);
  const firstTime = frames.length > 0 ? frames[0].time : 0;
  const maxTime = Math.max(firstTime, duration);
  const span = Math.max(0.01, maxTime - firstTime);
  const clampedTime = Math.max(firstTime, Math.min(maxTime, currentTime));
  const progressPct = Math.max(0, Math.min(100, ((clampedTime - firstTime) / span) * 100));

  const burnSegments = useMemo<BurnSegment[]>(() => {
    if (frames.length < 2 || maxTime <= firstTime) return [];
    const totalSpan = maxTime - firstTime;
    const segments: BurnSegment[] = [];
    let activeStart: number | null = null;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const burning = f.activeEngines > 0;
      if (burning && activeStart === null) {
        activeStart = f.time;
      } else if (!burning && activeStart !== null) {
        const leftPct = Math.max(0, ((activeStart - firstTime) / totalSpan) * 100);
        const rightPct = Math.min(100, ((f.time - firstTime) / totalSpan) * 100);
        segments.push({
          leftPct,
          widthPct: Math.max(0.6, rightPct - leftPct),
        });
        activeStart = null;
      }
    }

    if (activeStart !== null) {
      const leftPct = Math.max(0, ((activeStart - firstTime) / totalSpan) * 100);
      segments.push({
        leftPct,
        widthPct: Math.max(0.6, 100 - leftPct),
      });
    }

    return segments;
  }, [frames, firstTime, maxTime]);

  return (
    <div
      data-testid="replay-controls"
      className="pointer-events-auto w-full max-w-4xl bg-[#0B101B]/94 border border-cyan-500/45 rounded-xl px-4 py-2.5 flex flex-col gap-2"
    >
      {/* Top Row: Playback Buttons + Timeline Seek Bar + Time Readout */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            data-testid="replay-play-pause-btn"
            aria-label={isPlaying ? t.replay.pause : t.replay.play}
            title={isPlaying ? t.replay.pause : t.replay.play}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePlay();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isPlaying ? t.replay.pause : t.replay.play}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="replay-restart-btn"
            aria-label={t.replay.restart}
            title={t.replay.restart}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.replay.restart}</span>
          </button>
        </div>

        {/* Visual Burn/Coast Timeline + Interactive Range Seek Bar */}
        <div className="relative flex-1 min-w-[160px] h-7 flex items-center">
          <div className="absolute inset-x-0 h-2 rounded-full bg-slate-800 border border-slate-700/80 overflow-hidden pointer-events-none">
            {/* Burn intervals */}
            {burnSegments.map((seg, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 bg-amber-500/80"
                style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
              />
            ))}
            {/* Progress overlay */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-cyan-400/55"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <input
            type="range"
            data-testid="replay-seek-bar"
            aria-label={t.replay.seekAria}
            min={firstTime}
            max={maxTime > firstTime ? maxTime : firstTime + 0.01}
            step={0.01}
            value={clampedTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="relative z-10 w-full h-5 appearance-none bg-transparent cursor-pointer accent-cyan-400"
          />
        </div>

        <div className="font-mono-tabular text-xs font-semibold text-slate-100 whitespace-nowrap shrink-0">
          T+{formatMissionClock(clampedTime)}{' '}
          <span className="text-slate-400 font-normal">
            / {formatMissionClock(maxTime)}
          </span>
        </div>
      </div>

      {/* Bottom Row: Speed Selector, Shortcut Hint, Back to Results */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-mono-tabular mr-0.5">
            {t.replay.speedLabel}:
          </span>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              tabIndex={-1}
              data-testid={`replay-speed-${opt}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectSpeed(opt);
              }}
              className={`px-2 py-0.5 rounded font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                speed === opt
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt}×
            </button>
          ))}
        </div>

        <span className="hidden lg:inline text-slate-400 font-mono-tabular">
          {t.replay.shortcutHint}
        </span>

        <button
          type="button"
          tabIndex={-1}
          data-testid="replay-exit-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onExitReplay();
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.replay.backToResult}</span>
        </button>
      </div>
    </div>
  );
};
