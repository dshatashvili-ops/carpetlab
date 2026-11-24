/** Absolute link into the web app, for e-mails and payment redirects. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
