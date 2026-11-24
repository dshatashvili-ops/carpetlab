import { Link } from 'react-router-dom';
import { CutPlanSvg } from '../components/CutPlanSvg';
import { demoCarpets, demoPlan, demoSizeLabels, demoStock } from '../demoData';

export function Demo() {
  return (
    <div className="section" style={{ display: 'grid', gap: 16 }}>
      <div>
        <span className="badge">Демо · вымышленные данные, только просмотр</span>
        <h1 style={{ marginBottom: 4 }}>Пример раскроя</h1>
        <p className="muted" style={{ marginTop: 0 }}>Так выглядит экран раскроя для артикула 109029. В своем кабинете вы меняете количества и выполняете раскрой.</p>
      </div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Схема раскроя</h2>
        <CutPlanSvg plan={demoPlan} rollWidthCm={150} rollLengthCm={2500} sizeLabels={demoSizeLabels} />
        <p className="num" style={{ marginBottom: 0 }}>34,5 м² в ковры из 37,5 · останется обрезок 150 × 200</p>
      </div>
      <div className="grid-3">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Остатки материала</h3>
          <div className="table-scroll"><table className="data"><thead><tr><th>Что</th><th>Размер, см</th><th>Шт.</th><th>Площадь</th></tr></thead>
            <tbody>{demoStock.map((r) => <tr key={r.kind + r.size}><td>{r.kind}</td><td className="num">{r.size}</td><td className="num">{r.qty}</td><td className="num">{r.area}</td></tr>)}</tbody></table></div>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Готовые ковры</h3>
          <div className="table-scroll"><table className="data"><thead><tr><th>Размер, см</th><th>Шт.</th></tr></thead>
            <tbody>{demoCarpets.map((r) => <tr key={r.size}><td className="num">{r.size}</td><td className="num">{r.qty}</td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="cta"><Link className="btn" to="/register">Попробовать 7 дней</Link></div>
    </div>
  );
}
