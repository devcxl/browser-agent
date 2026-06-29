import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { detectAndSetLanguage } from './i18n/language-detector';

async function init() {
  await detectAndSetLanguage();
  const root = document.getElementById('root');
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}
init();
