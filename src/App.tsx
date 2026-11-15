import { useCallback, useEffect, useRef, useState } from 'react';
import { DebriefModal } from './components/DebriefModal';
import { LanguageSettingsModal } from './components/LanguageSettingsModal';
import { PauseModal } from './components/PauseModal';
import { TelemetryHud } from './components/TelemetryHud';
import { TitleScreen } from './components/TitleScreen';
import { SoundEngine } from './game/audio';
import { computeEasyDemoGuidance } from './game/autopilot';
import { FIXED_DT, STAGES } from './game/constants';
import {
  detectBrowserLocale,
  getStageLocalized,
  loadLanguagePreference,
  resolveLocale,
  saveLanguagePreference,
  type LanguagePreference,
  type Locale,
} from './game/i18n';
import {
  calculateScore,
  createInitialRocketState,
  estimateHoverslamPrediction,
  evaluateOutcome,
  getEffectiveInitialFuelKg,
  interpolateRocketState,
  stepRocketPhysics,
  toTelemetryFrame,
} from './game/physics';
import { GameCanvasRenderer } from './game/renderer';
import type {
  AssistMode,
  ControlInput,
  DemoGuidanceOutput,
  DifficultyId,
  EngineCount,
  FlightMode,
  GamePhase,
  GameResult,
  OutcomeKind,
  RocketState,
  StageConfig,
  TelemetryFrame,
} from './game/types';

