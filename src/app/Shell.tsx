import { t, useLanguage } from '../shared/i18n';
import type { DragEvent, ReactNode, RefObject } from 'react';
import {
  Album,
  ArrowUpRight,
  AudioLines,
  FolderPlus,
  Heart,
  House,
  ListMusic,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Tag,
  UsersRound,
  X,
} from 'lucide-react';
import { useStore } from './store';
import { Flower, IconButton } from '../shared/ui';
import type { Dialog } from './dialogs';
import styles from './App.module.css';
import { CategorySignature } from './CategorySignature';
import { PlaylistArtwork } from '../features/playlists/PlaylistArtwork';

export const navigation = [
  { id: 'home', label: 'Главная', icon: House },
  { id: 'tracks', label: 'Все треки', icon: Music2 },
  { id: 'artists', label: 'Исполнители', icon: UsersRound },
  { id: 'albums', label: 'Альбомы', icon: Album },
  { id: 'genres', label: 'Жанры', icon: Tag },
] as const;

interface ShellProps {
  setDialog(dialog: Dialog): void;
}
export function Sidebar({
  setDialog,
  dropTarget,
  setDropTarget,
  drop,
}: ShellProps & {
  dropTarget: string | null;
  setDropTarget(value: string | null): void;
  drop(event: DragEvent, playlistId: string): void;
}) {
  useLanguage();
  const library = useStore((s) => s.library);
  const section = useStore((s) => s.section);
  const busy = useStore((s) => s.busy);
  return (
    <aside className={styles.sidebar}>
      <button
        className={styles.brand}
        onClick={() => useStore.getState().setSection('home')}
        aria-label={t('SonoTune — главная')}
      >
        <span className={styles.brandSymbol}>
          <Flower petals={8} />
          <AudioLines size={23} />
        </span>
        <span>
          SonoTune<span className={styles.brandDot}>.</span>
        </span>
      </button>
      <div className={styles.sidebarBody}>
        <span className="eyebrow sidebar-label">{t('ВАША БИБЛИОТЕКА')}</span>
        <nav aria-label={t('Библиотека')}>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${section === id ? 'active' : ''}`}
              title={t(label)}
              aria-label={t(label)}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => useStore.getState().setSection(id)}
            >
              <Icon size={20} />
              <span>{t(label)}</span>
              {id === 'tracks' && <span className="nav-count">{library.tracks.length}</span>}
            </button>
          ))}
        </nav>
        <button
          className={`nav-item favorites-nav ${section === 'favorites' ? 'active' : ''}`}
          title={t('Избранное')}
          aria-label={t('Избранное')}
          aria-current={section === 'favorites' ? 'page' : undefined}
          onClick={() => useStore.getState().setSection('favorites')}
        >
          <Heart size={20} />
          <span>{t('Избранное')}</span>
        </button>
        <div className="playlist-heading">
          <button
            className="eyebrow playlist-section-link"
            title={t('Плейлисты')}
            aria-label={t('Плейлисты')}
            aria-current={section === 'playlists' ? 'page' : undefined}
            onClick={() => useStore.getState().setSection('playlists')}
          >
            {t('ПЛЕЙЛИСТЫ')}
          </button>
          <IconButton label={t('Создать плейлист')} onClick={() => setDialog({ kind: 'playlist' })}>
            <Plus size={18} />
          </IconButton>
        </div>
        <nav aria-label={t('Плейлисты')} className="playlist-nav">
          {library.playlists.length ? (
            library.playlists.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${section === `playlist:${item.id}` ? 'active' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`}
                onClick={() => useStore.getState().setSection(`playlist:${item.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setDialog({ kind: 'playlist', playlist: item });
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-sonotune-track')) {
                    e.preventDefault();
                    setDropTarget(item.id);
                  }
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => drop(e, item.id)}
              >
                {item.artwork ? (
                  <span className="playlist-mini-cover">
                    <PlaylistArtwork playlist={item} />
                  </span>
                ) : (
                  <ListMusic size={18} />
                )}
                <span>{item.name}</span>
                <span className="nav-count">{item.trackIds.length}</span>
              </button>
            ))
          ) : (
            <button className="playlist-invite" onClick={() => setDialog({ kind: 'playlist' })}>
              {t('Для каждого настроения')}
              <br />
              <span>
                {t('свой плейлист')}
                <ArrowUpRight size={13} />
              </span>
            </button>
          )}
        </nav>
      </div>
      <div className={styles.sidebarBottom}>
        <div className="local-note">
          <span className="status-dot" />
          <span>{t('Только ваша музыка')}</span>
        </div>
        <button
          className="button import-button"
          disabled={busy}
          onClick={() => void useStore.getState().importFolder()}
        >
          {busy ? <LoaderCircle className="spin" size={19} /> : <FolderPlus size={19} />}
          <span>{t('Добавить папку')}</span>
        </button>
        <button
          className="settings-link"
          aria-label={t('Настройки')}
          title={t('Настройки')}
          onClick={() => setDialog({ kind: 'settings' })}
        >
          <Settings2 size={17} />
          <span>{t('Настройки')}</span>
          <span className="version">v1.1.3</span>
        </button>
      </div>
    </aside>
  );
}
export function Topbar({
  setDialog,
  search,
  controls,
}: ShellProps & { search: RefObject<HTMLInputElement | null>; controls?: ReactNode }) {
  useLanguage();
  const query = useStore((s) => s.query);
  return (
    <header className={styles.topbar}>
      <div className="search-field">
        <Search size={19} />
        <input
          ref={search}
          aria-label={t('Поиск по библиотеке')}
          placeholder={t('Трек, исполнитель или альбом')}
          value={query}
          onChange={(e) => useStore.getState().setQuery(e.target.value)}
        />
        {query ? (
          <IconButton label={t('Очистить поиск')} onClick={() => useStore.getState().setQuery('')}>
            <X size={16} />
          </IconButton>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </div>
      {controls}
      <CategorySignature />
      <IconButton
        label={t('Настройки оформления')}
        className="theme-shortcut"
        onClick={() => setDialog({ kind: 'settings' })}
      >
        <Sparkles size={21} />
      </IconButton>
    </header>
  );
}
export function Hero({ hasTracks, onPlay }: { hasTracks: boolean; onPlay(): void }) {
  useLanguage();
  const busy = useStore((s) => s.busy);
  return (
    <section className={styles.hero} aria-label={t('Ваша музыка')}>
      <div className={styles.heroCopy}>
        <span className="eyebrow hero-eyebrow">
          <Sparkles size={13} />
          {t('ХОРОШО БЫТЬ В СВОЁМ РИТМЕ')}
        </span>
        <h1>
          {t('Меньше шума.')}
          <br />
          {t('Больше музыки')}
          <span>.</span>
        </h1>
        <p>{t('Можно просто нажать Play.')}</p>
        <button
          className="button hero-button"
          disabled={busy}
          onClick={() => (hasTracks ? onPlay() : void useStore.getState().importFolder())}
        >
          {hasTracks ? <Play size={17} fill="currentColor" /> : <FolderPlus size={17} />}
          {hasTracks ? t('Поймать настроение') : t('Добавить свою музыку')}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className={styles.heroArt} aria-hidden="true">
        <div className={styles.artOrbit} />
        <div className={styles.heroPetal}>
          <Flower petals={8} />
          <AudioLines size={68} strokeWidth={1.3} />
        </div>
        <div className={styles.artWave}>
          <svg viewBox="0 0 200 100">
            <path d="M-10 35q25-45 50 0t50 0t50 0t50 0t50 0M-10 58q25-45 50 0t50 0t50 0t50 0t50 0M-10 81q25-45 50 0t50 0t50 0t50 0t50 0" />
          </svg>
        </div>
        <span className={styles.artSpark}>✳</span>
        <span className={styles.heroArtLabel}>SOUNDS LIKE YOU</span>
      </div>
    </section>
  );
}
