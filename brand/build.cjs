// Generates the CarpetLAB brand assets as static SVG files (wordmark converted to outlines).
const fs = require('fs');
const opentype = require('opentype.js');
const font = opentype.loadSync(__dirname + '/plexmono600.ttf');
const INK = '#12203A', ACCENT = '#D9461F', BLUE1 = '#5B7FB5', BLUE2 = '#A9BDDB';

// ---- mark: a cutting plan on a navy tile (viewBox 64) ----
const pieces = (hatch) => `
  <rect x="8" y="8" width="26" height="48" fill="${BLUE1}"/>
  ${hatch ? `<rect x="11.2" y="11.2" width="19.6" height="41.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><path d="M21 25 L27 32 L21 39 L15 32 Z" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.4"/>` : ''}
  <rect x="37" y="8" width="19" height="28" fill="${BLUE2}"/>
  <rect x="37" y="39" width="19" height="17" fill="${ACCENT}"/>
  ${hatch ? `<g clip-path="url(#off)" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"><path d="M30 60 L62 28 M36 60 L68 28 M42 60 L74 28 M24 60 L56 28 M18 60 L50 28"/></g>` : ''}`;
const defs = (hatch) => hatch ? `<defs><clipPath id="off"><rect x="37" y="39" width="19" height="17"/></clipPath></defs>` : '';
const mark = (hatch = true, tile = INK) => `${defs(hatch)}<rect width="64" height="64" rx="6" fill="${tile}"/>${pieces(hatch)}`;

fs.writeFileSync('logo-mark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CarpetLAB">${mark()}</svg>\n`);
// favicon: no hatch (invisible at 16 px); slightly lighter tile on dark browser themes
fs.writeFileSync('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.t{fill:${INK}}@media (prefers-color-scheme:dark){.t{fill:#1d2f55}}</style><rect class="t" width="64" height="64" rx="8"/><rect x="8" y="8" width="26" height="48" fill="${BLUE1}"/><rect x="37" y="8" width="19" height="28" fill="${BLUE2}"/><rect x="37" y="39" width="19" height="17" fill="${ACCENT}"/></svg>\n`);

// ---- wordmark as outlines ----
const SIZE = 34, BASE = 43, X0 = 80;
function word(text, x, fill) {
  const p = font.getPath(text, x, BASE, SIZE);
  return { d: p.toPathData(2), width: font.getAdvanceWidth(text, SIZE), fill };
}
const a = word('Carpet', X0, null), b = word('LAB', X0 + font.getAdvanceWidth('Carpet', SIZE), null);
const W = Math.ceil(X0 + a.width + b.width + 4);
const logo = (inkColor, tile) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 64" role="img" aria-label="CarpetLAB"><g transform="translate(0 0)">${mark(true, tile)}</g><path d="${a.d}" fill="${inkColor}"/><path d="${b.d.replace(/^M/, 'M')}" fill="${ACCENT}"/></svg>\n`;
fs.writeFileSync('logo.svg', logo(INK, INK));
fs.writeFileSync('logo-light.svg', logo('#FFFFFF', '#1d2f55'));
fs.writeFileSync('logo-width.txt', String(W));
console.log('wordmark width', W);
