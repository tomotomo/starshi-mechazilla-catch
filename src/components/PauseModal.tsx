import React from 'react';
import { getAssistModeLabel, getTranslations, type Locale } from '../game/i18n';
import type { AssistMode, FlightMode } from '../game/types';

export interface PauseModalProps {
  stageName: string;
  assistMode: AssistMode;
  flightMode: FlightMode;
  locale: Locale;
  onResume: () => void;
  onRestart: () => void;
  onSwitchToManual?: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  stageName,
  assistMode,
  flightMode,
  locale,
  onResume,
  onRestart,
  onSwitchToManual,
  onQuitToTitle,
}) => {
  const isDemo = flightMode === 'demo';
  const t = getTranslations(locale);
  const modeLabel = getAssistModeLabel(assistMode, locale);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isDemo ? t.pause.demoAria : t.pause.manualAria}
      className="fixed inset-0 bg-[#05080F]/80 flex items-center justify-center p-4 z-30"
    >
      <div className="w-full max-w-sm bg-[#0B101B] border border-slate-700/80 rounded-xl p-6">
        <div className="text-xs font-mono-tabular text-slate-400">
          {stageName}
          {isDemo ? ` · ${t.pause.demoTag}` : ` · ${modeLabel}`}
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-50 mt-1">
          {isDemo ? t.pause.demoTitle : t.pause.manualTitle}
        </h2>
        <p className="text-sm text-slate-400 mt-1.5">
          {isDemo ? t.pause.demoHint : t.pause.manualHint}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer"
          >
            {isDemo ? t.pause.resumeDemo : t.pause.resumeManual}
          </button>
          {isDemo && onSwitchToManual && (
            <button
              type="button"
              onClick={onSwitchToManual}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/60 text-cyan-200 font-display font-semibold text-sm transition-colors cursor-pointer"
            >
              {t.pause.playManual}
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
          >
            {isDemo ? t.pause.restartDemo : t.pause.restartManual}
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-slate-800/70 border border-slate-700 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
          >
            {t.pause.missionSelect}
          </button>
        </div>
      </div>
    </div>
  );
};
