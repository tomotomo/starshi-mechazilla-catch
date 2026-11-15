import type { AssistMode, DifficultyId, EngineCount, OutcomeKind } from './types';

export type Locale = 'ja' | 'en';
export type LanguagePreference = 'auto' | Locale;

export const LANG_STORAGE_KEY = 'starship-mechazilla-lang-pref';

export interface BrowserLocaleInfo {
  locale: Locale;
  rawTag: string;
}

export function detectBrowserLocale(
  nav: Pick<Navigator, 'language' | 'languages'> | null | undefined =
    typeof navigator !== 'undefined' ? navigator : null
): BrowserLocaleInfo {
  if (!nav) {
    return { locale: 'en', rawTag: 'en' };
  }
  const candidates =
    Array.isArray(nav.languages) && nav.languages.length > 0
      ? nav.languages
      : nav.language
        ? [nav.language]
        : ['en'];

  const primary = candidates.find((tag) => typeof tag === 'string' && tag.trim().length > 0) ?? 'en';
  const normalized = primary.trim().toLowerCase();
  const locale: Locale = normalized.startsWith('ja') ? 'ja' : 'en';
  return { locale, rawTag: primary };
}

export function loadLanguagePreference(): LanguagePreference {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'auto';
    }
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'ja' || stored === 'en' || stored === 'auto') {
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return 'auto';
}

export function saveLanguagePreference(pref: LanguagePreference): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANG_STORAGE_KEY, pref);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function resolveLocale(
  preference: LanguagePreference,
  browserLocale: Locale,
  urlOverride?: Locale | null
): Locale {
  if (urlOverride === 'ja' || urlOverride === 'en') {
    return urlOverride;
  }
  return preference === 'auto' ? browserLocale : preference;
}

export function getAssistModeLabel(mode: AssistMode, locale: Locale): string {
  if (locale === 'en') {
    return mode === 'assisted' ? 'Assisted Mode' : 'Realistic Mode';
  }
  return mode === 'assisted' ? '簡易モード (Assisted)' : '通常モード (Realistic)';
}

export function getAssistModeShortLabel(mode: AssistMode, locale: Locale): string {
  if (locale === 'en') {
    return mode === 'assisted' ? 'Assisted' : 'Realistic';
  }
  return mode === 'assisted' ? '簡易 (Assisted)' : '通常 (Realistic)';
}

export interface StageLocalizedCopy {
  name: string;
  subtitle: string;
  strategyTip: string;
}

const STAGE_COPY: Record<Locale, Record<DifficultyId, StageLocalizedCopy>> = {
  ja: {
    easy: {
      name: '上空 3km',
      subtitle: '最終着陸フェーズ',
      strategyTip:
        '最終着陸フェーズ。3基で一気に減速し、高度200m付近から1基に切り替えてピンを捉えます。',
    },
    normal: {
      name: '上空 10km',
      subtitle: '亜音速終端降下',
      strategyTip:
        '空力で水平位置をタワーへ誘導しつつ終端速度まで落としてから、6基または3基でHoverslam。',
    },
    hard: {
      name: '上空 50km',
      subtitle: '成層圏ベリーフロップ',
      strategyTip:
        '機体の腹を進行方向へ向けるベリーフロップで空気抵抗を最大化しないと燃料が足りません。',
    },
    extreme: {
      name: '地球低軌道 (LEO)',
      subtitle: '軌道離脱バーン & 再突入',
      strategyTip:
        '高度215km・vy=0の逆向き軌道から開始。まず6基で水平速度 vx +1,460 m/s（Δv 約-540 m/s・約5秒）まで逆噴射して軌道離脱し、機首を +55°〜+75° へ起こしてプラズマ再突入で減速・着陸します。',
    },
  },
  en: {
    easy: {
      name: '3 km Approach',
      subtitle: 'Final Landing Phase',
      strategyTip:
        'Final landing approach. Arrest descent with 3 engines, then step down to 1 engine around 200 m to thread the catch pin.',
    },
    normal: {
      name: '10 km Descent',
      subtitle: 'Subsonic Terminal Descent',
      strategyTip:
        'Steer aerodynamically toward the tower while bleeding speed to terminal velocity, then execute a 6- or 3-engine Hoverslam.',
    },
    hard: {
      name: '50 km Reentry',
      subtitle: 'Stratospheric Belly Flop',
      strategyTip:
        'Hold a broadside belly-flop attitude into the airstream to maximize drag—without aero braking you will run out of fuel.',
    },
    extreme: {
      name: 'Low Earth Orbit (LEO)',
      subtitle: 'Orbital Deorbit & Reentry',
      strategyTip:
        'Starts at 215 km (vy=0) facing retrograde (-90°). First burn 6 ENG retrograde down to vx +1,460 m/s (Δv ~540 m/s, ~5s burn), then pitch nose +55° to +75° for plasma reentry before Hoverslam.',
    },
  },
};

