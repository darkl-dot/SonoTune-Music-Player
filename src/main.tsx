import { t } from './shared/i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import './app/fonts.css';
import './app/enhancements.css';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatal">
          <h1>SonoTune</h1>
          <p>{t('Не удалось отобразить интерфейс. Ваша библиотека сохранена.')}</p>
          <button onClick={() => location.reload()}>{t('Перезапустить')}</button>
        </main>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
