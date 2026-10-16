import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, Flame, Music2, Play, RefreshCw, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Hero } from '../../app/Shell';
import { run, useStore } from '../../app/store';
import { api } from '../../shared/api';
import { Artwork, Flower, IconButton } from '../../shared/ui';
import { artistName, plural } from '../../shared/utils';
import { t, useLanguage } from '../../shared/i18n';
import type { Track } from '../../shared/types';
import { listeningHighlights, randomSuggestion } from './highlights';
import styles from './HomeView.module.css';
import { PinnedTracks } from './PinnedTracks';

function HomeCard({
  label,
  hint,
  detail,
  track,
  icon: Icon,
  onPlay,
  onRefresh,
}: {
  label: string;
  hint: string;
  track?: Track;
  icon: LucideIcon;
  detail?: string;
  onPlay(track?: Track): void;
  onRefresh?: () => void;
}) {
  return (
    <article className={`${styles.card} ${track ? '' : styles.empty}`} aria-label={label}>
      <button
        className={styles.cardAction}
        aria-label={track ? t('Слушать {title}', { title: track.title }) : t('Выбрать музыку')}
        onClick={() => onPlay(track)}
      >
        <div className={styles.cardMedia} key={track?.artwork ?? track?.id ?? 'empty'}>
          <Artwork track={track} />
        </div>
        <div className={styles.shade} />
        <div className={styles.cardLabel}>
          <Icon size={16} />
          <span>{label}</span>
        </div>
        <div className={styles.cardCopy}>
          <span className={styles.cardHint}>
            {track ? (detail ?? t('Из твоей библиотеки')) : hint}
          </span>
          <strong>{track?.title ?? t('С чего начнём?')}</strong>
          <span className={styles.cardArtist}>
            {track ? artistName(track) : t('Выбери песню в библиотеке')}
          </span>
        </div>
        <span className={styles.cardPlay} aria-hidden="true">
          {track ? <Play size={23} fill="currentColor" /> : <ArrowUpRight size={23} />}
        </span>
      </button>
      {onRefresh && (
        <IconButton
          className={styles.refresh}
          label={t('Предложить другой трек')}
          onClick={onRefresh}
        >
          <RefreshCw size={16} />
        </IconButton>
      )}
    </article>
  );
}

function HomeBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <Flower className={`${styles.floating} ${styles.flower}`} petals={7} />
      <svg className={`${styles.floating} ${styles.pebble}`} viewBox="0 0 200 200">
        <path
          d="M38 22C72-4 162 12 180 57s-12 125-67 130S5 150 11 99 15 40 38 22Z"
          fill="currentColor"
        />
      </svg>
      <svg className={`${styles.floating} ${styles.ribbon}`} viewBox="0 0 220 170">
        <path
          d="M-20 40Q25-10 70 40t90 0t90 0M-20 85Q25 35 70 85t90 0t90 0M-20 130q45-50 90 0t90 0t90 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="22"
          strokeLinecap="round"
        />
      </svg>
      <Flower className={`${styles.floating} ${styles.star}`} petals={5} />
    </div>
  );
}

export function HomeView({ onPin }: { onPin?(track?: Track): void } = {}) {
  useLanguage();
  const tracks = useStore((s) => s.library.tracks);
  const stats = useStore((s) => s.library.listening);
  const loaded = useStore((s) => s.loaded);
  const showBanner = useStore((s) => s.settings.showHomeBanner !== false);
  const available = useMemo(() => tracks.filter((track) => track.available), [tracks]);
  const { recent, frequent } = useMemo(() => listeningHighlights(tracks, stats), [tracks, stats]);
  const [suggestionId, setSuggestionId] = useState<string | undefined>(
    () => randomSuggestion(available, [recent?.id ?? '', frequent?.id ?? ''])?.id,
  );
  useEffect(() => {
    if (!available.some((track) => track.id === suggestionId))
      setSuggestionId(randomSuggestion(available, [recent?.id ?? '', frequent?.id ?? ''])?.id);
  }, [available, suggestionId, recent?.id, frequent?.id]);
  const suggestion = available.find((track) => track.id === suggestionId);
  const play = (track?: Track) => {
    if (!track) {
      useStore.getState().setSection('tracks');
      return;
    }
    void run(async () => {
      await (
        await api
      ).play(
        track.id,
        available.map((item) => item.id),
      );
    });
  };
  return (
    <div className={styles.home}>
      <HomeBackdrop />
      <div className={styles.scroll}>
        {showBanner && <Hero hasTracks={available.length > 0} onPlay={() => play(available[0])} />}
        <section className={styles.highlights} aria-label={t('Ваша музыка сегодня')}>
          <div className={styles.heading}>
            <span className="eyebrow">{t('ВАША МУЗЫКА')}</span>
            <Sparkles size={17} />
          </div>
          <div className={styles.cards} aria-busy={!loaded}>
            <HomeCard
              label={t('Недавно играло')}
              hint={t('Здесь появится последний включённый трек')}
              track={recent}
              icon={Clock3}
              onPlay={play}
            />
            <HomeCard
              label={t('Чаще остальных')}
              hint={t('Здесь будут треки, которые ты слушаешь чаще')}
              detail={
                frequent
                  ? plural(
                      stats?.[frequent.id]?.playCount ?? 0,
                      ['прослушивание', 'прослушивания', 'прослушиваний'],
                      ['play', 'plays'],
                    )
                  : undefined
              }
              track={frequent}
              icon={Flame}
              onPlay={play}
            />
            <HomeCard
              label={t('А может, это?')}
              hint={t('Выберем что-нибудь из твоей библиотеки')}
              track={suggestion}
              icon={Sparkles}
              onPlay={play}
              onRefresh={
                available.length > 1
                  ? () =>
                      setSuggestionId(
                        randomSuggestion(
                          available.filter((track) => track.id !== suggestionId),
                          [recent?.id ?? '', frequent?.id ?? ''],
                        )?.id,
                      )
                  : undefined
              }
            />
          </div>
        </section>
        <PinnedTracks onEdit={onPin} />
        <button className={styles.more} onClick={() => useStore.getState().setSection('tracks')}>
          <Music2 size={17} />
          <span>{t('…или посмотреть все треки?')}</span>
          <ArrowUpRight size={18} />
        </button>
      </div>
    </div>
  );
}
