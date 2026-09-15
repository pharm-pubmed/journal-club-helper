import { render } from 'preact';
import { OptionsPage } from '../../ui/options/OptionsPage';
import '../../ui/style.css';

const root = document.getElementById('app');
if (root) render(<OptionsPage />, root);
