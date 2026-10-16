import { Languages } from 'lucide-react';
import { Modal } from '../shared/ui';
import { setLanguage, useLanguage, useLanguageStore } from '../shared/i18n';

export function LanguageOptions() {
  const language = useLanguage();
  return (
    <div className="language-options" role="group" aria-label="Русский / English">
      <button
        type="button"
        lang="ru"
        aria-pressed={language === 'ru'}
        onClick={() => setLanguage('ru')}
      >
        Русский<small>Nunito</small>
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        English<small>Varela Round</small>
      </button>
    </div>
  );
}
const keepOpen = () => {};
export function LanguageDialog() {
  const chosen = useLanguageStore((s) => s.chosen);
  if (chosen) return null;
  return (
    <Modal
      title="Добро пожаловать / Welcome"
      onClose={keepOpen}
      dismissible={false}
      className="language-modal"
    >
      <div className="dialog-flower">
        <Languages size={36} />
      </div>
      <p className="dialog-description">Выберите язык · Choose your language</p>
      <LanguageOptions />
      <p className="language-note">
        Можно изменить в настройках.
        <br />
        You can change this in Settings.
      </p>
    </Modal>
  );
}
