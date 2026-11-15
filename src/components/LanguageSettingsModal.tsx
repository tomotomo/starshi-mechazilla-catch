import React from 'react';
import { Globe, X } from 'lucide-react';
import {
  getTranslations,
  type BrowserLocaleInfo,
  type LanguagePreference,
  type Locale,
} from '../game/i18n';

export interface LanguageSettingsModalProps {
  preference: LanguagePreference;
  resolvedLocale: Locale;
  browserInfo: BrowserLocaleInfo;
  onSelectPreference: (pref: LanguagePreference) => void;
  onClose: () => void;
}

export const LanguageSettingsModal: React.FC<LanguageSettingsModalProps> = ({
  preference,
  resolvedLocale,
  browserInfo,
  onSelectPreference,
  onClose,
}) => {
  const t = getTranslations(resolvedLocale);
  const detectedLabel =
    browserInfo.locale === 'ja'
      ? t.languageModal.detectedJapanese
      : t.languageModal.detectedEnglish;

  const options: {
    id: LanguagePreference;
    title: string;
    desc: string;
    extra?: string;
  }[] = [
    {
      id: 'auto',
      title: t.languageModal.autoTitle,
      desc: t.languageModal.autoDesc,
      extra: `${t.languageModal.detectedPrefix} ${detectedLabel} (${browserInfo.rawTag})`,
    },
    {
      id: 'ja',
      title: t.languageModal.jaTitle,
      desc: t.languageModal.jaDesc,
    },
    {
      id: 'en',
      title: t.languageModal.enTitle,
      desc: t.languageModal.enDesc,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.languageModal.title}
      data-testid="language-settings-modal"
      className="fixed inset-0 bg-[#05080F]/82 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md bg-[#0B101B] border border-slate-700/80 rounded-xl p-6 text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#070B14] border border-slate-700/80 flex items-center justify-center text-cyan-300 shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-50 leading-tight">
                {t.languageModal.title}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                {t.languageModal.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label={t.common.close}
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label={t.languageModal.radioGroupAria}
          className="mt-5 flex flex-col gap-2.5"
        >
          {options.map((opt) => {
            const active = preference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-lang-option={opt.id}
                onClick={() => onSelectPreference(opt.id)}
                className={`text-left rounded-lg border px-3.5 py-3 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F172A] border-cyan-400 text-slate-50'
                    : 'bg-[#070B14] border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold">
                    {opt.title}
                  </span>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                      active ? 'border-cyan-400' : 'border-slate-600'
                    }`}
                  >
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {opt.desc}
                </div>
                {opt.extra && (
                  <div className="font-mono-tabular text-[11px] text-cyan-300 mt-1.5">
                    {opt.extra}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            data-testid="language-modal-done"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {t.languageModal.doneBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
