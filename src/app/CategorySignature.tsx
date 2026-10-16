import { Album, AudioLines, Heart, House, ListMusic, MicVocal, Music2, Tags } from 'lucide-react';
import { useStore } from './store';
import { Flower } from '../shared/ui';
import { t, useLanguage } from '../shared/i18n';

const signatures = {
  home: [House, 'Музыка рядом', 'В своём ритме'],
  tracks: [AudioLines, 'Каждый трек — история', 'Вся ваша музыка'],
  artists: [MicVocal, 'Голоса, которые близки', 'Ваши исполнители'],
  albums: [Album, 'Хорошее слушают целиком', 'Альбом за альбомом'],
  genres: [Tags, 'У каждого дня свой жанр', 'Найдите своё звучание'],
  favorites: [Heart, 'Любимое всегда рядом', 'Прямо в сердце'],
  playlists: [ListMusic, 'Плейлисты — это удобно', 'Настроение по порядку'],
} as const;

export function CategorySignature() {
  useLanguage();
  const section = useStore((s) => s.section);
  const kind = section.startsWith('playlist:') ? 'playlists' : (section as keyof typeof signatures);
  const [Icon, title, caption] = signatures[kind] ?? [Music2, 'Музыка рядом', 'В своём ритме'];
  return (
    <div className={`category-signature signature-${kind}`} key={kind}>
      <div className="signature-copy">
        <span>{t(caption)}</span>
        <strong>{t(title)}</strong>
      </div>
      <div className="signature-symbol" aria-hidden="true">
        <Flower petals={kind === 'genres' ? 5 : 8} />
        <Icon size={22} strokeWidth={1.7} />
      </div>
    </div>
  );
}
