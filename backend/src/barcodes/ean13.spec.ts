import { checkDigit, formatEan13, isValidEan13 } from './ean13';

describe('ean13', () => {
  it('computes the GS1 check digit (reference 4006381333931 → 1)', () => {
    expect(checkDigit('400638133393')).toBe(1);
  });

  it('validates a correct code and rejects a wrong check digit, wrong length and non-digits', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('123')).toBe(false);
    expect(isValidEan13('40063813339a1')).toBe(false);
  });

  it('formats prefix + zero-padded item number + check digit to 13 valid digits', () => {
    const a = formatEan13('4600123', 1);
    expect(a).toHaveLength(13);
    expect(a.startsWith('460012300001')).toBe(true);
    expect(isValidEan13(a)).toBe(true);
    const b = formatEan13('460012345', 2);
    expect(b.startsWith('460012345002')).toBe(true);
    expect(isValidEan13(b)).toBe(true);
  });

  it('rejects prefixes outside 7–9 digits and numbers that do not fit', () => {
    expect(() => formatEan13('460012', 1)).toThrow(RangeError);
    expect(() => formatEan13('4600123456', 1)).toThrow(RangeError);
    expect(() => formatEan13('46001234a', 1)).toThrow(RangeError);
    expect(() => formatEan13('460012345', 1000)).toThrow(RangeError);
    expect(() => formatEan13('4600123', 0)).toThrow(RangeError);
  });
});
