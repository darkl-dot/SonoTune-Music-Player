import { create } from 'zustand';

export type Language = 'ru' | 'en';
const storageKey = 'sonotune-language';
export function readLanguage(storage?: Pick<Storage, 'getItem'>): Language | null {
  try {
    const value = storage?.getItem(storageKey);
    return value === 'ru' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}
const saved = readLanguage(typeof localStorage === 'undefined' ? undefined : localStorage);
const applyLanguage = (language: Language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.title = language === 'ru' ? 'SonoTune — музыка рядом' : 'SonoTune — music, close by';
  }
};
applyLanguage(saved ?? 'ru');
export const useLanguageStore = create<{ language: Language; chosen: boolean }>(() => ({
  language: saved ?? 'ru',
  chosen: !!saved,
}));
export const useLanguage = () => useLanguageStore((s) => s.language);
export function setLanguage(language: Language) {
  try {
    localStorage.setItem(storageKey, language);
  } catch {
    /* The current session remains usable if storage is unavailable. */
  }
  applyLanguage(language);
  useLanguageStore.setState({ language, chosen: true });
}

export const english: Record<string, string> = {
  'При запуске открывать': 'Open at startup',
  'Стартовая страница': 'Startup page',
  'Последний открытый раздел': 'Last opened section',
  Плейлист: 'Playlist',
  'Трек, очередь и позиция сохраняются. Продолжайте нажатием Play.':
    'Your track, queue and position are saved. Press Play to continue.',
  'Показывать баннер на главной': 'Show the Home banner',
  'Частота фонового сканирования папок': 'Background folder scan frequency',
  'Фоновое сканирование': 'Background scanning',
  'При старте приложения': 'At app startup',
  'Раз в указанное число минут': 'Every specified number of minutes',
  'Раз в': 'Every',
  'Интервал в минутах': 'Interval in minutes',
  минут: 'minutes',
  'Укажите целое число от 1 до 10080 минут.': 'Enter a whole number from 1 to 10080 minutes.',
  'Укажите целое число минут от 1 до 10080.': 'Enter a whole number from 1 to 10080 minutes.',
  'При каждом запуске папки проверяются всегда. Неизменённые файлы не разбираются повторно.':
    'Folders are always checked at startup. Unchanged files are not parsed again.',
  'Автоматическое сканирование доступно в приложении для компьютера.':
    'Automatic scanning is available in the desktop app.',
  'Найти текущий трек в библиотеке': 'Find the current track in the library',
  'Очистить следующие': 'Clear upcoming',
  'Файл недоступен': 'File unavailable',
  'Поднять: {title}': 'Move up: {title}',
  'Опустить: {title}': 'Move down: {title}',
  'Убрать из очереди: {title}': 'Remove from queue: {title}',
  'Перетаскивайте треки или используйте стрелки. Текущая песня остаётся в очереди.':
    'Drag tracks or use the arrows. The current song stays in the queue.',
  'Очередь изменилась. Попробуйте ещё раз.': 'The queue has changed. Please try again.',
  'Не удалось закрепить трек': 'Could not pin the track',
  'Закреплённые треки': 'Pinned tracks',
  'Чтобы не искать': 'Keep these handy',
  'Закрепить трек': 'Pin a track',
  'Изменить закрепление: {title}': 'Edit pin: {title}',
  'Закрепите любимую песню и добавьте подпись — например, «Под игру».':
    'Pin a favorite song and add a caption, such as “For gaming”.',
  'Закрепить на главной': 'Pin to Home',
  'Найти трек': 'Find a track',
  'Подпись — необязательно': 'Caption — optional',
  'Например, «Под игру»': 'For example, “For gaming”',
  Открепить: 'Unpin',
  'Изменить закрепление': 'Edit pin',
  'Подпись должна быть не длиннее 100 символов.':
    'The caption must be no longer than 100 characters.',
  'Очередь изменилась. Попробуйте переставить трек ещё раз.':
    'The queue has changed. Please try moving the track again.',
  'Трека больше нет в очереди.': 'The track is no longer in the queue.',
  'Текущий трек остаётся в очереди.': 'The current track stays in the queue.',
  'Один трек': 'One track',
  'Играть список': 'Play list',
  'Повтор текущего трека': 'Repeat current track',
  'Повтор текущего списка': 'Repeat current list',
  'Сыграть песню и остановиться': 'Play the song, then stop',
  'Дойти до конца очереди и остановиться': 'Play to the end of the queue, then stop',
  'Слушать эту песню по кругу': 'Keep this song on repeat',
  'Начать очередь заново после последней песни': 'Restart the queue after the last song',
  'Режим воспроизведения: {mode}': 'Playback mode: {mode}',
  'Режим воспроизведения': 'Playback mode',
  'Как слушаем?': 'How shall we listen?',
  'Нажатие на кнопку переключает режим': 'Click the button to cycle modes',
  'Интеграция с медиапанелью Windows недоступна': 'Windows media integration is unavailable',

  'Управление окном': 'Window controls',
  'Свернуть окно': 'Minimize window',
  'Развернуть окно': 'Maximize window',
  'Восстановить окно': 'Restore window',
  'Закрыть окно': 'Close window',
  'Не удалось изменить состояние окна': 'Could not change the window state',
  'Недавно играло': 'Recently played',
  'Чаще остальных': 'Most played',
  'А может, это?': 'How about this?',
  '…или посмотреть все треки?': '…or explore all your tracks?',
  'Ваша музыка сегодня': 'Your music today',
  'ВАША МУЗЫКА': 'YOUR MUSIC',
  'Здесь появится последний включённый трек': 'Your last played track will appear here',
  'Здесь будут треки, которые ты слушаешь чаще': 'The tracks you play most will appear here',
  'Выберем что-нибудь из твоей библиотеки': 'Pick something from your library',
  'Выбрать музыку': 'Choose some music',
  'Из твоей библиотеки': 'From your library',
  'С чего начнём?': 'Where shall we start?',
  'Выбери песню в библиотеке': 'Choose a song from your library',
  'Предложить другой трек': 'Suggest another track',
  'ОБЛОЖКА ПЛЕЙЛИСТА': 'PLAYLIST ARTWORK',
  'Выбрать обложку': 'Choose artwork',
  'Читаем обложку…': 'Reading artwork…',
  'Файл обложки плейлиста': 'Playlist artwork file',
  'Изменить обложку плейлиста': 'Change playlist artwork',
  'Новое имя, новая обложка — ваше настроение.': 'A new name, a new cover — your mood.',
  'Плейлист сохранён': 'Playlist saved',
  'Результаты поиска': 'Search results',
  'Обложка плейлиста слишком большая. Выберите изображение заново.':
    'Playlist artwork is too large. Choose the image again.',
  ' · демо-библиотека': ' · demo library',
  ' · файл недоступен': ' · file unavailable',
  'JPG, PNG, WebP · до 8 МБ': 'JPG, PNG, WebP · up to 8 MB',
  'MP3 · FLAC · WAV · OGG · OPUS  /  Всё остаётся на вашем устройстве':
    'MP3 · FLAC · WAV · OGG · OPUS  /  Everything stays on your device',
  'SonoTune — главная': 'SonoTune — home',
  Альбом: 'Album',
  'Альбом за альбомом': 'One album at a time',
  Альбомы: 'Albums',
  'Без жанра': 'No genre',
  'Без альбома': 'No album',
  Библиотека: 'Library',
  'Больше музыки': 'More music',
  'Браузер сохранит изменения в библиотеку и скачает JSON. Запись в аудиофайл доступна в десктопном приложении.':
    'Your browser will update the library and download a JSON file. Writing audio tags is available in the desktop app.',
  'Браузерный режим': 'Browser preview',
  'Браузерный режим · теги сохраняются в JSON': 'Browser preview · tags saved as JSON',
  'В избранное': 'Add to favorites',
  'В своём ритме': 'At your own pace',
  'ВАША БИБЛИОТЕКА': 'YOUR LIBRARY',
  'Ваш следующий любимый трек': 'Your next favorite track',
  'Ваша музыка': 'Your music',
  'Ваши исполнители': 'Your artists',
  'Ваши цвета, ваша музыка, ваш ритм.': 'Your colors, your music, your rhythm.',
  'Вид библиотеки': 'Library view',
  'Включить звук': 'Unmute',
  Воспроизвести: 'Play',
  'Все треки': 'All tracks',
  'Вся ваша музыка': 'All your music',
  'Всё на вашем устройстве': 'Everything on your device',
  'Можно просто нажать Play.': 'You can just press Play.',
  'Выберите JPG, PNG или WebP размером до 8 МБ.': 'Choose a JPG, PNG or WebP image up to 8 MB.',
  'Выберите музыку в библиотеке': 'Choose a track from your library',
  'Пока тихо': 'Quiet for now',
  'Включи песню или добавь трек в очередь.': 'Play a song or add a track to the queue.',
  'Нажми на сердечко, чтобы сохранить песню здесь.': 'Tap the heart to save a song here.',
  Выбрать: 'Choose',
  'Выключить звук': 'Mute',
  Главная: 'Home',
  Год: 'Year',
  'Кого послушаем?': 'Who are we listening to?',
  Громкость: 'Volume',
  'Начнём с твоей музыки': 'Start with your music',
  Длительность: 'Duration',
  'Для долгих прогулок, коротких пауз и всего между ними.':
    'For long walks, short breaks and everything in between.',
  'Для каждого настроения': 'For every mood',
  'Добавить в плейлист': 'Add to playlist',
  'Добавить папку': 'Add folder',
  'Добавить свою музыку': 'Add your music',
  'Добавляем демотреки…': 'Adding demo tracks…',
  'Добавляйте треки через «Слушать следующим».': 'Use “Play next” to add tracks to the queue.',
  'Добавь папку — найдём в ней треки.': 'Add a folder. We’ll find the tracks in it.',
  Жанр: 'Genre',
  Жанры: 'Genres',
  Закрыть: 'Close',
  'Закрыть очередь': 'Close queue',
  'Закрыть уведомление': 'Dismiss notification',
  Избранное: 'Favorites',
  Исполнители: 'Artists',
  Исполнитель: 'Artist',
  'Все треки на месте': 'All your tracks, right here',
  'Локальная библиотека': 'Local library',
  'Локальный аудиодвижок · Tauri + Rust': 'Local audio engine · Tauri + Rust',
  'Те самые треки': 'The good stuff',
  'Любимые треки': 'Favorite tracks',
  'Меньше шума.': 'Less noise.',
  'Музыка рядом': 'Music, close by',
  'Музыка рядом. Без аккаунтов и облака.': 'Music, close by. No accounts or cloud.',
  Назад: 'Back',
  'Назад к группам': 'Back to groups',
  Название: 'Title',
  'Найдите своё звучание': 'Find your sound',
  'Например, Без спешки': 'For example, Slow mornings',
  'Настроение меняется': 'A change of mood',
  'Под игру, под работу или просто так.': 'For gaming, working, or just because.',
  Настройки: 'Settings',
  'Настройки оформления': 'Appearance settings',
  'Не удалось отобразить интерфейс. Ваша библиотека сохранена.':
    'Could not display the interface. Your library is safe.',
  'Не удалось прочитать обложку': 'Could not read the artwork',
  'Не указан': 'Not set',
  'Недавно добавленные': 'Recently added',
  'Неизвестный исполнитель': 'Unknown artist',
  'Немного характера для вашей музыки.': 'A little personality for your music.',
  'Несколько исполнителей — через ;': 'Separate multiple artists with ;',
  'Новый плейлист': 'New playlist',
  'ОБЛОЖКА АЛЬБОМА': 'ALBUM ARTWORK',
  'Обновляем библиотеку': 'Updating your library',
  'Оригинал под защитой': 'Your original is protected',
  Остановить: 'Stop',
  'Остановить сканирование': 'Stop scanning',
  'От обложки': 'From artwork',
  'Открываем библиотеку…': 'Opening your library…',
  Отмена: 'Cancel',
  Оформление: 'Appearance',
  Очередь: 'Queue',
  'Очередь воспроизведения': 'Playback queue',
  'Очистить поиск': 'Clear search',
  ПЛЕЙЛИСТЫ: 'PLAYLISTS',
  'Папки с музыкой': 'Music folders',
  Пауза: 'Pause',
  'Перед записью в аудиофайл создаётся резервная копия в папке backups приложения.':
    'Before writing audio tags, a backup is created in the app’s backups folder.',
  Перезапустить: 'Restart',
  'Переименовать или удалить плейлист': 'Rename or delete playlist',
  'Перемешать и слушать': 'Shuffle and play',
  Пересканировать: 'Rescan',
  'Перетащи сюда треки или добавь их через меню.': 'Drag tracks here or add them from the menu.',
  Персик: 'Peach',
  Плеер: 'Player',
  'Плейлист переименован': 'Playlist renamed',
  Плейлисты: 'Playlists',
  'Плейлисты — это удобно': 'Playlists make it easy',
  'По длительности': 'By duration',
  'По исполнителю': 'By artist',
  'По названию': 'By title',
  'Позиция воспроизведения': 'Playback position',
  'Поиск по библиотеке': 'Search library',
  'Поймать настроение': 'Find your mood',
  'Пока не добавлены': 'No folders yet',
  'Ничего не нашли': 'No matches found',
  'Попробуй другое название или исполнителя.': 'Try another title or artist.',
  'Порядок плейлиста': 'Playlist order',
  'Послушать демо': 'Try the demo',
  'Предыдущий трек': 'Previous track',
  'Придумайте новое имя для вашей подборки.': 'Give your collection a new name.',
  'Прямо в сердце': 'Straight to the heart',
  'Редактировать теги': 'Edit tags',
  'СЕЙЧАС И ДАЛЬШЕ': 'NOW AND NEXT',
  'Сбросить поиск': 'Reset search',
  Светлое: 'Light',
  'Сделайте SonoTune своим': 'Make SonoTune yours',
  Сетка: 'Grid',
  Сирень: 'Lilac',
  Системное: 'System',
  'Следующий трек': 'Next track',
  'Случайный порядок': 'Shuffle',
  Слушать: 'Listen',
  'Слушать следующим': 'Play next',
  'Соберите своё настроение': 'Make a mix for your mood',
  Создать: 'Create',
  'Создать плейлист': 'Create playlist',
  'Сортировка треков': 'Sort tracks',
  'Сохранение рядом с оригиналом': 'Save alongside the original',
  'Сохранение…': 'Saving…',
  Сохранить: 'Save',
  'Сохранить только в sidecar-файл': 'Save to a sidecar file only',
  Список: 'List',
  'Список треков': 'Track list',
  'Теги будут записаны в .sonotune.json рядом с треком. SonoTune учитывает их при сканировании.':
    'Tags will be saved to .sonotune.json alongside the track. SonoTune reads this file when scanning.',
  'Только ваша музыка': 'Just your music',
  'Трек будет следующим в очереди': 'Track will play next',
  'Трек, исполнитель или альбом': 'Track, artist or album',
  Тёмное: 'Dark',
  'Что сегодня включим?': 'What are we playing today?',
  'Убрать из библиотеки': 'Remove from library',
  'Убрать из избранного': 'Remove from favorites',
  'Убрать из плейлиста': 'Remove from playlist',
  'Убрать обложку': 'Remove artwork',
  Удалить: 'Delete',
  'Удалить плейлист?': 'Delete playlist?',
  'Управление воспроизведением': 'Playback controls',
  Формат: 'Format',
  'ХОРОШО БЫТЬ В СВОЁМ РИТМЕ': 'GOOD TO BE IN YOUR OWN RHYTHM',
  'Послушаем целиком?': 'The whole album?',
  'Цветовая палитра': 'Color palette',
  Шалфей: 'Sage',
  демо: 'demo',
  'свой плейлист': 'a playlist of your own',
  'Язык интерфейса': 'Interface language',
  'Шрифт: Nunito': 'Font: Varela Round · Nunito for Cyrillic',
  'Пауза: {title}': 'Pause: {title}',
  'Слушать {title}': 'Play {title}',
  'Действия: {title}': 'Actions: {title}',
  'Убрать {title} из избранного': 'Remove {title} from favorites',
  'Добавить {title} в избранное': 'Add {title} to favorites',
  '{position} из {duration}': '{position} of {duration}',
  'Повтор: {mode}': 'Repeat: {mode}',
  выключен: 'off',
  'один трек': 'one track',
  'все треки': 'all tracks',
  'Громкость: {value}%': 'Volume: {value}%',
  'Очередь воспроизведения: {count}': 'Playback queue: {count}',
  'Создан плейлист «{name}»': 'Created playlist “{name}”',
  '«{title}» станет первым треком.': '“{title}” will be the first track.',
  'Плейлист «{name}» будет удалён. Треки останутся в библиотеке.':
    'Playlist “{name}” will be deleted. Your tracks will stay in the library.',
  'Обложка {album}': 'Artwork for {album}',
  '{hours} ч {minutes} мин': '{hours} hr {minutes} min',
  '{minutes} мин': '{minutes} min',
  'Читаем музыку…': 'Reading your music…',
  'Читаем музыку · {count} файлов': 'Reading your music · {count} files',
  'Сканирование остановлено.': 'Scanning stopped.',
  'Библиотека обновлена.': 'Library updated.',
  'Не удалось прочитать теги: {count}.': 'Could not read tags: {count}.',
  'Добавлено 6 коротких демотреков SonoTune': 'Added 6 short SonoTune demo tracks',
  'Трек уже есть в плейлисте': 'This track is already in the playlist',
  'Добавлено в «{name}»': 'Added to “{name}”',
  'Теги сохранены. Резервная копия оригинала создана.':
    'Tags saved. The original has been backed up.',
  'Изменения сохранены в sidecar-файл и библиотеку.':
    'Changes saved to the sidecar file and library.',
  'Файл недоступен. Проверь, что он на месте.': 'File unavailable. Check that it is still there.',
  'Не удалось воспроизвести файл. Возможно, он поврежден или формат не поддерживается браузером.':
    'Could not play the file. It may be damaged or unsupported by this browser.',
  'В браузере выберите папку повторно кнопкой «Добавить папку». Автоматическое сканирование доступно в приложении.':
    'Use “Add folder” to select the folder again. Automatic rescanning is available in the desktop app.',
  'Выберите папку с музыкой': 'Choose your music folder',
  'Трек больше не находится в библиотеке.': 'This track is no longer in your library.',
  'Укажите название плейлиста до 100 символов.': 'Enter a playlist name up to 100 characters.',
  'Проверьте название, год и длину полей тегов.': 'Check the title, year and length of tag fields.',
  'Сканирование уже выполняется.': 'Scanning is already in progress.',
  'Выбранный путь не является папкой.': 'The selected path is not a folder.',
  'Дождитесь завершения сканирования.': 'Wait for scanning to finish.',
  'Слишком большая очередь воспроизведения.': 'The playback queue is too large.',
  'Некорректная позиция воспроизведения.': 'Invalid playback position.',
  'Некорректная громкость.': 'Invalid volume.',
  'Аудиодорожка не найдена': 'Audio track not found',
  'Аудиодорожка пуста. Используйте sidecar-файл.': 'The audio track is empty. Use a sidecar file.',
  'Обложка слишком большая. Максимум — 8 МБ.': 'Artwork is too large. Maximum: 8 MB.',
  'Некорректная обложка': 'Invalid artwork',
  'Поддерживаются JPG, PNG и WebP.': 'JPG, PNG and WebP are supported.',
  'Обложка больше 8 МБ.': 'Artwork exceeds 8 MB.',
  'Не удалось прочитать изображение или превышен размер 8192×8192.':
    'Could not read the image, or it exceeds 8192×8192 pixels.',
  'Не найдена папка файла': 'The file’s folder was not found',
  'Файл изменился вне SonoTune. Пересканируйте библиотеку перед записью.':
    'The file has changed outside SonoTune. Rescan your library before saving.',
  'Формат тегов недоступен для записи': 'Writing tags is not supported for this format',
  'Проверка сохранённого файла не пройдена. Оригинал не изменён.':
    'The saved file failed verification. The original was not changed.',
  'После записи тегов изменилась аудиодорожка. Оригинал не заменён. Используйте sidecar-файл.':
    'Writing tags changed the audio data. The original was not replaced. Use a sidecar file.',
  'Файл изменился во время сохранения. Оригинал не заменён.':
    'The file changed while saving. The original was not replaced.',
  'Не удалось определить длительность Opus': 'Could not determine Opus duration',
  'Отсутствует заголовок Opus': 'Missing Opus header',
  'Повреждён заголовок Opus': 'Invalid Opus header',
  'Поддерживаются моно- и стереозаписи Opus.': 'Mono and stereo Opus recordings are supported.',
  'Не указаны каналы Opus': 'Opus channel information is missing',
  'файл закончился раньше указанной длительности': 'the file ended before its stated duration',
};

