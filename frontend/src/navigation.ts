/** Full-page navigation (e.g. to the payment provider). Isolated so tests can replace it. */
export const redirect = (url: string): void => { window.location.assign(url); };
