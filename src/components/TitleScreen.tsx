import React from 'react';
import { Play } from 'lucide-react';
import type { DifficultyId, StageConfig } from '../game/types';

export interface TitleScreenProps {
  stages: StageConfig[];
  selectedStageId: DifficultyId;
  onSelectStage: (id: DifficultyId) => void;
  onStart: () => void;
  onStartDemo: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  stages,
  selectedStageId,
  onSelectStage,
  onStart,
  onStartDemo,
}) => {
  const activeStage =
    stages.find((s) => s.id === selectedStageId) ?? stages[0];

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-10">
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
            <p className="text-sm text-slate-300 mt-1">
              2D剛体物理演算 × ツィオルコフスキー燃料制限ランディングシミュレーション
            </p>
          </div>
        </div>

        {/* Difficulty / Mission Selector */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {stages.map((stage) => {
            const selected = stage.id === selectedStageId;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onSelectStage(stage.id)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  selected
                    ? 'bg-[#0F172A]/95 border-cyan-400 text-slate-50'
                    : 'bg-[#0B101B]/88 border-slate-700/70 text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-mono-tabular">
                  <span className={selected ? 'text-cyan-300 font-semibold' : 'text-slate-400'}>
                    0{stage.levelNumber}
                  </span>
                  <span className="text-slate-400">{stage.multiplier.toFixed(1)}×</span>
                </div>
                <div className="font-display font-semibold text-sm mt-0.5 truncate">
                  {stage.name}
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400 mt-1">
                  燃料 {(stage.initialFuelKg / 1000).toFixed(1)}t
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Parameters */}
        <div className="mt-3 bg-[#0B101B]/90 border border-slate-700/70 rounded-lg p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              {activeStage.name} — {activeStage.subtitle}
            </h2>
            <span className="font-mono-tabular text-xs text-cyan-300">
              スコア倍率 {activeStage.multiplier.toFixed(1)}×
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
            {activeStage.strategyTip}
          </p>
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular text-xs">
            <div>
              <div className="text-slate-400">初期高度</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {activeStage.initialY.toLocaleString()} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">初期水平位置</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {activeStage.initialX.toLocaleString()} m
              </div>
            </div>
            <div>
              <div className="text-slate-400">初期速度 (vx, vy)</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                +{activeStage.initialVx}, {activeStage.initialVy} m/s
              </div>
            </div>
            <div>
              <div className="text-slate-400">搭載燃料</div>
              <div className="text-amber-300 font-semibold mt-0.5">
                {activeStage.initialFuelKg.toLocaleString()} kg
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
              Start Mission
            </button>
            {selectedStageId === 'easy' && (
              <button
                type="button"
                data-demo="true"
                onClick={onStartDemo}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/60 text-cyan-200 font-display font-semibold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>お手本を見る</span>
              </button>
            )}
            <span className="text-xs text-slate-400 font-mono-tabular">
              Enter または Space で即座に開始
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Safe Margin: Flat, Borderless Single-Line Control Hint */}
      <div className="text-xs font-mono-tabular text-slate-300/90 tracking-wide">
        A / D ジンバル操舵 · W / Space エンジン点火 · 1 / 2 / 3 / 4(6) 基数切替 · T タイムワープ · R リトライ · P 一時停止
      </div>
    </div>
  );
};
