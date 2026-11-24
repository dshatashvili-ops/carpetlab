const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
export const formatRub = (kopecks: number): string => rub.format(kopecks / 100);
export const formatM2 = (m2: number): string => `${m2.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м²`;
export const formatMb = (mb: number): string => (mb >= 1024 ? `${mb / 1024} ГБ` : `${mb} МБ`);
export const monthsLabel = (m: number): string => `${m} мес.`;
