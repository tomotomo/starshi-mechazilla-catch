import React from 'react';
import type { FlightMode } from '../game/types';

export interface PauseModalProps {
  stageName: string;
  flightMode: FlightMode;
  onResume: () => void;
  onRestart: () => void;
  onSwitchToManual?: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  stageName,
  flightMode,
  onResume,
  onRestart,
  onSwitchToManual,
  onQuitToTitle,
}) => {
  const isDemo = flightMode === 'demo';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isDemo ? 'お手本再生 一時停止' : 'Simulation Paused'}
      className="fixed inset-0 bg-[#05080F]/80 flex items-center justify-center p-4 z-30"
    >
      <div className="w-full max-w-sm bg-[#0B101B] border border-slate-700/80 rounded-xl p-6">
        <div className="text-xs font-mono-tabular text-slate-400">
          {stageName}
          {isDemo ? ' · お手本モード（観戦専用）' : ''}
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-50 mt-1">
          {isDemo ? 'お手本再生 一時停止' : 'Simulation Paused'}
        </h2>
        <p className="text-sm text-slate-400 mt-1.5">
          {isDemo
            ? 'Esc または P で観戦を再開します。'
            : 'Press Esc or P to resume flight control.'}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer"
          >
            {isDemo ? '観戦を再開' : 'Resume Flight'}
          </button>
          {isDemo && onSwitchToManual && (
            <button
              type="button"
              onClick={onSwitchToManual}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/60 text-cyan-200 font-display font-semibold text-sm transition-colors cursor-pointer"
            >
              自分で挑戦（手動プレイ）
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
          >
            {isDemo ? 'お手本をやり直す [R]' : 'Restart Mission [R]'}
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-slate-800/70 border border-slate-700 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
          >
            Mission Select
          </button>
        </div>
      </div>
    </div>
  );
};
