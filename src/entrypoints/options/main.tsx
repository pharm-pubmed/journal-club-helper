import { render } from 'preact';
import { OptionsPage } from '../../ui/options/OptionsPage';
import { startLocale } from '../../ui/i18n';
import '../../ui/style.css';

startLocale();

const root = document.getElementById('app');
if (root) render(<OptionsPage />, root);
