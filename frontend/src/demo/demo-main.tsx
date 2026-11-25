import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import '../styles/global.css';
import { installMockApi } from './mockApi';

installMockApi();

const ribbon = document.createElement('div');
ribbon.setAttribute('role', 'note');
ribbon.style.cssText = 'position:sticky;top:0;z-index:50;background:#d9461f;color:#fff;font:600 13px/1.4 var(--font-ui);padding:6px 16px;text-align:center';
const DEFAULT = 'Демонстрация: данные вымышленные и нигде не сохраняются. Расчет раскроя работает на настоящем алгоритме.';
ribbon.textContent = DEFAULT;
document.body.prepend(ribbon);

let timer: number | undefined;
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  const href = a?.getAttribute('href') ?? '';
  if (a && href.startsWith('/api/')) {
    e.preventDefault();
    ribbon.textContent = 'В демо PDF-спецификация и этикетки не формируются. В рабочей версии они открываются отсюда.';
    window.clearTimeout(timer); timer = window.setTimeout(() => { ribbon.textContent = DEFAULT; }, 5000);
  }
}, true);

createRoot(document.getElementById('root')!).render(<MemoryRouter><AppRoutes /></MemoryRouter>);
