import { render } from '@testing-library/react';
import { CutPlanSvg } from './CutPlanSvg';

const plan = {
  feasible: true, shortfall: [],
  placements: [
    { sourceId: 'r1#0', sizeId: 'a', xCm: 0, yCm: 0, widthCm: 150, lengthCm: 300 },
    { sourceId: 'r1#0', sizeId: 'b', xCm: 0, yCm: 300, widthCm: 150, lengthCm: 200 },
  ],
  remnants: [{ sourceId: 'r1#0', widthCm: 150, lengthCm: 2000, xCm: 0, yCm: 500 }],
};

describe('CutPlanSvg', () => {
  it('draws one rectangle per placement and per remnant, with size labels', () => {
    const { container, getByText } = render(<CutPlanSvg plan={plan} rollWidthCm={150} rollLengthCm={2500} sizeLabels={{ a: '150×300', b: '150×200' }} />);
    expect(container.querySelectorAll('rect.piece')).toHaveLength(3);
    expect(container.querySelectorAll('rect.rem')).toHaveLength(1);
    expect(getByText('150×300')).toBeInTheDocument();
    expect(getByText('150×200')).toBeInTheDocument();
    expect(getByText(/обрезок/)).toBeInTheDocument();
  });

  it('scales positions by 0.4 per centimetre (the mockup scale)', () => {
    const { container } = render(<CutPlanSvg plan={plan} rollWidthCm={150} rollLengthCm={2500} />);
    const second = container.querySelectorAll('rect.piece')[1];
    expect(Number(second.getAttribute('x'))).toBeCloseTo(120, 5);   // y 300 cm → x 120 on the horizontal length axis
    expect(Number(second.getAttribute('width'))).toBeCloseTo(80, 5); // 200 cm long
    expect(Number(second.getAttribute('height'))).toBeCloseTo(60, 5); // 150 cm wide
  });

  it('has an accessible description and shows the scale', () => {
    const { getByRole, getByText } = render(<CutPlanSvg plan={plan} rollWidthCm={150} rollLengthCm={2500} />);
    expect(getByRole('img').getAttribute('aria-label')).toMatch(/150 на 2500/);
    expect(getByText('2500 см')).toBeInTheDocument();
  });

  it('renders one strip per source when several rolls are used', () => {
    const two = { ...plan, placements: [...plan.placements, { sourceId: 'r1#1', sizeId: 'a', xCm: 0, yCm: 0, widthCm: 150, lengthCm: 300 }] };
    const { container } = render(<CutPlanSvg plan={two} rollWidthCm={150} rollLengthCm={2500} />);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
