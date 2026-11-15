import React from 'react';
import { Globe, Play } from 'lucide-react';
import { getAssistModeConfig } from '../game/constants';
import {
  getAssistModeLabel,
  getStageLocalized,
  getTranslations,
  type Locale,
} from '../game/i18n';
import { getEffectiveInitialFuelKg } from '../game/physics';
import type { AssistMode, DifficultyId, StageConfig } from '../game/types';

export interface TitleScreenProps {
  stages: StageConfig[];
  selectedStageId: DifficultyId;
  assistMode: AssistMode;
  locale: Locale;
  onSelectStage: (id: DifficultyId) => void;
  onSelectAssistMode: (mode: AssistMode) => void;
  onOpenLanguageSettings: () => void;
  onStart: () => void;
  onStartDemo: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  stages,
  selectedStageId,
  assistMode,
  locale,
  onSelectStage,
  onSelectAssistMode,
  onOpenLanguageSettings,
  onStart,
  onStartDemo,
}) => {
  const t = getTranslations(locale);
  const activeStage =
    stages.find((s) => s.id === selectedStageId) ?? stages[0];
  const activeStageCopy = getStageLocalized(activeStage.id, locale);
  const modeCfg = getAssistModeConfig(assistMode);
  const effectiveFuelKg = getEffectiveInitialFuelKg(activeStage, assistMode);
  const effectiveMultiplier = activeStage.multiplier * modeCfg.modeMultiplier;

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Top-right Language Settings Trigger */}
      <div className="fixed top-6 right-6 md:top-10 md:right-10 pointer-events-auto z-20">
        <button
          type="button"
          data-testid="open-language-settings"
          onClick={onOpenLanguageSettings}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0B101B]/90 border border-slate-700/70 hover:border-cyan-400 text-slate-200 hover:text-cyan-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="w-4 h-4 text-cyan-300" />
          <span>
            {t.title.languageBtnPrefix}: {t.title.languageName}
          </span>
        </button>
      </div>

      {/* Main Title + Mission Selector anchored over upper-left calm sky space */}
      <div className="pointer-events-auto max-w-2xl">
        <div className="flex items-center gap-3.5 mb-3">
          <svg
            viewBox="0 0 44 44"
            className="w-11 h-11 shrink-0"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="42"
              height="42"
              rx="8"
              fill="#0B101B"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {/* Tower */}
            <rect x="28" y="8" width="6" height="28" fill="#475569" />
            {/* Chopsticks */}
            <path d="M 10 18 L 28 16 L 28 19 L 10 20 Z" fill="#94a3b8" />
            {/* Starship silhouette */}
            <path
              d="M 15 33 L 15 17 Q 18 9 21 17 L 21 33 Z"
              fill="#e2e8f0"
            />
            {/* Plume */}
            <path d="M 16.5 33 L 19.5 33 L 18 39 Z" fill="#38bdf8" />
          </svg>
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-50 leading-none">
              Starship Mechazilla Catch
            </h1>
            <p className="text-sm text-slate-300 mt-1">{t.title.subtitle}</p>
          </div>
        </div>

        {/* Game Mode Toggle: Realistic vs Assisted */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#0B101B]/90 border border-slate-700/70 rounded-lg px-3.5 py-2.5">
          <div
            role="radiogroup"
            aria-label={t.title.modeSwitchAria}
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#060A13] border border-slate-800 shrink-0"
          >
            {(['realistic', 'assisted'] as AssistMode[]).map((modeId) => {
              const active = assistMode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-assist-mode={modeId}
                  onClick={() => onSelectAssistMode(modeId)}
                  className={`px-3 py-1.5 rounded text-xs font-display font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? modeId === 'assisted'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-slate-50'
                  }`}
                >
                  {getAssistModeLabel(modeId, locale)}
                </button>
              );
            })}
          </div>
          <div className="font-mono-tabular text-[11px] text-slate-300 leading-snug whitespace-nowrap">
            {assistMode === 'assisted'
              ? t.title.assistedSummary
              : t.title.realisticSummary}
          </div>
        </div>

        {/* Difficulty / Mission Selector */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {stages.map((stage) => {
            const selected = stage.id === selectedStageId;
            const stageFuelKg = getEffectiveInitialFuelKg(stage, assistMode);
            const stageCopy = getStageLocalized(stage.id, locale);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onSelectStage(stage.id)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
                  selected
                    ? 'bg-[#0F172A]/95 border-cyan-400 text-slate-50'
                    : 'bg-[#0B101B]/88 border-slate-700/70 text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-mono-tabular">
                  <span className={selected ? 'text-cyan-300 font-semibold' : 'text-slate-400'}>
                    0{stage.levelNumber}
                  </span>
                  <span className="text-slate-400">
                    {(stage.multiplier * modeCfg.modeMultiplier).toFixed(2).replace(/0$/, '')}×
                  </span>
                </div>
                <div className="font-display font-semibold text-sm mt-0.5 truncate">
                  {stageCopy.name}
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400 mt-1">
                  {t.title.fuelPrefix} {(stageFuelKg / 1000).toFixed(1)}t
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Parameters */}
        <div className="mt-3 bg-[#0B101B]/90 border border-slate-700/70 rounded-lg p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              {activeStageCopy.name} — {activeStageCopy.subtitle}
            </h2>
            <span className="font-mono-tabular text-xs text-cyan-300">
              {t.title.scoreMultiplier}{' '}
              {effectiveMultiplier.toFixed(2).replace(/0$/, '')}×
              {assistMode === 'assisted' ? ` ${t.title.modeMultiplierNote}` : ''}
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
            {activeStageCopy.strategyTip}
          </p>
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular text-xs">
            <div>
              <div className="text-slate-400">{t.title.initialAltitude}</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {activeStage.initialY.toLocaleString()} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">{t.title.initialOffsetX}</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {activeStage.initialX.toLocaleString()} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">{t.title.initialVelocity}</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                +{activeStage.initialVx}, {activeStage.initialVy} m/s
              </div>
            </div>
            <div>
              <div className="text-slate-400">{t.title.fuelLoad}</div>
              <div className="text-amber-300 font-semibold mt-0.5">
                {effectiveFuelKg.toLocaleString()} kg
                {assistMode === 'assisted' && (
                  <span className="text-emerald-300 text-[10px] ml-1">(+25%)</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.title.startMission}
            </button>
            {selectedStageId === 'easy' && (
              <button
                type="button"
                data-demo="true"
                onClick={onStartDemo}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/60 text-cyan-200 font-display font-semibold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t.title.watchDemo}</span>
              </button>
            )}
            <span className="text-xs text-slate-400 font-mono-tabular">
              {t.title.instantStartHint}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Safe Margin: Flat, Borderless Single-Line Control Hint */}
      <div className="text-xs font-mono-tabular text-slate-300/90 tracking-wide">
        {t.title.controlsFooter}
      </div>
    </div>
  );
};