export function getStageLocalized(
  stageId: DifficultyId,
  locale: Locale
): StageLocalizedCopy {
  return STAGE_COPY[locale][stageId];
}

export function formatOutcomeReason(
  outcome: OutcomeKind,
  locale: Locale,
  details: {
    vx: number;
    vy: number;
    pitchDeg: number;
    maxShipX: number;
    shipY: number;
    speed: number;
    pinX: number;
  }
): string {
  if (locale === 'en') {
    switch (outcome) {
      case 'CATCH_SUCCESS':
        return 'Mechazilla Chopstick Catch Confirmed';
      case 'RUD_CATCH_FAIL':
        return `Catch Arm Impact: |vx|=${Math.abs(details.vx).toFixed(1)} m/s, |vy|=${Math.abs(details.vy).toFixed(1)} m/s, Pitch=${details.pitchDeg.toFixed(1)}°`;
      case 'RUD_TOWER':
        return `Launch Tower Collision at x=${details.maxShipX.toFixed(1)}m, y=${details.shipY.toFixed(1)}m (${details.speed.toFixed(1)} m/s)`;
      case 'RUD_GROUND':
        return `Ground Pad Impact at ${details.speed.toFixed(1)} m/s (Δx=${details.pinX.toFixed(1)}m, Pitch=${details.pitchDeg.toFixed(1)}°)`;
    }
  }
  switch (outcome) {
    case 'CATCH_SUCCESS':
      return 'Mechazilla チョップスティックによる空中捕獲を確認';
    case 'RUD_CATCH_FAIL':
      return `キャッチアーム衝突: |vx|=${Math.abs(details.vx).toFixed(1)} m/s, |vy|=${Math.abs(details.vy).toFixed(1)} m/s, 姿勢=${details.pitchDeg.toFixed(1)}°`;
    case 'RUD_TOWER':
      return `発射タワー衝突 (x=${details.maxShipX.toFixed(1)}m, y=${details.shipY.toFixed(1)}m, ${details.speed.toFixed(1)} m/s)`;
    case 'RUD_GROUND':
      return `地上パッド激突 (${details.speed.toFixed(1)} m/s · Δx=${details.pinX.toFixed(1)}m · 姿勢=${details.pitchDeg.toFixed(1)}°)`;
  }
}

