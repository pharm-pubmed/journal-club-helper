import { render } from 'preact';
import { App } from '../../ui/App';
import { startLocale } from '../../ui/i18n';
import '../../ui/style.css';

const root = document.getElementById('app');
void startLocale().then(() => {
  if (root) render(<App />, root);
});
