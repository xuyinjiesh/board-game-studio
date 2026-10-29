// Keep /assets/ in saved projects so backups work across local and hosted sites.
const moduleUrl = new URL(import.meta.url);
const siteBase = moduleUrl.protocol === 'file:' ? '/' : new URL('../', moduleUrl).pathname;

export function assetUrl(url, base = siteBase) {
  return typeof url === 'string' && url.startsWith('/assets/')
    ? `${base}${url.slice(1)}` : url;
}

// Game modules return HTML for manuals, catalogs and token faces.
export function assetHTML(html, base = siteBase) {
  return html.replace(/\b(src|href)=(["'])\/assets\//g,
    (_, attribute, quote) => `${attribute}=${quote}${assetUrl('/assets/', base)}`);
}
