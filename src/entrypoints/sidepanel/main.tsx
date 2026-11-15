import { render } from 'preact';
import { App } from '../../ui/App';
import { startLocale } from '../../ui/i18n';
import '../../ui/style.css';

startLocale();

const root = document.getElementById('app');
if (root) render(<App />, root);
