/** GS1 check digit for the first 12 digits of an EAN-13. */
export function checkDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new RangeError('expected 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === Number(code[12]);
}

/** GS1 company prefix (7–9 digits) + zero-padded item number + check digit. */
export function formatEan13(prefix: string, seq: number): string {
  if (!/^\d{7,9}$/.test(prefix)) throw new RangeError('GS1 prefix must be 7–9 digits');
  const itemDigits = 12 - prefix.length;
  if (!Number.isInteger(seq) || seq < 1 || seq >= 10 ** itemDigits) throw new RangeError('item number out of range for this prefix');
  const first12 = prefix + String(seq).padStart(itemDigits, '0');
  return first12 + String(checkDigit(first12));
}
