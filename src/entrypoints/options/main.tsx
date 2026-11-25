import { render } from 'preact';
import { OptionsPage } from '../../ui/options/OptionsPage';
import { startLocale } from '../../ui/i18n';
import '../../ui/style.css';

const root = document.getElementById('app');
void startLocale().then(() => {
  if (root) render(<OptionsPage />, root);
});
