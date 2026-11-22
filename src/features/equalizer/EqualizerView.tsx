import { useEffect, useState } from 'react';
import { BookmarkPlus, Check, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { t, useLanguage } from '../../shared/i18n';
import { frequencies, presets, useEqualizer } from '../../shared/equalizer';
import { Select } from '../../shared/Select';
import { IconButton } from '../../shared/ui';
import { api } from '../../shared/api';
import { run, useStore } from '../../app/store';
import './equalizer.css';

// Keep audio preferences active regardless of which page is open.
export function EqualizerBridge() {
  const value = useEqualizer((s) => s.value);
  useEffect(() => {
    const timer = setTimeout(() => void run(async () => (await api).configureEqualizer(value)), 35);
    return () => clearTimeout(timer);
  }, [value]);
  return null;
}
export function EqualizerView() {
  useLanguage();
  const { value, customPresets, set, savePreset, deletePreset } = useEqualizer();
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const builtIn = presets.find(
    (p) => p.preamp === value.preamp && p.gains.every((g, i) => g === value.gains[i]),
  );
  const custom = !builtIn
    ? customPresets.find(
        (p) => p.preamp === value.preamp && p.gains.every((g, i) => g === value.gains[i]),
      )
    : undefined;
  const selectedValue = builtIn ? builtIn.id : custom ? `user:${custom.id}` : 'custom';
  const db = (n: number) => `${n > 0 ? '+' : ''}${n} ${t('дБ')}`;
  const commitPreset = () => {
    const created = savePreset(draftName);
    if (!created) return;
    setDraftName('');
    setSaving(false);
    useStore.getState().notify(t('Пресет «{name}» сохранён.', { name: created.name }));
  };
  return (
    <section className="equalizer-page" aria-label={t('Эквалайзер')}>
      <div className="eq-heading">
        <div>
          <span className="eyebrow">SONOTUNE AUDIO</span>
          <h2>{t('Эквалайзер')}</h2>
          <p>{t('Настрой звук под себя')}</p>
        </div>
        <SlidersHorizontal size={36} strokeWidth={1.5} />
      </div>
      <div className={`eq-card ${value.enabled ? '' : 'eq-bypassed'}`}>
        <div className="eq-toolbar">
          <label className="preference-toggle">
            <span>{t('Эквалайзер включён')}</span>
            <input
              type="checkbox"
              role="switch"
              checked={value.enabled}
              onChange={(e) => set({ ...value, enabled: e.target.checked })}
            />
          </label>
          <div className="eq-tools">
            <Select
              label={t('Пресет')}
              value={selectedValue}
              options={[
                ...presets.map((p) => ({ value: p.id, label: t(p.name) })),
                ...customPresets.map((p) => ({ value: `user:${p.id}`, label: p.name })),
                { value: 'custom', label: t('Своя настройка') },
              ]}
              onChange={(id) => {
                if (id.startsWith('user:')) {
                  const found = customPresets.find((item) => item.id === id.slice(5));
                  if (found) set({ enabled: true, preamp: found.preamp, gains: [...found.gains] });
                  return;
                }
                const p = presets.find((item) => item.id === id);
                if (p) set({ enabled: true, preamp: p.preamp, gains: [...p.gains] });
              }}
            />
            {custom && (
              <IconButton
                label={t('Удалить пресет')}
                onClick={() => {
                  deletePreset(custom.id);
                  useStore.getState().notify(t('Пресет «{name}» удалён.', { name: custom.name }));
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
            <button
              className="button ghost small"
              onClick={() => {
                setDraftName(custom?.name ?? '');
                setSaving((open) => !open);
              }}
            >
              <BookmarkPlus size={16} />
              {t('Сохранить пресет')}
            </button>
            <button
              className="button tonal small"
              onClick={() => set({ ...value, preamp: 0, gains: frequencies.map(() => 0) })}
            >
              <RotateCcw size={16} />
              {t('Сбросить')}
            </button>
          </div>
        </div>
        {saving && (
          <form
            className="eq-preset-form"
            onSubmit={(e) => {
              e.preventDefault();
              commitPreset();
            }}
          >
            <input
              type="text"
              maxLength={60}
              autoFocus
              aria-label={t('Название пресета')}
              placeholder={t('Например, Наушники')}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button className="button primary small" type="submit" disabled={!draftName.trim()}>
              <Check size={15} />
              {t('Сохранить')}
            </button>
            <IconButton label={t('Отмена')} onClick={() => setSaving(false)}>
              <X size={16} />
            </IconButton>
          </form>
        )}
        <div className="eq-scroll">
          <div className="eq-bands">
            <div className="eq-scale" aria-hidden="true">
              <span>+12</span>
              <span>0 {t('дБ')}</span>
              <span>−12</span>
            </div>
            {frequencies.map((frequency, i) => (
              <label className="eq-band" key={frequency}>
                <output>{db(value.gains[i])}</output>
                <div className="eq-rail">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={value.gains[i]}
                    aria-label={`${frequency} ${t('Гц')}`}
                    aria-valuetext={db(value.gains[i])}
                    onChange={(e) =>
                      set({
                        ...value,
                        gains: value.gains.map((g, j) => (j === i ? Number(e.target.value) : g)),
                      })
                    }
                    onDoubleClick={() =>
                      set({ ...value, gains: value.gains.map((g, j) => (j === i ? 0 : g)) })
                    }
                  />
                </div>
                <span>{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="eq-preamp">
          <label htmlFor="eq-preamp">
            {t('Общее усиление')}
            <output>{db(value.preamp)}</output>
          </label>
          <input
            id="eq-preamp"
            type="range"
            min={-24}
            max={0}
            step={0.5}
            value={value.preamp}
            onChange={(e) => set({ ...value, preamp: Number(e.target.value) })}
          />
          <p>{t('Если поднимаешь частоты, снизь общее усиление, чтобы звук не перегружался.')}</p>
        </div>
      </div>
    </section>
  );
}