export function translate(
  language: Language,
  key: string,
  values: Record<string, string | number> = {},
) {
  return (language === 'en' ? (english[key] ?? key) : key).replace(
    /\{(\w+)\}/g,
    (match, name: string) => String(values[name] ?? match),
  );
}
export const t = (key: string, values?: Record<string, string | number>) =>
  translate(useLanguageStore.getState().language, key, values);
export const locale = () => (useLanguageStore.getState().language === 'en' ? 'en-US' : 'ru-RU');

/** Localize application errors without rewriting filenames or user metadata. */
export function localizeError(error: unknown): string {
  const message = String(error).replace(/^Error:\s*/, '');
  if (useLanguageStore.getState().language === 'ru') return message;
  if (english[message]) return english[message];
  const prefixes: Record<string, string> = {
    'Не удалось прочитать аудио': 'Could not read audio',
    'Не удалось открыть звуковое устройство': 'Could not open the audio device',
    'Не удалось перемотать': 'Could not seek',
    'Не удалось проверить аудиодорожку': 'Could not verify audio',
    'Не удалось создать резервную копию': 'Could not create a backup',
    'Не удалось записать теги. Попробуйте sidecar': 'Could not write tags. Try a sidecar file',
    'Файл занят или недоступен для замены. Попробуйте sidecar':
      'File is busy or cannot be replaced. Try a sidecar file',
    'Не найдены демотреки': 'Demo tracks not found',
    'Файл недоступен': 'File unavailable',
    'Не удалось прочитать Opus': 'Could not read Opus',
  };
  for (const [prefix, translated] of Object.entries(prefixes)) {
    if (message.startsWith(prefix)) return translated + localizeError(message.slice(prefix.length));
  }
  const boundary = message.indexOf(': ');
  if (boundary >= 0)
    return (
      localizeError(message.slice(0, boundary)) + ': ' + localizeError(message.slice(boundary + 2))
    );
  return message;
}