export interface TranslationDict {
  common: {
    engineUnit: (count: EngineCount | number) => string;
    close: string;
  };
  title: {
    subtitle: string;
    languageBtnPrefix: string;
    languageName: string;
    modeSwitchAria: string;
    assistedSummary: string;
    realisticSummary: string;
    fuelPrefix: string;
    scoreMultiplier: string;
    modeMultiplierNote: string;
    initialAltitude: string;
    initialOffsetX: string;
    initialVelocity: string;
    fuelLoad: string;
    startMission: string;
    watchDemo: string;
    instantStartHint: string;
    controlsFooter: string;
  };
  languageModal: {
    title: string;
    subtitle: string;
    radioGroupAria: string;
    autoTitle: string;
    autoDesc: string;
    detectedPrefix: string;
    detectedJapanese: string;
    detectedEnglish: string;
    jaTitle: string;
    jaDesc: string;
    enTitle: string;
    enDesc: string;
    doneBtn: string;
  };
  hud: {
    demoBadgeSuffix: string;
    orbitalCoast: string;
    reentryPlasma: string;
    deorbitBurnTitle: string;
    deorbitBurnGuide: (targetVx: number, dvLeft: number) => string;
    deorbitDoneTitle: string;
    deorbitDoneGuide: (currentVx: number) => string;
    warpTitle: string;
    muteAria: string;
    unmuteAria: string;
    retryTitle: string;
    pauseTitle: string;
    altGaugeAria: string;
    stop3Title: string;
    stopCurrTitle: string;
    burnNow: string;
    boostWarn: string;
    padLabel: string;
    stopAltUnavailable: string;
    speed: string;
    altPin: string;
    offsetX: string;
    velXY: string;
    gAndQ: string;
    stopAlt: string;
    raptorThrust: string;
    gimbal: string;
    propellant: string;
  };
  pause: {
    demoAria: string;
    manualAria: string;
    demoTag: string;
    demoTitle: string;
    manualTitle: string;
    demoHint: string;
    manualHint: string;
    resumeDemo: string;
    resumeManual: string;
    playManual: string;
    restartDemo: string;
    restartManual: string;
    missionSelect: string;
  };
  debrief: {
    dialogAria: string;
    demoCompleted: string;
    flightTime: string;
    successTitle: string;
    failTitle: string;
    totalScore: string;
    stageLabel: string;
    modeLabel: string;
    impactSpeed: string;
    posAccuracy: string;
    errorLabel: string;
    velAttitude: string;
    fuelEfficiency: string;
    remainingLabel: string;
    maxLoad: string;
    finalPinOffset: string;
    finalFuel: string;
    maxG: string;
    maxQ: string;
    telemetryTitle: string;
    telemetrySub: string;
    noSamples: string;
    samplesCount: (count: number) => string;
    trajectoryTitle: string;
    burnLegend: string;
    coastLegend: string;
    downloadCsv: string;
    copiedJson: string;
    copyJson: string;
    missionSelect: string;
    watchDemoAgain: string;
    tryYourself: string;
    retryMission: string;
    series: {
      altitude: string;
      velY: string;
      velX: string;
      fuelPct: string;
      activeEngines: string;
      gForce: string;
    };
  };
  canvas: {
    burnNow: (stopM: number) => string;
    dangerNoDecel: string;
    dangerPullUp: (detail: string) => string;
    burnTarget: (stopM: number) => string;
    lzDistance: (formattedDist: string) => string;
  };
}

