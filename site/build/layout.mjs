// Shared page shell for the static public pages in site/www.
export const ORIGIN = 'https://www.offtheclockai.com';
export const SIGNUP = 'https://app.offtheclockai.com/signup';
export const SUPPORT = 'support@offtheclockai.com';

export const esc = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MARK = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M14.3 3.86 A7.5 7.5 0 1 1 5.7 3.86" stroke="#00E676" stroke-width="1.7" stroke-linecap="round"/><path d="M10 1.9 L10 10 L13.3 12.2" stroke="#00E676" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const NAV = [
  ['/pricing/', 'Pricing'],
  ['/compare/', 'Compare'],
  ['/industries/', 'Industries'],
  ['/faq/', 'FAQ'],
  ['/docs/', 'Docs']
];

const FOOTER = [
  ['Product', [['/#demo', 'Live demo'], ['/pricing/', 'Pricing'], ['/who-its-for/', 'Who it\u2019s for'], ['/industries/', 'Industries'], ['/missed-call-calculator/', 'Missed call calculator'], ['/faq/', 'FAQ']]],
  ['Compare', [['/compare/', 'All comparisons'], ['/alternatives/', 'Alternatives'], ['/compare/jobber-receptionist/', 'vs Jobber Receptionist'], ['/compare/smith-ai/', 'vs Smith.ai'], ['/compare/ruby/', 'vs Ruby']]],
  ['Help', [['/docs/', 'User docs'], ['/docs/switching/', 'Switching guides'], ['/docs/your-ai-employee/', 'How your AI employee behaves'], ['mailto:' + SUPPORT, 'Email support']]],
  ['Company', [['/privacy/', 'Privacy'], ['/terms/', 'Terms']]]
];

function header(path) {
  const links = NAV.map(([href, label]) =>
    `<a href="${href}"${path.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const menu = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('') + '<a href="/#demo">Live demo</a>';
  return `<header class="site-header"><div class="wrap">
<a class="brand" href="/">${MARK}<span>Off The Clock AI</span></a>
<nav class="nav" aria-label="Main">${links}<a class="btn" href="${SIGNUP}">Start free trial</a></nav>
<details class="menu"><summary>Menu</summary><div class="panel">${menu}<a href="${SIGNUP}">Start free trial</a></div></details>
</div></header>`;
}

function footer() {
  const cols = FOOTER.map(([title, links]) =>
    `<div><h4>${title}</h4>${links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('')}</div>`).join('');
  return `<footer class="site-footer"><div class="wrap">
<div class="cols"><div><a class="brand" href="/">${MARK}<span>Off The Clock AI</span></a><p class="tagline">When you're off the clock... your business is not</p></div>${cols}</div>
<div class="legal"><span>\u00a9 2026 OFF THE CLOCK AI</span><span>14-DAY FREE TRIAL \u00b7 CANCEL ANYTIME \u00b7 SELF-SERVE</span><a href="mailto:${SUPPORT}">${SUPPORT.toUpperCase()}</a></div>
</div></footer>`;
}

export function crumbs(trail) {
  if (!trail?.length) return '';
  const parts = [['/', 'Home'], ...trail].map(([href, label], i, all) =>
    i === all.length - 1 ? esc(label) : `<a href="${href}">${esc(label)}</a>`);
  return `<p class="crumbs">${parts.join(' / ')}</p>`;
}

function breadcrumbSchema(trail) {
  if (!trail?.length) return null;
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['/', 'Home'], ...trail].map(([href, label], i) => ({
      '@type': 'ListItem', position: i + 1, name: label, item: ORIGIN + href
    }))
  };
}

export function cta(title = 'Hear it answer a call', text = 'Talk to the live demo on the homepage, then try it on your own line free for 14 days.') {
  return `<section class="cta"><div class="wrap"><div class="box"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>
<div style="display:flex;flex-wrap:wrap;gap:12px"><a class="btn" href="${SIGNUP}">Start free trial</a><a class="btn ghost" href="/#demo">Hear the live demo</a></div></div></div></section>`;
}

export function hero({ eyebrow, title, lead, trail, actions = true }) {
  return `<section class="hero"><div class="wrap">${crumbs(trail)}
${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h1>${esc(title)}</h1>
${lead ? `<p class="lead">${lead}</p>` : ''}
${actions ? `<div class="actions"><a class="btn" href="${SIGNUP}">Start free trial</a><a class="btn ghost" href="/#demo">Hear the live demo</a></div>` : ''}
</div></section>`;
}

export function page({ path, title, description, body, schema = [], trail, ogType = 'website' }) {
  const url = ORIGIN + path;
  const graphs = [...schema, breadcrumbSchema(trail)].filter(Boolean)
    .map(item => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#0A0A0A">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Off The Clock AI">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/og-image.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
${graphs}
</head>
<body>
${header(path)}
<main>
${body}
</main>
${footer()}
</body>
</html>
`;
}
