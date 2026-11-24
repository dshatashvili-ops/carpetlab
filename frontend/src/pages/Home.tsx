import { Link } from 'react-router-dom';
import { CutPlanSvg } from '../components/CutPlanSvg';
import { demoPlan, demoSizeLabels } from '../demoData';

const features = [
  ['Рулоны и обрезки', 'Приход в м², каждый обрезок хранится отдельным куском с размерами и участвует в следующих расчетах.'],
  ['Расчет раскроя', 'Выберите размеры, и система покажет, сколько ковров выйдет. Количество можно менять вручную.'],
  ['Документ и спецификация', 'Раскрой списывает материал и оприходует ковры. Спецификация для раскройщика в один клик.'],
  ['Штрихкоды EAN-13', 'Постоянный штрихкод для каждого размера ковра и печать этикеток.'],
];

export function Home() {
  return (
    <>
      <section className="hero">
        <h1>Раскрой рулонов без калькулятора</h1>
        <p>Учет рулонов, обрезков и готовых ковров. Система сама считает, сколько ковров нужных размеров выйдет, и печатает спецификацию для раскройщика.</p>
        <div className="cta">
          <Link className="btn" to="/register">Попробовать 7 дней</Link>
          <Link className="btn ghost" to="/demo">Открыть демо</Link>
        </div>
      </section>
      <section className="panel section" aria-label="Пример раскроя">
        <h2 style={{ marginTop: 0 }}>Рулон 150 × 2500 см, артикул 109029</h2>
        <CutPlanSvg plan={demoPlan} rollWidthCm={150} rollLengthCm={2500} sizeLabels={demoSizeLabels} />
        <p className="muted" style={{ marginBottom: 0 }}>10 ковров в дело, остается обрезок 150 × 200 см, который пойдет в следующий расчет.</p>
      </section>
      <section className="section grid-3">
        {features.map(([title, text]) => (
          <div className="panel" key={title}><h3 style={{ marginTop: 0 }}>{title}</h3><p className="muted" style={{ marginBottom: 0 }}>{text}</p></div>
        ))}
      </section>
    </>
  );
}