function getStageById(id: DifficultyId): StageConfig {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

function parseInitialParams(): {
  stageId: DifficultyId;
  assistMode: AssistMode;
  autostart: boolean;
  demo: boolean;
  langOverride: Locale | null;
} {
  if (typeof window === 'undefined') {
    return {
      stageId: 'easy',
      assistMode: 'realistic',
      autostart: false,
      demo: false,
      langOverride: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === '1';
  const assistParam = params.get('assist');
  const assistMode: AssistMode =
    !demo && assistParam === 'assisted' ? 'assisted' : 'realistic';
  const stageParam = params.get('stage');
  const validStage = demo
    ? 'easy'
    : STAGES.some((s) => s.id === stageParam)
      ? (stageParam as DifficultyId)
      : 'easy';
  const autostart = params.get('autostart') === '1';
  const langParam = params.get('lang');
  const langOverride: Locale | null =
    langParam === 'ja' || langParam === 'en' ? langParam : null;
  return { stageId: validStage, assistMode, autostart, demo, langOverride };
}

interface SimSession {
  mode: FlightMode;
  assistMode: AssistMode;
  stage: StageConfig;
  prevRocket: RocketState;
  rocket: RocketState;
  input: ControlInput;
  demoGuidance: DemoGuidanceOutput | null;
  telemetry: TelemetryFrame[];
  stepCounter: number;
  maxGForce: number;
  maxDynamicPressureKpa: number;
  outcome: OutcomeKind | null;
  accumulator: number;
  lastTimestamp: number;
}

export default function App() {
  const initialParams = parseInitialParams();
  const [browserLocaleInfo] = useState(() => detectBrowserLocale());
  const [langPreference, setLangPreference] = useState<LanguagePreference>(() =>
    loadLanguagePreference()
  );
  const [urlLangOverride, setUrlLangOverride] = useState<Locale | null>(
    initialParams.langOverride
  );
  const locale: Locale = resolveLocale(
    langPreference,
    browserLocaleInfo.locale,
    urlLangOverride
  );
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [flightMode, setFlightMode] = useState<FlightMode>('manual');
  const [assistMode, setAssistMode] = useState<AssistMode>(
    initialParams.assistMode
  );
  const [selectedStageId, setSelectedStageId] = useState<DifficultyId>(
    initialParams.stageId
  );
  const [timeWarp, setTimeWarp] = useState<1 | 5>(1);
  const [muted, setMuted] = useState(false);
  const [hudRocket, setHudRocket] = useState<RocketState>(() =>
    createInitialRocketState(
      getStageById(initialParams.stageId),
      initialParams.assistMode
    )
  );
  const [hudDemoGuidance, setHudDemoGuidance] =
    useState<DemoGuidanceOutput | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportSizeRef = useRef<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });

  const rendererRef = useRef<GameCanvasRenderer | null>(null);
  if (!rendererRef.current) {
    rendererRef.current = new GameCanvasRenderer();
  }
  const soundRef = useRef<SoundEngine | null>(null);
  if (!soundRef.current) {
    soundRef.current = new SoundEngine();
  }

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;
  const timeWarpRef = useRef<1 | 5>(timeWarp);
  timeWarpRef.current = timeWarp;
  const localeRef = useRef<Locale>(locale);
  localeRef.current = locale;
  const langModalOpenRef = useRef<boolean>(isLanguageModalOpen);
  langModalOpenRef.current = isLanguageModalOpen;

  const resultTimerRef = useRef<number | null>(null);
  const initialSimRocket = createInitialRocketState(
    getStageById(initialParams.stageId),
    initialParams.assistMode
  );
  const simRef = useRef<SimSession>({
    mode: 'manual',
    assistMode: initialParams.assistMode,
    stage: getStageById(initialParams.stageId),
    prevRocket: initialSimRocket,
    rocket: initialSimRocket,
    input: { gimbalLeft: false, gimbalRight: false, throttleHold: false },
    demoGuidance: null,
    telemetry: [],
    stepCounter: 0,
    maxGForce: 0,
    maxDynamicPressureKpa: 0,
    outcome: null,
    accumulator: 0,
    lastTimestamp: 0,
  });

  const clearPendingResultTimer = useCallback(() => {
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const clearHeldInputs = useCallback(() => {
    simRef.current.input.gimbalLeft = false;
    simRef.current.input.gimbalRight = false;
    simRef.current.input.throttleHold = false;
    soundRef.current?.setEngineThrust(0);
  }, []);

  // Sync body dataset state, flight mode, assist mode & resolved language
  useEffect(() => {
    document.body.dataset.state = phase;
    document.body.dataset.mode = flightMode;
    document.body.dataset.assistMode = assistMode;
    document.body.dataset.lang = locale;
    document.documentElement.lang = locale;
  }, [phase, flightMode, assistMode, locale]);

  const handleSelectLanguagePreference = useCallback((pref: LanguagePreference) => {
    soundRef.current?.playUiTick(540);
    setUrlLangOverride(null);
    setLangPreference(pref);
    saveLanguagePreference(pref);
  }, []);

  const startMission = useCallback(
    (
      stageIdOverride?: DifficultyId,
      modeOverride: FlightMode = 'manual',
      assistModeOverride?: AssistMode
    ) => {
      clearPendingResultTimer();
      setIsLanguageModalOpen(false);
      const targetMode: FlightMode = modeOverride;
      const targetAssistMode: AssistMode =
        targetMode === 'demo' ? 'realistic' : (assistModeOverride ?? assistMode);
      const targetId: DifficultyId =
        targetMode === 'demo' ? 'easy' : (stageIdOverride ?? selectedStageId);
      const stage = getStageById(targetId);
      let initialRocket = createInitialRocketState(stage, targetAssistMode);
      const initialGuidance =
        targetMode === 'demo'
          ? computeEasyDemoGuidance(initialRocket, localeRef.current)
          : null;
      if (initialGuidance) {
        initialRocket = {
          ...initialRocket,
          selectedEngines: initialGuidance.selectedEngines,
        };
      }

      soundRef.current?.ensureInit();
      soundRef.current?.setEngineThrust(0);
      soundRef.current?.playUiTick(targetMode === 'demo' ? 680 : 620);

      simRef.current = {
        mode: targetMode,
        assistMode: targetAssistMode,
        stage,
        prevRocket: initialRocket,
        rocket: initialRocket,
        input: initialGuidance
          ? { ...initialGuidance.input }
          : { gimbalLeft: false, gimbalRight: false, throttleHold: false },
        demoGuidance: initialGuidance,
        telemetry: [toTelemetryFrame(initialRocket, stage, targetAssistMode)],
        stepCounter: 0,
        maxGForce: initialRocket.gForce,
        maxDynamicPressureKpa: initialRocket.dynamicPressureKpa,
        outcome: null,
        accumulator: 0,
        lastTimestamp: 0,
      };

      rendererRef.current?.resetVisuals(initialRocket);
      setSelectedStageId(targetId);
      setFlightMode(targetMode);
      setAssistMode(targetAssistMode);
      setTimeWarp(1);
      timeWarpRef.current = 1;
      setGameResult(null);
      setHudRocket(initialRocket);
      setHudDemoGuidance(initialGuidance);
      setPhase('playing');
      phaseRef.current = 'playing';
      document.body.dataset.state = 'playing';
      document.body.dataset.mode = targetMode;
      document.body.dataset.assistMode = targetAssistMode;
    },
    [assistMode, clearPendingResultTimer, selectedStageId]
  );

  // Support ?autostart=1 (and optional ?demo=1 / ?assist=assisted) on initial load
  useEffect(() => {
    if (initialParams.autostart) {
      startMission(
        initialParams.stageId,
        initialParams.demo ? 'demo' : 'manual',
        initialParams.assistMode
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectEngines = useCallback((count: EngineCount) => {
    if (
      phaseRef.current !== 'playing' ||
      simRef.current.outcome !== null ||
      simRef.current.mode === 'demo'
    ) {
      return;
    }
    if (simRef.current.rocket.selectedEngines !== count) {
      const predCurrent = estimateHoverslamPrediction(simRef.current.rocket, count);
      simRef.current.rocket = {
        ...simRef.current.rocket,
        selectedEngines: count,
        hoverslamStopPinY: predCurrent.stopPinY,
        hoverslamCanStop: predCurrent.canStop,
      };
      soundRef.current?.playUiTick(420 + count * 45);
      setHudRocket({ ...simRef.current.rocket });
    }
  }, []);

  const handleToggleWarp = useCallback(() => {
    if (phaseRef.current !== 'playing' || simRef.current.outcome !== null) {
      return;
    }
    if (timeWarpRef.current === 5) {
      timeWarpRef.current = 1;
      setTimeWarp(1);
      soundRef.current?.playUiTick(440);
      return;
    }
    const eligible =
      simRef.current.rocket.y >= 2_000 && !simRef.current.input.throttleHold;
    if (eligible) {
      timeWarpRef.current = 5;
      setTimeWarp(5);
      soundRef.current?.playUiTick(740);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundRef.current?.toggleMute() ?? false;
    setMuted(nextMuted);
  }, []);

  const handlePauseToggle = useCallback(() => {
    if (phaseRef.current === 'playing' && simRef.current.outcome === null) {
      clearHeldInputs();
      simRef.current.lastTimestamp = 0;
      setPhase('paused');
      phaseRef.current = 'paused';
    } else if (phaseRef.current === 'paused') {
      simRef.current.lastTimestamp = 0;
      setPhase('playing');
      phaseRef.current = 'playing';
    }
  }, [clearHeldInputs]);

  const handleQuitToTitle = useCallback(() => {
    clearPendingResultTimer();
    clearHeldInputs();
    setTimeWarp(1);
    timeWarpRef.current = 1;
    setGameResult(null);
    setPhase('title');
    phaseRef.current = 'title';
  }, [clearHeldInputs, clearPendingResultTimer]);

  // Global keyboard bindings & window blur safety
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (key === 'm') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (phaseRef.current === 'title') {
        if (langModalOpenRef.current) {
          if (code === 'Escape') {
            e.preventDefault();
            setIsLanguageModalOpen(false);
          }
          return;
        }
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          startMission();
        }
        return;
      }

      if (code === 'Escape' || key === 'p') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
          e.preventDefault();
          handlePauseToggle();
        }
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        startMission(simRef.current.stage.id, simRef.current.mode);
        return;
      }

      if (phaseRef.current !== 'playing') {
        return;
      }

      if (key === 't') {
        e.preventDefault();
        handleToggleWarp();
        return;
      }

      // Watch-only mode: manual flight steering and engine selection keys are ignored
      if (simRef.current.mode === 'demo') {
        return;
      }

      if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        simRef.current.input.gimbalLeft = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        simRef.current.input.gimbalRight = true;
      } else if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
        e.preventDefault();
        soundRef.current?.ensureInit();
        simRef.current.input.throttleHold = true;
        if (timeWarpRef.current === 5) {
          timeWarpRef.current = 1;
          setTimeWarp(1);
        }
      } else if (key === '1') {
        handleSelectEngines(1);
      } else if (key === '2') {
        handleSelectEngines(2);
      } else if (key === '3') {
        handleSelectEngines(3);
      } else if (key === '4' || key === '6') {
        handleSelectEngines(6);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (simRef.current.mode === 'demo') {
        return;
      }
      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') {
        simRef.current.input.gimbalLeft = false;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        simRef.current.input.gimbalRight = false;
      } else if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
        simRef.current.input.throttleHold = false;
      }
    };

    const onBlur = () => {
      clearHeldInputs();
      simRef.current.lastTimestamp = 0;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearHeldInputs();
        simRef.current.lastTimestamp = 0;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    clearHeldInputs,
    handlePauseToggle,
    handleSelectEngines,
    handleToggleMute,
    handleToggleWarp,
    startMission,
  ]);

  // Responsive HiDPI Canvas Sizing via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(240, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      viewportSizeRef.current = { width, height };
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Main Decoupled Physics & Render Loop
  useEffect(() => {
    let rafId = 0;
    let hudSyncCounter = 0;
    let pausedRendered = false;
    let gameoverElapsed = 0;
    let lastResizeKey = '';

    const tick = (timestamp: number) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      const sound = soundRef.current;
      if (!canvas || !renderer) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const { width, height } = viewportSizeRef.current;
      const resizeKey = `${width}x${height}x${canvas.width}`;
      const sizeChanged = resizeKey !== lastResizeKey;
      lastResizeKey = resizeKey;

      const dpr = canvas.width / Math.max(1, width);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const currentPhase = phaseRef.current;

      if (currentPhase === 'title') {
        pausedRendered = false;
        gameoverElapsed = 0;
        renderer.renderTitleBackdrop(ctx, width, height, timestamp * 0.001);
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const sim = simRef.current;

      if (currentPhase === 'playing') {
        pausedRendered = false;
        gameoverElapsed = 0;

        if (sim.lastTimestamp === 0) {
          sim.lastTimestamp = timestamp;
        }
        const rawDt = Math.min(0.1, Math.max(0, (timestamp - sim.lastTimestamp) / 1000));
        sim.lastTimestamp = timestamp;

        if (sim.outcome === null) {
          let discreteHudSync = false;

          if (sim.mode === 'demo') {
            const preGuidance = computeEasyDemoGuidance(sim.rocket, localeRef.current);
            if (
              timeWarpRef.current === 5 &&
              (sim.rocket.y < 2_000 || preGuidance.input.throttleHold)
            ) {
              timeWarpRef.current = 1;
              setTimeWarp(1);
            }
          } else if (
            timeWarpRef.current === 5 &&
            (sim.rocket.y < 2_000 || sim.input.throttleHold)
          ) {
            timeWarpRef.current = 1;
            setTimeWarp(1);
          }

          sim.accumulator += rawDt * timeWarpRef.current;
          let steps = 0;
          const maxSteps = 32;

          while (sim.accumulator >= FIXED_DT && steps < maxSteps) {
            sim.accumulator -= FIXED_DT;
            steps += 1;

            if (sim.mode === 'demo') {
              const guidance = computeEasyDemoGuidance(sim.rocket, localeRef.current);
              const prevGuidance = sim.demoGuidance;
              if (guidance.selectedEngines !== sim.rocket.selectedEngines) {
                sim.rocket = {
                  ...sim.rocket,
                  selectedEngines: guidance.selectedEngines,
                };
                sound?.playUiTick(420 + guidance.selectedEngines * 45);
                discreteHudSync = true;
              }
              if (
                !prevGuidance ||
                prevGuidance.phaseId !== guidance.phaseId ||
                prevGuidance.input.throttleHold !== guidance.input.throttleHold ||
                prevGuidance.input.gimbalLeft !== guidance.input.gimbalLeft ||
                prevGuidance.input.gimbalRight !== guidance.input.gimbalRight
              ) {
                discreteHudSync = true;
              }
              sim.input = guidance.input;
              sim.demoGuidance = guidance;

              if (
                timeWarpRef.current === 5 &&
                (sim.rocket.y < 2_000 || guidance.input.throttleHold)
              ) {
                timeWarpRef.current = 1;
                setTimeWarp(1);
                sim.accumulator = 0;
              }
            }

            sim.prevRocket = sim.rocket;
            sim.rocket = stepRocketPhysics(sim.rocket, sim.input, FIXED_DT);
            sim.stepCounter += 1;

            if (sim.rocket.gForce > sim.maxGForce) {
              sim.maxGForce = sim.rocket.gForce;
            }
            if (sim.rocket.dynamicPressureKpa > sim.maxDynamicPressureKpa) {
              sim.maxDynamicPressureKpa = sim.rocket.dynamicPressureKpa;
            }

            if (sim.stepCounter % 6 === 0) {
              sim.telemetry.push(
                toTelemetryFrame(sim.rocket, sim.stage, sim.assistMode)
              );
            }

            const check = evaluateOutcome(sim.rocket, sim.assistMode, localeRef.current);
            if (check.terminated && check.outcome) {
              sim.outcome = check.outcome;
              sim.accumulator = 0;

              const finalFrame = toTelemetryFrame(
                sim.rocket,
                sim.stage,
                sim.assistMode
              );
              const lastRecorded = sim.telemetry[sim.telemetry.length - 1];
              if (!lastRecorded || lastRecorded.time !== finalFrame.time) {
                sim.telemetry.push(finalFrame);
              }

              const isSuccess = check.outcome === 'CATCH_SUCCESS';
              const score = isSuccess
                ? calculateScore(sim.rocket, sim.stage, sim.assistMode)
                : null;

              if (isSuccess) {
                const caughtRocketSnapshot = { ...sim.rocket };
                sim.rocket = {
                  ...sim.rocket,
                  vx: 0,
                  vy: 0,
                  omega: 0,
                  activeEngines: 0,
                  throttleOn: false,
                };
                renderer.triggerCatchClamp(caughtRocketSnapshot);
                sound?.playCatchSuccess();
              } else {
                renderer.triggerExplosion(sim.rocket.x, sim.rocket.y);
                sound?.playExplosion();
              }

              if (timeWarpRef.current !== 1) {
                timeWarpRef.current = 1;
                setTimeWarp(1);
              }
              clearHeldInputs();
              setHudRocket({ ...sim.rocket });
              setHudDemoGuidance(sim.demoGuidance);

              const resultPayload: GameResult = {
                mode: sim.mode,
                assistMode: sim.assistMode,
                initialFuelKg: getEffectiveInitialFuelKg(sim.stage, sim.assistMode),
                outcome: check.outcome,
                success: isSuccess,
                reason: check.reason,
                stage: sim.stage,
                finalFrame,
                score,
                telemetry: sim.telemetry,
                pinDeltaX: check.pinDeltaX,
                pinDeltaY: check.pinDeltaY,
                impactSpeed: check.impactSpeed,
                maxGForce: sim.maxGForce,
                maxDynamicPressureKpa: sim.maxDynamicPressureKpa,
                flightDuration: sim.rocket.time,
              };

              clearPendingResultTimer();
              resultTimerRef.current = window.setTimeout(
                () => {
                  resultTimerRef.current = null;
                  setGameResult(resultPayload);
                  setPhase('gameover');
                  phaseRef.current = 'gameover';
                },
                isSuccess ? 550 : 650
              );
              break;
            }
          }

          hudSyncCounter += 1;
          if ((hudSyncCounter >= 6 || discreteHudSync) && sim.outcome === null) {
            hudSyncCounter = 0;
            setHudRocket({ ...sim.rocket });
            if (sim.mode === 'demo') {
              setHudDemoGuidance(sim.demoGuidance);
            }
          }
        }

        const renderAlpha =
          sim.outcome === null
            ? Math.max(0, Math.min(1, sim.accumulator / FIXED_DT))
            : 1;
        const renderRocket =
          sim.outcome === null
            ? interpolateRocketState(sim.prevRocket, sim.rocket, renderAlpha)
            : sim.rocket;

        sound?.setEngineThrust(sim.outcome ? 0 : sim.rocket.activeEngines);
        renderer.updateEffects(renderRocket, rawDt, sim.outcome);
        renderer.render(
          ctx,
          width,
          height,
          renderRocket,
          sim.outcome,
          sim.mode === 'demo',
          sim.assistMode,
          localeRef.current,
          rawDt
        );
      } else if (currentPhase === 'paused') {
        if (!pausedRendered || sizeChanged) {
          renderer.render(
            ctx,
            width,
            height,
            sim.rocket,
            sim.outcome,
            sim.mode === 'demo',
            sim.assistMode,
            localeRef.current
          );
          pausedRendered = true;
        }
        rafId = 0;
        return;
      } else if (currentPhase === 'gameover') {
        if (sim.lastTimestamp === 0) {
          sim.lastTimestamp = timestamp;
        }
        const rawDt = Math.min(0.05, Math.max(0, (timestamp - sim.lastTimestamp) / 1000));
        sim.lastTimestamp = timestamp;

        if (gameoverElapsed < 1.2 || sizeChanged) {
          gameoverElapsed += rawDt;
          renderer.updateEffects(sim.rocket, rawDt, sim.outcome);
          renderer.render(
            ctx,
            width,
            height,
            sim.rocket,
            sim.outcome,
            sim.mode === 'demo',
            sim.assistMode,
            localeRef.current
          );
          rafId = window.requestAnimationFrame(tick);
        } else {
          rafId = 0;
        }
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [clearHeldInputs, phase]);

  // Dispose Web Audio context and timers cleanly on unmount
  useEffect(() => {
    return () => {
      clearPendingResultTimer();
      soundRef.current?.dispose();
    };
  }, [clearPendingResultTimer]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#05080F] text-slate-100">
      {/* Isolated Canvas Sibling */}
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Phase Overlays */}
      {phase === 'title' && (
        <TitleScreen
          stages={STAGES}
          selectedStageId={selectedStageId}
          assistMode={assistMode}
          locale={locale}
          onSelectStage={(id) => {
            soundRef.current?.playUiTick(500);
            setSelectedStageId(id);
          }}
          onSelectAssistMode={(mode) => {
            soundRef.current?.playUiTick(mode === 'assisted' ? 580 : 480);
            setAssistMode(mode);
          }}
          onOpenLanguageSettings={() => {
            soundRef.current?.playUiTick(560);
            setIsLanguageModalOpen(true);
          }}
          onStart={() => startMission(selectedStageId, 'manual', assistMode)}
          onStartDemo={() => startMission('easy', 'demo', 'realistic')}
        />
      )}

      {phase === 'title' && isLanguageModalOpen && (
        <LanguageSettingsModal
          preference={langPreference}
          resolvedLocale={locale}
          browserInfo={browserLocaleInfo}
          onSelectPreference={handleSelectLanguagePreference}
          onClose={() => {
            soundRef.current?.playUiTick(480);
            setIsLanguageModalOpen(false);
          }}
        />
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <TelemetryHud
          state={hudRocket}
          stage={simRef.current.stage}
          assistMode={simRef.current.assistMode}
          flightMode={flightMode}
          locale={locale}
          demoGuidance={hudDemoGuidance}
          timeWarp={timeWarp}
          muted={muted}
          onSelectEngines={handleSelectEngines}
          onToggleWarp={handleToggleWarp}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
          onRetry={() =>
            startMission(
              simRef.current.stage.id,
              simRef.current.mode,
              simRef.current.assistMode
            )
          }
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          stageName={`${getStageLocalized(simRef.current.stage.id, locale).name} — ${getStageLocalized(simRef.current.stage.id, locale).subtitle}`}
          assistMode={simRef.current.assistMode}
          flightMode={flightMode}
          locale={locale}
          onResume={handlePauseToggle}
          onRestart={() =>
            startMission(
              simRef.current.stage.id,
              simRef.current.mode,
              simRef.current.assistMode
            )
          }
          onSwitchToManual={() => startMission('easy', 'manual', assistMode)}
          onQuitToTitle={handleQuitToTitle}
        />
      )}

      {phase === 'gameover' && gameResult && (
        <DebriefModal
          result={gameResult}
          locale={locale}
          onRetry={() =>
            startMission(
              gameResult.stage.id,
              gameResult.mode,
              gameResult.assistMode
            )
          }
          onPlayManual={() =>
            startMission(gameResult.stage.id, 'manual', assistMode)
          }
          onMissionSelect={handleQuitToTitle}
        />
      )}
    </main>
  );
}