export const TRANSLATIONS: Record<Locale, TranslationDict> = {
  ja: {
    common: {
      engineUnit: (count) => `${count}基`,
      close: '閉じる',
    },
    title: {
      subtitle: '2D剛体物理演算 × ツィオルコフスキー燃料制限ランディングシミュレーション',
      languageBtnPrefix: '言語',
      languageName: '日本語',
      modeSwitchAria: 'ゲームモード切替',
      assistedSummary: '燃料 +25% · ±8m / 6.0m/s / 12° · ガイドON · 0.7×',
      realisticSummary: '標準燃料 · ±4m / 2.5m/s / 5° · ガイドOFF · 1.0×',
      fuelPrefix: '燃料',
      scoreMultiplier: 'スコア倍率',
      modeMultiplierNote: '(モード 0.7×)',
      initialAltitude: '初期高度',
      initialOffsetX: '初期水平位置',
      initialVelocity: '初期速度 (vx, vy)',
      fuelLoad: '搭載燃料',
      startMission: 'ミッション開始',
      watchDemo: 'お手本を見る',
      instantStartHint: 'Enter または Space で即座に開始',
      controlsFooter:
        'A / D ジンバル操舵 · W / Space エンジン点火 · 1 / 2 / 3 / 4(6) 基数切替 · T タイムワープ · R リトライ · P 一時停止',
    },
    languageModal: {
      title: '言語設定',
      subtitle: '表示言語の選択とブラウザ言語の自動判定を設定します',
      radioGroupAria: '表示言語選択',
      autoTitle: 'ブラウザ設定に合わせる（自動）',
      autoDesc: 'お使いのブラウザ言語設定に応じて日本語・英語を自動的に切り替えます',
      detectedPrefix: '現在のブラウザ判定:',
      detectedJapanese: '日本語',
      detectedEnglish: 'English',
      jaTitle: '日本語',
      jaDesc: 'すべてのUI・解説・ガイドを日本語で表示します',
      enTitle: 'English',
      enDesc: 'すべてのUI・解説・ガイドを英語（English）で表示します',
      doneBtn: '完了',
    },
    hud: {
      demoBadgeSuffix: 'お手本再生中（観戦専用）',
      orbitalCoast: '軌道上 (離脱バーン待機)',
      reentryPlasma: '再突入プラズマ',
      deorbitBurnTitle: '軌道離脱バーン目標',
      deorbitBurnGuide: (targetVx, dvLeft) =>
        `6基 [4] を選択し -90° 姿勢のまま 目標 VX +${targetVx.toLocaleString()} m/s まで逆噴射（残り減速量 -${dvLeft} m/s · 約5秒でカット）`,
      deorbitDoneTitle: '軌道離脱バーン完了',
      deorbitDoneGuide: (currentVx) =>
        `現在 VX +${currentVx.toLocaleString()} m/s — エンジンOFFのまま D キーで機首を +55°〜+75°（黒耐熱タイル下向き）へ起こし、[T] でタイムワープ`,
      warpTitle:
        'タイムワープ [T] (1×/5×/10×/20×) — 高度 2,000m 以上・エンジンOFF時のみ使用可能',
      muteAria: '音声をミュート',
      unmuteAria: '音声ミュートを解除',
      retryTitle: 'リトライ [R]',
      pauseTitle: '一時停止 [P / Esc]',
      altGaugeAria: 'Hoverslam 停止予測高度計',
      stop3Title: '3基噴射時の停止予測高度',
      stopCurrTitle: '選択中エンジンでの停止予測高度',
      burnNow: '今すぐ点火!',
      boostWarn: '増基/警戒',
      padLabel: '-60m 地上',
      stopAltUnavailable: '不可',
      speed: '対気速度',
      altPin: '高度 (ピン)',
      offsetX: '水平ズレ X',
      velXY: '速度 X / Y',
      gAndQ: 'G負荷 / 動圧',
      stopAlt: '停止予測',
      raptorThrust: 'Raptor 推力',
      gimbal: 'ジンバル角',
      propellant: '推進剤 (CH4/LOX)',
    },
    pause: {
      demoAria: 'お手本再生 一時停止',
      manualAria: 'シミュレーション一時停止',
      demoTag: 'お手本モード（観戦専用）',
      demoTitle: 'お手本再生 一時停止',
      manualTitle: 'シミュレーション一時停止',
      demoHint: 'Esc または P で観戦を再開します。',
      manualHint: 'Esc または P で操縦を再開します。',
      resumeDemo: '観戦を再開',
      resumeManual: '操縦を再開',
      playManual: '自分で挑戦（手動プレイ）',
      restartDemo: 'お手本をやり直す [R]',
      restartManual: 'ミッションをやり直す [R]',
      missionSelect: 'タイトルへ戻る',
    },
    debrief: {
      dialogAria: 'フライト・デブリーフィング',
      demoCompleted: 'お手本飛行完了（オートパイロット実演）',
      flightTime: '飛行時間',
      successTitle: 'MECHAZILLA 捕獲成功!',
      failTitle: 'RUD — 機体大破 (着陸失敗)',
      totalScore: '総合スコア',
      stageLabel: 'ステージ',
      modeLabel: 'モード',
      impactSpeed: '衝突速度',
      posAccuracy: '位置精度 (最大 3,000)',
      errorLabel: '誤差',
      velAttitude: '速度・姿勢 (最大 4,000)',
      fuelEfficiency: '残燃料効率 (最大 3,000)',
      remainingLabel: '残量',
      maxLoad: '最大負荷 (G / 動圧)',
      finalPinOffset: '最終ピン誤差 (ΔX, ΔY)',
      finalFuel: '最終残燃料',
      maxG: '最大加速度',
      maxQ: '最大動圧 (Max-Q)',
      telemetryTitle: 'フライト・テレメトリー',
      telemetrySub: 'グラフ上をマウス移動で時刻スクラブ確認（0.1s サンプリング）',
      noSamples: 'テレメトリーデータなし',
      samplesCount: (count) => `サンプル数: ${count} 点 · グラフ上でマウス移動して詳細確認`,
      trajectoryTitle: '2D 飛行軌跡マップ',
      burnLegend: '噴射',
      coastLegend: '慣性飛行',
      downloadCsv: 'CSV ダウンロード',
      copiedJson: 'JSON コピー済み',
      copyJson: 'JSON コピー',
      missionSelect: 'ステージ選択へ',
      watchDemoAgain: 'もう一度お手本を見る',
      tryYourself: '自分で挑戦する',
      retryMission: '再挑戦する',
      series: {
        altitude: '高度 (Pin Y)',
        velY: '垂直速度 Vy',
        velX: '水平速度 Vx',
        fuelPct: '残燃料',
        activeEngines: '稼働基数',
        gForce: '加速度',
      },
    },
    canvas: {
      burnNow: (stopM) => `今すぐ点火!  [--- ${stopM}m ---]`,
      dangerNoDecel: '減速不可',
      dangerPullUp: (detail) => `推力不足 / 増基・引き起こし! (${detail})`,
      burnTarget: (stopM) => `[--- 停止目標: ${stopM}m ---]`,
      lzDistance: (formattedDist) => `着陸目標 ${formattedDist}`,
    },
  },
  en: {
    common: {
      engineUnit: (count) => `${count} ENG`,
      close: 'Close',
    },
    title: {
      subtitle: '2D Rigid-Body Physics × Tsiolkovsky Fuel-Limited Catch Simulation',
      languageBtnPrefix: 'Language',
      languageName: 'English',
      modeSwitchAria: 'Game Mode Selection',
      assistedSummary: '+25% Fuel · ±8m / 6.0m/s / 12° · Guides ON · 0.7×',
      realisticSummary: 'Standard Fuel · ±4m / 2.5m/s / 5° · Guides OFF · 1.0×',
      fuelPrefix: 'Fuel',
      scoreMultiplier: 'Score Multiplier',
      modeMultiplierNote: '(Mode 0.7×)',
      initialAltitude: 'Initial Alt',
      initialOffsetX: 'Offset X',
      initialVelocity: 'Initial Vel (vx, vy)',
      fuelLoad: 'Propellant Load',
      startMission: 'Start Mission',
      watchDemo: 'Watch Autopilot Demo',
      instantStartHint: 'Press Enter or Space to launch',
      controlsFooter:
        'A / D Gimbal · W / Space Ignite · 1 / 2 / 3 / 4(6) Engines · T Time Warp · R Retry · P Pause',
    },
    languageModal: {
      title: 'Language Settings',
      subtitle: 'Choose your UI language or follow your browser locale automatically',
      radioGroupAria: 'Display Language',
      autoTitle: 'Match Browser Settings (Auto)',
      autoDesc: 'Automatically selects Japanese or English from your browser preferences',
      detectedPrefix: 'Detected browser locale:',
      detectedJapanese: 'Japanese',
      detectedEnglish: 'English',
      jaTitle: '日本語 (Japanese)',
      jaDesc: 'Display all menus, briefings, and flight guides in Japanese',
      enTitle: 'English',
      enDesc: 'Display all menus, briefings, and flight guides in English',
      doneBtn: 'Done',
    },
    hud: {
      demoBadgeSuffix: 'Autopilot Demo (Watch Only)',
      orbitalCoast: 'ORBITAL (DEORBIT READY)',
      reentryPlasma: 'REENTRY PLASMA',
      deorbitBurnTitle: 'DEORBIT BURN TARGET',
      deorbitBurnGuide: (targetVx, dvLeft) =>
        `Select 6 ENG [4] at -90° and burn retrograde to VX +${targetVx.toLocaleString()} m/s (Δv left: -${dvLeft} m/s · ~5s burn, then cut)`,
      deorbitDoneTitle: 'DEORBIT BURN COMPLETE',
      deorbitDoneGuide: (currentVx) =>
        `VX +${currentVx.toLocaleString()} m/s locked — Cut thrust, hold D to pitch nose +55° to +75° (heatshield down), and warp [T] to reentry`,
      warpTitle:
        'Time Warp [T] (1×/5×/10×/20×) — Available above 2,000 m with engines OFF',
      muteAria: 'Mute Audio',
      unmuteAria: 'Unmute Audio',
      retryTitle: 'Retry [R]',
      pauseTitle: 'Pause [P / Esc]',
      altGaugeAria: 'Hoverslam Altitude Gauge',
      stop3Title: 'Predicted stop altitude with 3 engines',
      stopCurrTitle: 'Predicted stop altitude with selected engines',
      burnNow: 'BURN NOW!',
      boostWarn: 'BOOST / WARN',
      padLabel: '-60m PAD',
      stopAltUnavailable: 'N/A',
      speed: 'SPEED',
      altPin: 'ALT (PIN)',
      offsetX: 'OFFSET X',
      velXY: 'VEL X / Y',
      gAndQ: 'G / Q',
      stopAlt: 'STOP ALT',
      raptorThrust: 'RAPTOR THRUST',
      gimbal: 'GIMBAL',
      propellant: 'CH4 / LOX',
    },
    pause: {
      demoAria: 'Demo Playback Paused',
      manualAria: 'Simulation Paused',
      demoTag: 'Demo Mode (Watch Only)',
      demoTitle: 'Demo Paused',
      manualTitle: 'Simulation Paused',
      demoHint: 'Press Esc or P to resume watching.',
      manualHint: 'Press Esc or P to resume flight control.',
      resumeDemo: 'Resume Demo',
      resumeManual: 'Resume Flight',
      playManual: 'Play Manually',
      restartDemo: 'Restart Demo [R]',
      restartManual: 'Restart Mission [R]',
      missionSelect: 'Mission Select',
    },
    debrief: {
      dialogAria: 'Flight Debriefing',
      demoCompleted: 'Autopilot Demo Complete',
      flightTime: 'Flight Time',
      successTitle: 'MECHAZILLA HAS CAUGHT THE BOOSTER!',
      failTitle: 'RUD — Rapid Unscheduled Disassembly',
      totalScore: 'TOTAL SCORE',
      stageLabel: 'Stage',
      modeLabel: 'Mode',
      impactSpeed: 'IMPACT SPEED',
      posAccuracy: 'POSITION (MAX 3,000)',
      errorLabel: 'Error',
      velAttitude: 'VEL & ATTITUDE (MAX 4,000)',
      fuelEfficiency: 'FUEL MARGIN (MAX 3,000)',
      remainingLabel: 'Left',
      maxLoad: 'PEAK LOAD (MAX-G / Q)',
      finalPinOffset: 'FINAL PIN OFFSET (ΔX, ΔY)',
      finalFuel: 'REMAINING FUEL',
      maxG: 'PEAK G-FORCE',
      maxQ: 'MAX DYNAMIC PRESS (Q)',
      telemetryTitle: 'Flight Telemetry Graph',
      telemetrySub: 'Move cursor over chart to scrub timeline (0.1s sampling)',
      noSamples: 'No telemetry samples recorded',
      samplesCount: (count) => `Samples: ${count} pts · Hover chart to inspect exact telemetry`,
      trajectoryTitle: '2D Trajectory Map',
      burnLegend: 'Burn',
      coastLegend: 'Coast',
      downloadCsv: 'Download CSV',
      copiedJson: 'Copied JSON',
      copyJson: 'Copy JSON',
      missionSelect: 'Mission Select',
      watchDemoAgain: 'Replay Demo',
      tryYourself: 'Try It Yourself',
      retryMission: 'Retry Mission',
      series: {
        altitude: 'Altitude (Pin Y)',
        velY: 'Vert Vel Vy',
        velX: 'Horiz Vel Vx',
        fuelPct: 'Fuel Left',
        activeEngines: 'Active Engines',
        gForce: 'G-Force',
      },
    },
    canvas: {
      burnNow: (stopM) => `BURN NOW!  [--- ${stopM}m ---]`,
      dangerNoDecel: 'NO DECEL',
      dangerPullUp: (detail) => `INCREASE ENGINES / PULL UP! (${detail})`,
      burnTarget: (stopM) => `[--- BURN TARGET: ${stopM}m ---]`,
      lzDistance: (formattedDist) => `LZ ${formattedDist}`,
    },
  },
};

export function getTranslations(locale: Locale): TranslationDict {
  return TRANSLATIONS[locale];
}
