// lib/productArt.js — product imagery, generated instead of fetched.
//
// WHY THIS EXISTS
//
// The seed catalogue used to point at seven Unsplash URLs rotated across all
// sixty-six products. Two problems with that: a headphone photo appeared on a
// power bank, and every image was a live dependency on a third-party CDN that
// could rate-limit, rewrite or retire a photo ID at any time. A storefront
// whose product images 404 looks broken in a way nothing else does.
//
// So the images are drawn here, on the fly, as SVG. `GET
// /media/products/laptop-gaming/graphite/front.svg` renders a 4:3 illustration
// of a gaming laptop in graphite. It is a pure function of the URL, so it is
// immutable and cacheable forever, it weighs ~2 KB, it scales to any display
// without a second asset, and it cannot break.
//
// These are illustrations, not photographs. When real product photography
// arrives, `IMAGE_OVERRIDES` in catalogue.data.js is the one place to put the
// URLs — set an entry and it wins over the generated art for that product.
//
// Adding a shape: add a renderer to SHAPES. It receives the resolved palette
// and the view, and returns the SVG body drawn inside a 1000×750 viewBox.

export const CANVAS = { width: 1000, height: 750 };

/**
 * Colourways. `body` is the device shell, `trim` the secondary surface,
 * `accent` keys, ports and LEDs, `screen` the display glass.
 */
export const COLORWAYS = {
  graphite: { body: '#3F444B', trim: '#2A2E34', accent: '#8A939F', screen: '#15181C', bg: '#EEF0F3' },
  silver: { body: '#D6DAE0', trim: '#8F97A3', accent: '#5C6472', screen: '#1B1E23', bg: '#F4F6F8' },
  midnight: { body: '#252A38', trim: '#171B26', accent: '#5A6480', screen: '#0E1117', bg: '#E9EBF1' },
  ultramarine: { body: '#2D2BF5', trim: '#1E1CC4', accent: '#9B9AFF', screen: '#101037', bg: '#EAEAFE' },
  titanium: { body: '#9A968E', trim: '#5E5B55', accent: '#D8D4CB', screen: '#171613', bg: '#F2F1EE' },
  porcelain: { body: '#F2F3F5', trim: '#A9B0BA', accent: '#6E7681', screen: '#1A1D22', bg: '#FAFBFC' },
  signal: { body: '#FF5A1F', trim: '#CC3F0C', accent: '#FFC4A8', screen: '#241008', bg: '#FFF0E9' },
  forest: { body: '#20463A', trim: '#122E25', accent: '#5E9A83', screen: '#0B1712', bg: '#E8F0EC' },
  crimson: { body: '#9E1F2B', trim: '#71121C', accent: '#E08A92', screen: '#1E0A0D', bg: '#FAEBEC' },
};

export const VIEWS = ['front', 'angle', 'detail'];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- primitives

/** A soft vignette so the device is not floating on flat colour. */
const backdrop = (p) => `
  <rect width="1000" height="750" fill="url(#bg)"/>
  <ellipse cx="500" cy="640" rx="330" ry="38" fill="${p.trim}" opacity="0.13"/>`;

const screenGlass = (x, y, w, h, r, p) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${p.screen}"/>
   <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#glass)"/>`;

/** Abstract UI inside a display — bars, never text, so it reads at any size. */
const screenUi = (x, y, w, h, p) => {
  const pad = w * 0.08;
  const bw = w - pad * 2;
  const rows = [0.34, 0.2, 0.52, 0.28, 0.42];
  return `
  <rect x="${x + pad}" y="${y + h * 0.16}" width="${bw * 0.46}" height="${h * 0.055}" rx="${h * 0.028}" fill="${p.accent}" opacity="0.85"/>
  ${rows
    .map(
      (f, i) =>
        `<rect x="${x + pad}" y="${y + h * (0.3 + i * 0.1)}" width="${bw * f}" height="${h * 0.035}" rx="${h * 0.018}" fill="${p.accent}" opacity="${0.5 - i * 0.06}"/>`
    )
    .join('')}
  <circle cx="${x + w - pad - h * 0.1}" cy="${y + h * 0.72}" r="${h * 0.1}" fill="${p.accent}" opacity="0.28"/>`;
};

// ------------------------------------------------------------------- shapes
//
// Each renderer returns SVG drawn in the 1000×750 box. `view` shifts the
// composition: `front` is square-on, `angle` is skewed three-quarters,
// `detail` zooms into a characteristic feature.

const laptop = (p, view, { gaming = false, convertible = false } = {}) => {
  if (convertible && view === 'detail') {
    // Tent mode belongs in the detail view, not the card. In a grid of twenty
    // laptops a tent reads as an abstract triangle rather than a product; on
    // the product page, where there is one image and context, it is the single
    // clearest way to show what a 360 hinge does.
    return `${backdrop(p)}
      <path d="M500 120 L830 560 L700 585 L480 190 Z" fill="${p.trim}"/>
      <path d="M500 150 L795 545 L712 561 L488 200 Z" fill="${p.screen}"/>
      <path d="M500 120 L170 560 L300 585 L520 190 Z" fill="${p.body}"/>
      <path d="M500 152 L215 546 L296 562 L512 200 Z" fill="${p.trim}" opacity="0.55"/>
      <circle cx="500" cy="150" r="14" fill="${p.accent}"/>
      <rect x="640" y="300" width="8" height="120" rx="4" fill="${p.accent}" opacity="0.5" transform="rotate(38 644 360)"/>`;
  }

  if (view === 'detail') {
    // Keyboard deck close-up.
    const keys = [];
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 12; c += 1) {
        keys.push(
          `<rect x="${170 + c * 56}" y="${230 + r * 70}" width="46" height="58" rx="8" fill="${p.trim}"/>
           <rect x="${170 + c * 56}" y="${230 + r * 70}" width="46" height="52" rx="8" fill="${p.body}"/>`
        );
        if (gaming)
          keys.push(
            `<rect x="${170 + c * 56}" y="${282 + r * 70}" width="46" height="6" rx="3" fill="url(#rgb)" opacity="0.9"/>`
          );
      }
    }
    return `${backdrop(p)}
      <rect x="120" y="180" width="760" height="400" rx="26" fill="${p.trim}"/>
      <rect x="132" y="192" width="736" height="376" rx="20" fill="${p.body}"/>
      ${keys.join('')}`;
  }

  const skew = view === 'angle';
  const lid = skew
    ? '<path d="M250 130 L790 165 L800 420 L240 400 Z"/>'
    : '<path d="M215 110 L785 110 L785 420 L215 420 Z"/>';
  const scr = skew
    ? '<path d="M272 158 L768 190 L776 396 L264 378 Z"/>'
    : '<path d="M240 135 L760 135 L760 396 L240 396 Z"/>';
  const base = skew
    ? '<path d="M175 425 L835 445 L900 505 L120 490 Z"/>'
    : '<path d="M175 420 L825 420 L880 480 L120 480 Z"/>';

  return `${backdrop(p)}
    <g fill="${p.trim}">${lid}</g>
    <g fill="${p.screen}">${scr}</g>
    <g clip-path="url(#scrclip${skew ? 'A' : 'F'})">
      ${screenUi(skew ? 272 : 240, skew ? 165 : 135, 500, 245, p)}
    </g>
    <g fill="${p.body}">${base}</g>
    <rect x="${skew ? 300 : 300}" y="${skew ? 452 : 440}" width="400" height="14" rx="7" fill="${p.trim}" opacity="0.7"/>
    ${gaming ? `<rect x="130" y="${skew ? 487 : 477}" width="760" height="9" rx="4" fill="url(#rgb)"/>` : ''}
    ${convertible
      ? `<rect x="${skew ? 196 : 186}" y="${skew ? 412 : 407}" width="42" height="26" rx="13" fill="${p.accent}" opacity="0.9"/>
         <rect x="${skew ? 762 : 762}" y="${skew ? 418 : 407}" width="42" height="26" rx="13" fill="${p.accent}" opacity="0.9"/>
         <rect x="620" y="${skew ? 462 : 452}" width="230" height="13" rx="6.5" fill="${p.accent}" opacity="0.75"/>
         <circle cx="856" cy="${skew ? 468 : 458}" r="7" fill="${p.trim}"/>`
      : ''}
    <rect x="${skew ? 262 : 240}" y="${skew ? 152 : 128}" width="6" height="${skew ? 230 : 262}" fill="${p.accent}" opacity="0.25"/>`;
};

const phone = (p, view, { island = false, dual = false } = {}) => {
  if (view === 'detail') {
    // The camera array, which is what actually distinguishes phones.
    const lens = (cx, cy, r) => `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#4A4F57"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.82}" fill="#14171B"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="#0B2B4A"/>
      <circle cx="${cx - r * 0.25}" cy="${cy - r * 0.25}" r="${r * 0.16}" fill="#BFE3FF" opacity="0.85"/>`;
    return `${backdrop(p)}
      <rect x="250" y="130" width="500" height="490" rx="70" fill="${p.body}"/>
      <rect x="290" y="170" width="300" height="300" rx="56" fill="${p.trim}" opacity="0.55"/>
      ${lens(370, 250, 62)}
      ${lens(510, 250, 62)}
      ${dual ? '' : lens(370, 390, 62)}
      <circle cx="${dual ? 440 : 510}" cy="390" r="26" fill="${p.accent}" opacity="0.9"/>`;
  }

  const skew = view === 'angle';
  const body = skew
    ? '<path d="M355 95 L650 130 L650 655 L355 620 Z"/>'
    : '<rect x="360" y="90" width="280" height="570" rx="44"/>';

  return `${backdrop(p)}
    <g fill="${p.trim}">${body}</g>
    ${skew
      ? `<g fill="${p.screen}"><path d="M375 122 L630 152 L630 628 L375 598 Z"/></g>`
      : screenGlass(378, 108, 244, 534, 34, p)}
    <g clip-path="url(#phclip${skew ? 'A' : 'F'})">${screenUi(378, 120, 244, 500, p)}</g>
    ${island
      ? `<rect x="${skew ? 452 : 455}" y="${skew ? 143 : 126}" width="90" height="22" rx="11" fill="${p.screen}"/>`
      : `<circle cx="500" cy="${skew ? 146 : 132}" r="7" fill="${p.screen}"/>`}
    <rect x="${skew ? 646 : 638}" y="240" width="8" height="60" rx="4" fill="${p.accent}" opacity="0.7"/>
    <rect x="${skew ? 646 : 638}" y="320" width="8" height="90" rx="4" fill="${p.accent}" opacity="0.7"/>`;
};

const headphones = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <circle cx="500" cy="375" r="215" fill="${p.trim}"/>
      <circle cx="500" cy="375" r="182" fill="${p.body}"/>
      <circle cx="500" cy="375" r="120" fill="${p.trim}" opacity="0.6"/>
      <circle cx="500" cy="375" r="96" fill="${p.screen}" opacity="0.35"/>
      <circle cx="500" cy="375" r="26" fill="${p.accent}"/>
      <rect x="640" y="356" width="44" height="12" rx="6" fill="${p.accent}" opacity="0.8"/>`;

  const skew = view === 'angle';
  return `${backdrop(p)}
    <path d="M280 400 C280 170 720 170 720 400" stroke="${p.trim}" stroke-width="46" fill="none" stroke-linecap="round"/>
    <path d="M292 390 C292 196 708 196 708 390" stroke="${p.accent}" stroke-width="16" fill="none" opacity="0.45"/>
    <g fill="${p.body}">
      <rect x="${skew ? 205 : 215}" y="365" width="${skew ? 150 : 170}" height="230" rx="${skew ? 62 : 72}"/>
      <rect x="${skew ? 655 : 615}" y="365" width="${skew ? 150 : 170}" height="230" rx="${skew ? 62 : 72}"/>
    </g>
    <g fill="${p.trim}" opacity="0.75">
      <rect x="${skew ? 228 : 240}" y="392" width="${skew ? 104 : 120}" height="176" rx="${skew ? 46 : 56}"/>
      <rect x="${skew ? 678 : 640}" y="392" width="${skew ? 104 : 120}" height="176" rx="${skew ? 46 : 56}"/>
    </g>
    <circle cx="${skew ? 280 : 300}" cy="480" r="16" fill="${p.accent}"/>`;
};

const earbuds = (p, view) => {
  const bud = (cx, cy, s) => `
    <g transform="translate(${cx} ${cy}) scale(${s})">
      <circle cx="0" cy="0" r="52" fill="${p.body}"/>
      <circle cx="0" cy="0" r="30" fill="${p.trim}"/>
      <circle cx="-10" cy="-12" r="10" fill="${p.accent}" opacity="0.8"/>
      <rect x="-15" y="34" width="30" height="110" rx="15" fill="${p.body}"/>
      <rect x="-7" y="120" width="14" height="22" rx="7" fill="${p.accent}" opacity="0.7"/>
    </g>`;

  if (view === 'detail') return `${backdrop(p)}${bud(500, 300, 2.1)}`;

  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 340 : 330}" y="${skew ? 300 : 320}" width="340" height="270" rx="${skew ? 70 : 78}" fill="${p.trim}"/>
    <rect x="${skew ? 356 : 346}" y="${skew ? 314 : 334}" width="308" height="242" rx="${skew ? 60 : 68}" fill="${p.body}"/>
    <rect x="${skew ? 356 : 346}" y="${skew ? 404 : 424}" width="308" height="8" rx="4" fill="${p.trim}" opacity="0.5"/>
    <circle cx="500" cy="${skew ? 520 : 540}" r="12" fill="${p.accent}"/>
    ${bud(405, 190, 1)}
    ${bud(595, 190, 1)}`;
};

const speaker = (p, view, { brick = false } = {}) => {
  const grille = [];
  for (let i = 0; i < 39; i += 1)
    grille.push(
      `<circle cx="${brick ? 300 + (i % 13) * 33 : 420 + (i % 6) * 28}" cy="${brick ? 320 + Math.floor(i / 13) * 33 : 250 + Math.floor(i / 6) * 34}" r="7" fill="${p.screen}" opacity="0.4"/>`
    );

  if (view === 'detail')
    return `${backdrop(p)}
      <circle cx="500" cy="375" r="220" fill="${p.body}"/>
      <circle cx="500" cy="375" r="170" fill="${p.trim}"/>
      <circle cx="500" cy="375" r="120" fill="${p.screen}" opacity="0.5"/>
      <circle cx="500" cy="375" r="44" fill="${p.accent}"/>`;

  const skew = view === 'angle';
  return `${backdrop(p)}
    ${brick
      ? `<rect x="${skew ? 250 : 240}" y="270" width="520" height="230" rx="46" fill="${p.body}" stroke="${p.screen}" stroke-opacity="0.15" stroke-width="3"/>
         <rect x="${skew ? 266 : 256}" y="286" width="488" height="198" rx="36" fill="${p.trim}" opacity="0.35"/>`
      : `<rect x="${skew ? 395 : 385}" y="180" width="230" height="400" rx="115" fill="${p.body}" stroke="${p.screen}" stroke-opacity="0.15" stroke-width="3"/>
         <rect x="${skew ? 411 : 401}" y="196" width="198" height="368" rx="99" fill="${p.trim}" opacity="0.35"/>`}
    ${grille.join('')}
    <rect x="${brick ? 300 : 440}" y="${brick ? 448 : 520}" width="${brick ? 120 : 120}" height="10" rx="5" fill="${p.accent}" opacity="0.85"/>`;
};

const watch = (p, view, { round = false, band = false } = {}) => {
  if (view === 'detail')
    return `${backdrop(p)}
      ${round
        ? `<circle cx="500" cy="375" r="230" fill="${p.trim}"/><circle cx="500" cy="375" r="200" fill="${p.screen}"/>`
        : `<rect x="270" y="145" width="460" height="460" rx="110" fill="${p.trim}"/><rect x="298" y="173" width="404" height="404" rx="88" fill="${p.screen}"/>`}
      <circle cx="500" cy="375" r="125" fill="none" stroke="${p.accent}" stroke-width="22" opacity="0.35"/>
      <path d="M500 250 A125 125 0 0 1 606 437" fill="none" stroke="${p.accent}" stroke-width="22" stroke-linecap="round"/>
      <circle cx="500" cy="375" r="16" fill="${p.accent}"/>`;

  const skew = view === 'angle';
  const w = band ? 150 : 250;
  const h = band ? 210 : 290;
  const x = 500 - w / 2 + (skew ? 12 : 0);
  return `${backdrop(p)}
    <path d="M${500 - (band ? 46 : 74)} 300 L${500 - (band ? 46 : 74)} 130 Q500 88 ${500 + (band ? 46 : 74)} 130 L${500 + (band ? 46 : 74)} 300 Z" fill="${p.accent}" opacity="0.55"/>
    <path d="M${500 - (band ? 46 : 74)} 450 L${500 - (band ? 46 : 74)} 620 Q500 662 ${500 + (band ? 46 : 74)} 620 L${500 + (band ? 46 : 74)} 450 Z" fill="${p.accent}" opacity="0.55"/>
    ${round
      ? `<circle cx="500" cy="375" r="${h / 2}" fill="${p.trim}"/><circle cx="500" cy="375" r="${h / 2 - 22}" fill="${p.screen}"/>`
      : `<rect x="${x}" y="${375 - h / 2}" width="${w}" height="${h}" rx="${band ? 60 : 62}" fill="${p.trim}"/>
         <rect x="${x + 16}" y="${375 - h / 2 + 16}" width="${w - 32}" height="${h - 32}" rx="${band ? 48 : 50}" fill="${p.screen}"/>`}
    <g clip-path="url(#wclip)">
      <rect x="${x + 34}" y="${375 - h / 2 + 52}" width="${(w - 68) * 0.8}" height="16" rx="8" fill="${p.accent}" opacity="0.9"/>
      <rect x="${x + 34}" y="${375 - h / 2 + 90}" width="${(w - 68) * 0.55}" height="12" rx="6" fill="${p.accent}" opacity="0.6"/>
      <rect x="${x + 34}" y="${375 - h / 2 + 122}" width="${(w - 68) * 0.68}" height="12" rx="6" fill="${p.accent}" opacity="0.4"/>
    </g>
    ${round ? '' : `<rect x="${x + w}" y="340" width="14" height="52" rx="7" fill="${p.accent}"/>`}`;
};

const consoleVertical = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="300" y="120" width="400" height="510" rx="40" fill="${p.porcelain || '#F2F3F5'}"/>
      <rect x="300" y="120" width="400" height="510" rx="40" fill="${p.body}" opacity="0.15"/>
      <rect x="430" y="120" width="140" height="510" fill="${p.trim}"/>
      <circle cx="500" cy="560" r="10" fill="${p.accent}"/>
      <rect x="352" y="180" width="18" height="120" rx="9" fill="${p.accent}" opacity="0.5"/>`;

  const skew = view === 'angle';
  return `${backdrop(p)}
    <path d="M${skew ? 392 : 398} 110 Q${skew ? 352 : 358} 375 ${skew ? 392 : 398} 640 L${skew ? 462 : 452} 640 Q${skew ? 432 : 422} 375 ${skew ? 462 : 452} 110 Z" fill="#F2F3F5"/>
    <path d="M${skew ? 608 : 602} 110 Q${skew ? 648 : 642} 375 ${skew ? 608 : 602} 640 L${skew ? 538 : 548} 640 Q${skew ? 568 : 578} 375 ${skew ? 538 : 548} 110 Z" fill="#F2F3F5"/>
    <rect x="${skew ? 452 : 452}" y="110" width="96" height="530" rx="8" fill="${p.trim}"/>
    <rect x="${skew ? 452 : 452}" y="250" width="96" height="6" fill="${p.accent}" opacity="0.6"/>
    <circle cx="500" cy="600" r="9" fill="${p.accent}"/>
    <ellipse cx="500" cy="648" rx="140" ry="14" fill="${p.trim}" opacity="0.25"/>`;
};

const consoleBox = (p, view) => {
  const vents = [];
  for (let i = 0; i < 7; i += 1)
    vents.push(`<circle cx="${420 + (i % 4) * 54}" cy="${170 + Math.floor(i / 4) * 54}" r="13" fill="${p.screen}" opacity="0.55"/>`);
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="260" y="140" width="480" height="480" rx="44" fill="${p.body}"/>
      <circle cx="500" cy="330" r="150" fill="${p.trim}"/>
      <circle cx="500" cy="330" r="118" fill="${p.screen}" opacity="0.6"/>
      <rect x="360" y="530" width="280" height="14" rx="7" fill="${p.accent}" opacity="0.7"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 360 : 370}" y="140" width="${skew ? 290 : 260}" height="480" rx="30" fill="${p.body}" stroke="${p.screen}" stroke-opacity="0.15" stroke-width="3"/>
    <rect x="${skew ? 376 : 386}" y="156" width="${skew ? 258 : 228}" height="448" rx="22" fill="${p.trim}" opacity="0.4"/>
    <rect x="${skew ? 376 : 386}" y="140" width="${skew ? 258 : 228}" height="70" rx="24" fill="${p.trim}"/>
    ${vents.join('')}
    <circle cx="500" cy="580" r="10" fill="${p.accent}"/>`;
};

const handheld = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="180" y="200" width="200" height="350" rx="40" fill="${p.body}"/>
      <circle cx="280" cy="300" r="42" fill="${p.trim}"/>
      <circle cx="280" cy="300" r="20" fill="${p.accent}"/>
      <circle cx="240" cy="440" r="22" fill="${p.trim}"/><circle cx="320" cy="440" r="22" fill="${p.trim}"/>
      <rect x="430" y="200" width="400" height="350" rx="24" fill="${p.trim}"/>
      ${screenGlass(450, 220, 360, 310, 14, p)}
      <g clip-path="url(#hclip)">${screenUi(450, 230, 360, 290, p)}</g>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 218 : 208}" y="240" width="130" height="280" rx="34" fill="${p.accent}"/>
    <rect x="${skew ? 652 : 662}" y="240" width="130" height="280" rx="34" fill="${p.accent}" opacity="0.72"/>
    <rect x="${skew ? 336 : 326}" y="222" width="${skew ? 330 : 348}" height="316" rx="22" fill="${p.trim}"/>
    ${screenGlass(skew ? 354 : 344, 240, skew ? 294 : 312, 280, 12, p)}
    <g clip-path="url(#hclip)">${screenUi(skew ? 354 : 344, 250, 312, 260, p)}</g>
    <circle cx="${skew ? 283 : 273}" cy="315" r="30" fill="${p.trim}"/>
    <circle cx="${skew ? 717 : 727}" cy="315" r="30" fill="${p.trim}"/>`;
};

const controller = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <circle cx="380" cy="375" r="150" fill="${p.trim}"/>
      <circle cx="380" cy="375" r="112" fill="${p.body}"/>
      <circle cx="380" cy="375" r="56" fill="${p.trim}"/>
      <circle cx="680" cy="300" r="42" fill="${p.accent}" opacity="0.9"/>
      <circle cx="680" cy="450" r="42" fill="${p.accent}" opacity="0.6"/>`;
  return `${backdrop(p)}
    <path d="M250 300 Q500 240 750 300 Q810 420 740 560 Q660 600 600 480 L400 480 Q340 600 260 560 Q190 420 250 300 Z" fill="${p.body}"/>
    <path d="M268 318 Q500 262 732 318 Q784 424 722 542 Q664 570 614 462 L386 462 Q336 570 278 542 Q216 424 268 318 Z" fill="${p.trim}" opacity="0.28"/>
    <circle cx="398" cy="392" r="42" fill="${p.trim}"/><circle cx="398" cy="392" r="26" fill="${p.accent}" opacity="0.8"/>
    <circle cx="602" cy="392" r="42" fill="${p.trim}"/><circle cx="602" cy="392" r="26" fill="${p.accent}" opacity="0.8"/>
    <g fill="${p.accent}"><circle cx="690" cy="300" r="16"/><circle cx="730" cy="340" r="16"/><circle cx="650" cy="340" r="16"/><circle cx="690" cy="380" r="16"/></g>
    <rect x="288" y="292" width="20" height="74" rx="10" fill="${p.trim}"/>
    <rect x="261" y="319" width="74" height="20" rx="10" fill="${p.trim}"/>
    <rect x="470" y="294" width="60" height="12" rx="6" fill="${p.accent}" opacity="0.8"/>`;
};

const mouse = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="420" y="150" width="160" height="450" rx="80" fill="${p.trim}"/>
      <rect x="470" y="200" width="60" height="150" rx="30" fill="${p.accent}"/>
      <circle cx="500" cy="450" r="34" fill="${p.body}"/>
      <circle cx="500" cy="450" r="14" fill="${p.accent}"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <path d="M500 150 Q660 160 672 340 Q690 560 500 600 Q310 560 328 340 Q340 160 500 150 Z" fill="${p.body}" transform="${skew ? 'skewX(-4)' : ''}"/>
    <path d="M500 168 Q642 178 654 342 Q670 544 500 580 Q330 544 346 342 Q358 178 500 168 Z" fill="${p.trim}" opacity="0.22" transform="${skew ? 'skewX(-4)' : ''}"/>
    <path d="M500 152 L500 330" stroke="${p.trim}" stroke-width="5" opacity="0.6"/>
    <rect x="482" y="196" width="36" height="98" rx="18" fill="${p.accent}" opacity="0.9"/>
    <circle cx="500" cy="386" r="26" fill="${p.trim}"/>
    <rect x="${skew ? 322 : 330}" y="330" width="26" height="92" rx="13" fill="${p.accent}" opacity="0.65"/>`;
};

const keyboard = (p, view, { compact = false } = {}) => {
  const cols = compact ? 12 : 18;
  const keys = [];
  // Keys are sized to fit the chassis. They used to be a fixed width, so the
  // full-size board ran 126px past its own right edge (and off the canvas).
  const chassisX = compact ? 240 : 120;
  const chassisW = compact ? 520 : 760;
  const inset = 30;
  const gap = 7;
  const startX = chassisX + inset;
  const kw = (chassisW - inset * 2 - gap * (cols - 1)) / cols;
  for (let r = 0; r < 5; r += 1)
    for (let c = 0; c < cols; c += 1)
      keys.push(
        `<rect x="${(startX + c * (kw + gap)).toFixed(1)}" y="${255 + r * 52}" width="${kw.toFixed(1)}" height="42" rx="7" fill="${p.trim}"/>
         <rect x="${(startX + c * (kw + gap)).toFixed(1)}" y="${255 + r * 52}" width="${kw.toFixed(1)}" height="36" rx="7" fill="${p.body}"/>`
      );
  if (view === 'detail') {
    const big = [];
    for (let r = 0; r < 3; r += 1)
      for (let c = 0; c < 5; c += 1)
        big.push(
          `<rect x="${230 + c * 120}" y="${200 + r * 130}" width="104" height="112" rx="16" fill="${p.trim}"/>
           <rect x="${230 + c * 120}" y="${200 + r * 130}" width="104" height="96" rx="16" fill="${p.body}"/>
           <rect x="${252 + c * 120}" y="${222 + r * 130}" width="34" height="8" rx="4" fill="${p.accent}" opacity="0.45"/>`
        );
    return `${backdrop(p)}<rect x="180" y="150" width="640" height="470" rx="28" fill="${p.trim}"/>${big.join('')}`;
  }
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${compact ? 240 : 120}" y="${skew ? 226 : 220}" width="${compact ? 520 : 760}" height="300" rx="20" fill="${p.trim}" transform="${skew ? 'skewY(-1.5)' : ''}"/>
    <g transform="${skew ? 'skewY(-1.5)' : ''}">${keys.join('')}</g>
    <rect x="${compact ? 240 : 120}" y="${skew ? 512 : 506}" width="${compact ? 520 : 760}" height="14" rx="7" fill="${p.accent}" opacity="0.5"/>`;
};

const vrHeadset = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="200" y="230" width="600" height="300" rx="90" fill="${p.body}"/>
      <circle cx="350" cy="380" r="62" fill="${p.screen}"/>
      <circle cx="650" cy="380" r="62" fill="${p.screen}"/>
      <circle cx="350" cy="380" r="26" fill="${p.accent}" opacity="0.6"/>
      <circle cx="650" cy="380" r="26" fill="${p.accent}" opacity="0.6"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <path d="M250 340 Q500 250 750 340 L750 300 Q500 210 250 300 Z" fill="${p.accent}" opacity="0.5"/>
    <rect x="${skew ? 235 : 245}" y="300" width="${skew ? 530 : 510}" height="250" rx="70" fill="${p.body}"/>
    <rect x="${skew ? 255 : 265}" y="320" width="${skew ? 490 : 470}" height="150" rx="52" fill="${p.trim}"/>
    <circle cx="${skew ? 385 : 390}" cy="395" r="34" fill="${p.screen}"/>
    <circle cx="${skew ? 615 : 610}" cy="395" r="34" fill="${p.screen}"/>
    <rect x="440" y="512" width="120" height="14" rx="7" fill="${p.accent}" opacity="0.8"/>`;
};

const powerbank = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="280" y="170" width="440" height="410" rx="46" fill="${p.body}"/>
      <rect x="330" y="230" width="340" height="120" rx="18" fill="${p.screen}"/>
      <rect x="360" y="266" width="120" height="48" rx="8" fill="${p.accent}"/>
      <g fill="${p.trim}"><rect x="340" y="420" width="90" height="40" rx="10"/><rect x="455" y="420" width="90" height="40" rx="10"/><rect x="570" y="420" width="90" height="40" rx="10"/></g>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 352 : 342}" y="180" width="316" height="400" rx="40" fill="${p.trim}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 366 : 356}" y="194" width="288" height="372" rx="32" fill="${p.body}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 396 : 386}" y="${skew ? 226 : 238}" width="228" height="86" rx="14" fill="${p.screen}"/>
    <rect x="${skew ? 418 : 408}" y="${skew ? 252 : 264}" width="86" height="34" rx="6" fill="${p.accent}"/>
    <g fill="${p.trim}" opacity="0.8">
      <rect x="${skew ? 400 : 390}" y="${skew ? 452 : 464}" width="66" height="26" rx="8"/>
      <rect x="${skew ? 486 : 476}" y="${skew ? 454 : 466}" width="66" height="26" rx="8"/>
      <rect x="${skew ? 572 : 562}" y="${skew ? 456 : 468}" width="66" height="26" rx="8"/>
    </g>`;
};

const charger = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="300" y="170" width="400" height="400" rx="80" fill="${p.body}"/>
      <g fill="${p.trim}"><rect x="360" y="440" width="90" height="38" rx="10"/><rect x="480" y="440" width="90" height="38" rx="10"/><rect x="600" y="440" width="52" height="38" rx="10"/></g>
      <circle cx="500" cy="300" r="58" fill="${p.accent}" opacity="0.35"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <g fill="${p.accent}" opacity="0.8">
      <rect x="450" y="150" width="22" height="90" rx="6"/>
      <rect x="528" y="150" width="22" height="90" rx="6"/>
    </g>
    <rect x="${skew ? 358 : 350}" y="240" width="300" height="320" rx="62" fill="${p.trim}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 372 : 364}" y="254" width="272" height="292" rx="52" fill="${p.body}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <g fill="${p.trim}" opacity="0.85">
      <rect x="${skew ? 404 : 396}" y="${skew ? 448 : 460}" width="72" height="28" rx="9"/>
      <rect x="${skew ? 500 : 492}" y="${skew ? 450 : 462}" width="72" height="28" rx="9"/>
    </g>
    <rect x="${skew ? 420 : 412}" y="${skew ? 306 : 318}" width="160" height="12" rx="6" fill="${p.accent}" opacity="0.45"/>`;
};

const drive = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="230" y="220" width="540" height="330" rx="40" fill="${p.body}" stroke="${p.screen}" stroke-opacity="0.16" stroke-width="3"/>
      <rect x="270" y="260" width="460" height="250" rx="28" fill="${p.trim}" opacity="0.45"/>
      <rect x="300" y="300" width="180" height="20" rx="10" fill="${p.accent}"/>
      <rect x="300" y="340" width="120" height="14" rx="7" fill="${p.accent}" opacity="0.6"/>
      <circle cx="680" cy="460" r="24" fill="${p.accent}" opacity="0.7"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 308 : 300}" y="270" width="400" height="260" rx="34" fill="${p.trim}" stroke="${p.screen}" stroke-opacity="0.18" stroke-width="3" transform="${skew ? 'skewY(-2.5)' : ''}"/>
    <rect x="${skew ? 322 : 314}" y="284" width="372" height="232" rx="26" fill="${p.body}" transform="${skew ? 'skewY(-2.5)' : ''}"/>
    <rect x="${skew ? 352 : 344}" y="${skew ? 316 : 326}" width="150" height="16" rx="8" fill="${p.accent}" opacity="0.9"/>
    <rect x="${skew ? 352 : 344}" y="${skew ? 348 : 358}" width="96" height="12" rx="6" fill="${p.accent}" opacity="0.55"/>
    <rect x="${skew ? 640 : 632}" y="${skew ? 370 : 380}" width="40" height="14" rx="7" fill="${p.trim}"/>
    <circle cx="${skew ? 372 : 364}" cy="${skew ? 466 : 476}" r="9" fill="${p.accent}"/>`;
};

const monitor = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="120" y="140" width="760" height="420" rx="18" fill="${p.trim}"/>
      ${screenGlass(140, 160, 720, 380, 8, p)}
      <g clip-path="url(#mclip)">${screenUi(140, 170, 720, 360, p)}</g>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 150 : 140}" y="130" width="${skew ? 700 : 720}" height="380" rx="16" fill="${p.trim}" transform="${skew ? 'skewY(-1)' : ''}"/>
    <g transform="${skew ? 'skewY(-1)' : ''}">
      ${screenGlass(skew ? 166 : 156, 146, skew ? 668 : 688, 348, 8, p)}
      <g clip-path="url(#mclip)">${screenUi(skew ? 166 : 156, 156, 688, 330, p)}</g>
    </g>
    <rect x="465" y="510" width="70" height="90" fill="${p.body}"/>
    <rect x="360" y="598" width="280" height="24" rx="12" fill="${p.body}"/>
    <rect x="${skew ? 166 : 156}" y="484" width="120" height="8" rx="4" fill="${p.accent}" opacity="0.4"/>`;
};

const chargePad = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <circle cx="500" cy="375" r="230" fill="${p.body}"/>
      <circle cx="500" cy="375" r="180" fill="${p.trim}" opacity="0.4"/>
      <circle cx="500" cy="375" r="110" fill="none" stroke="${p.accent}" stroke-width="16" opacity="0.7"/>
      <circle cx="500" cy="375" r="60" fill="none" stroke="${p.accent}" stroke-width="16" opacity="0.4"/>`;
  return `${backdrop(p)}
    <ellipse cx="500" cy="560" rx="250" ry="60" fill="${p.trim}"/>
    <ellipse cx="500" cy="545" rx="250" ry="60" fill="${p.body}"/>
    <ellipse cx="500" cy="545" rx="170" ry="40" fill="${p.trim}" opacity="0.3"/>
    <path d="M380 540 L380 330 Q380 260 470 258 L530 258" stroke="${p.body}" stroke-width="42" fill="none" stroke-linecap="round"/>
    <rect x="470" y="180" width="180" height="140" rx="26" fill="${p.trim}"/>
    <rect x="484" y="194" width="152" height="112" rx="18" fill="${p.accent}" opacity="0.4"/>
    <circle cx="500" cy="530" r="12" fill="${p.accent}"/>`;
};

const trackpad = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="180" y="200" width="640" height="400" rx="40" fill="${p.trim}"/>
      <rect x="196" y="216" width="608" height="368" rx="30" fill="${p.body}"/>
      <circle cx="420" cy="400" r="34" fill="${p.accent}" opacity="0.3"/>
      <circle cx="560" cy="400" r="34" fill="${p.accent}" opacity="0.3"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 228 : 220}" y="250" width="560" height="360" rx="34" fill="${p.trim}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 240 : 232}" y="262" width="536" height="336" rx="26" fill="${p.body}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 240 : 232}" y="${skew ? 262 : 262}" width="536" height="26" rx="13" fill="${p.trim}" opacity="0.35"/>
    <circle cx="${skew ? 450 : 442}" cy="${skew ? 424 : 430}" r="28" fill="${p.accent}" opacity="0.28"/>
    <circle cx="${skew ? 570 : 562}" cy="${skew ? 422 : 430}" r="28" fill="${p.accent}" opacity="0.28"/>`;
};


const microphone = (p, view) => {
  const mesh = [];
  for (let i = 0; i < 40; i += 1)
    mesh.push(`<circle cx="${430 + (i % 8) * 24}" cy="${210 + Math.floor(i / 8) * 26}" r="5" fill="${p.screen}" opacity="0.35"/>`);
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="330" y="150" width="340" height="430" rx="90" fill="${p.trim}"/>
      <rect x="352" y="172" width="296" height="386" rx="74" fill="${p.body}"/>
      ${Array.from({ length: 63 }, (_v, i) => `<circle cx="${390 + (i % 9) * 30}" cy="${215 + Math.floor(i / 9) * 46}" r="8" fill="${p.screen}" opacity="0.32"/>`).join('')}
      <circle cx="500" cy="540" r="26" fill="${p.accent}"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 418 : 410}" y="180" width="180" height="280" rx="60" fill="${p.trim}" transform="${skew ? 'rotate(-4 500 320)' : ''}"/>
    <rect x="${skew ? 430 : 422}" y="192" width="156" height="256" rx="50" fill="${p.body}" transform="${skew ? 'rotate(-4 500 320)' : ''}"/>
    <g transform="${skew ? 'rotate(-4 500 320)' : ''}">${mesh.join('')}</g>
    <rect x="484" y="456" width="32" height="70" fill="${p.trim}"/>
    <path d="M400 560 L600 560 L570 600 L430 600 Z" fill="${p.trim}"/>
    <ellipse cx="500" cy="602" rx="110" ry="14" fill="${p.body}"/>
    <circle cx="${skew ? 452 : 445}" cy="500" r="11" fill="${p.accent}"/>`;
};

const webcam = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <circle cx="500" cy="360" r="215" fill="${p.trim}"/>
      <circle cx="500" cy="360" r="150" fill="#14171B"/>
      <circle cx="500" cy="360" r="96" fill="#0B2B4A"/>
      <circle cx="458" cy="318" r="30" fill="#BFE3FF" opacity="0.75"/>
      <circle cx="500" cy="360" r="215" fill="none" stroke="${p.accent}" stroke-width="10" opacity="0.4"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 340 : 332}" y="250" width="336" height="200" rx="90" fill="${p.trim}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 354 : 346}" y="264" width="308" height="172" rx="78" fill="${p.body}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <circle cx="${skew ? 500 : 492}" cy="${skew ? 344 : 350}" r="62" fill="#14171B"/>
    <circle cx="${skew ? 500 : 492}" cy="${skew ? 344 : 350}" r="38" fill="#0B2B4A"/>
    <circle cx="${skew ? 484 : 476}" cy="${skew ? 328 : 334}" r="13" fill="#BFE3FF" opacity="0.8"/>
    <circle cx="${skew ? 610 : 602}" cy="${skew ? 340 : 346}" r="10" fill="${p.accent}"/>
    <path d="M400 452 Q500 520 600 452 L600 500 Q500 566 400 500 Z" fill="${p.trim}"/>
    <rect x="430" y="520" width="140" height="18" rx="9" fill="${p.body}"/>`;
};

const router = (p, view) => {
  const antenna = (x, lean) =>
    `<rect x="${x}" y="150" width="22" height="200" rx="11" fill="${p.trim}" transform="rotate(${lean} ${x + 11} 350)"/>`;
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="230" y="240" width="540" height="300" rx="60" fill="${p.trim}"/>
      <rect x="252" y="262" width="496" height="256" rx="46" fill="${p.body}"/>
      <g fill="${p.accent}"><circle cx="360" cy="390" r="18"/><circle cx="440" cy="390" r="18" opacity="0.6"/><circle cx="520" cy="390" r="18" opacity="0.4"/></g>
      <path d="M620 340 A70 70 0 0 1 620 440" fill="none" stroke="${p.accent}" stroke-width="14" stroke-linecap="round"/>
      <path d="M660 310 A110 110 0 0 1 660 470" fill="none" stroke="${p.accent}" stroke-width="14" stroke-linecap="round" opacity="0.6"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    ${antenna(300, -16)}${antenna(690, 16)}
    <rect x="${skew ? 318 : 310}" y="330" width="380" height="230" rx="46" fill="${p.trim}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <rect x="${skew ? 332 : 324}" y="344" width="352" height="202" rx="36" fill="${p.body}" transform="${skew ? 'skewY(-2)' : ''}"/>
    <g fill="${p.accent}">
      <circle cx="${skew ? 392 : 384}" cy="${skew ? 434 : 442}" r="12"/>
      <circle cx="${skew ? 444 : 436}" cy="${skew ? 433 : 442}" r="12" opacity="0.6"/>
      <circle cx="${skew ? 496 : 488}" cy="${skew ? 432 : 442}" r="12" opacity="0.35"/>
    </g>
    <path d="M${skew ? 600 : 592} ${skew ? 400 : 408} A56 56 0 0 1 ${skew ? 600 : 592} ${skew ? 480 : 488}" fill="none" stroke="${p.accent}" stroke-width="11" stroke-linecap="round"/>`;
};

const lightBar = (p, view) => {
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="150" y="300" width="700" height="70" rx="35" fill="${p.trim}"/>
      <rect x="168" y="316" width="664" height="38" rx="19" fill="#FFF3D6"/>
      <path d="M180 374 L820 374 L900 620 L100 620 Z" fill="#FFF3D6" opacity="0.45"/>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 168 : 160}" y="250" width="680" height="54" rx="27" fill="${p.trim}" transform="${skew ? 'skewY(-1)' : ''}"/>
    <rect x="${skew ? 182 : 174}" y="264" width="652" height="26" rx="13" fill="#FFF3D6"/>
    <path d="M190 306 L810 306 L880 520 L120 520 Z" fill="#FFF3D6" opacity="0.4"/>
    <path d="M440 220 L560 220 L590 250 L410 250 Z" fill="${p.body}"/>
    <circle cx="500" cy="196" r="34" fill="${p.trim}"/>
    <circle cx="500" cy="196" r="20" fill="${p.accent}" opacity="0.6"/>
    <rect x="${skew ? 300 : 292}" y="560" width="416" height="22" rx="11" fill="${p.body}"/>`;
};

const board = (p, view) => {
  const pins = Array.from({ length: 20 }, (_v, i) =>
    `<rect x="${300 + i * 20}" y="238" width="10" height="26" rx="3" fill="#D9A21B"/>`
  ).join('');
  const chips = `
    <rect x="430" y="330" width="150" height="150" rx="10" fill="${p.screen}"/>
    <rect x="452" y="352" width="106" height="106" rx="6" fill="${p.accent}" opacity="0.35"/>
    <rect x="620" y="350" width="90" height="70" rx="8" fill="${p.screen}" opacity="0.8"/>
    <rect x="330" y="360" width="70" height="110" rx="8" fill="${p.screen}" opacity="0.6"/>`;
  if (view === 'detail')
    return `${backdrop(p)}
      <rect x="180" y="180" width="640" height="400" rx="22" fill="${p.body}"/>
      <rect x="180" y="180" width="640" height="400" rx="22" fill="none" stroke="${p.screen}" stroke-opacity="0.2" stroke-width="3"/>
      <rect x="240" y="250" width="520" height="34" rx="6" fill="#D9A21B" opacity="0.85"/>
      ${chips}
      <g fill="${p.screen}" opacity="0.5">
        <rect x="200" y="500" width="120" height="46" rx="6"/>
        <rect x="340" y="500" width="120" height="46" rx="6"/>
        <rect x="480" y="500" width="90" height="46" rx="6"/>
      </g>`;
  const skew = view === 'angle';
  return `${backdrop(p)}
    <rect x="${skew ? 268 : 260}" y="220" width="480" height="320" rx="18" fill="${p.body}" stroke="${p.screen}" stroke-opacity="0.2" stroke-width="3" transform="${skew ? 'skewY(-2.5)' : ''}"/>
    <g transform="${skew ? 'skewY(-2.5)' : ''}">
      ${pins}
      ${chips}
      <g fill="${p.screen}" opacity="0.55">
        <rect x="280" y="480" width="86" height="34" rx="5"/>
        <rect x="380" y="480" width="86" height="34" rx="5"/>
        <rect x="480" y="480" width="64" height="34" rx="5"/>
      </g>
      <circle cx="700" cy="250" r="9" fill="#2ECC71"/>
    </g>`;
};

/** shape name → renderer. The keys are what the catalogue and URLs use. */
export const SHAPES = {
  'laptop': (p, v) => laptop(p, v),
  'laptop-gaming': (p, v) => laptop(p, v, { gaming: true }),
  'laptop-convertible': (p, v) => laptop(p, v, { convertible: true }),
  'phone': (p, v) => phone(p, v, { island: false }),
  'phone-island': (p, v) => phone(p, v, { island: true }),
  'phone-dual': (p, v) => phone(p, v, { island: true, dual: true }),
  'headphones': headphones,
  'earbuds': earbuds,
  'speaker': (p, v) => speaker(p, v),
  'speaker-brick': (p, v) => speaker(p, v, { brick: true }),
  'watch': (p, v) => watch(p, v, { round: false }),
  'watch-round': (p, v) => watch(p, v, { round: true }),
  'fitness-band': (p, v) => watch(p, v, { band: true }),
  'console': consoleVertical,
  'console-box': consoleBox,
  'handheld': handheld,
  'controller': controller,
  'mouse': mouse,
  'keyboard': (p, v) => keyboard(p, v),
  'keyboard-compact': (p, v) => keyboard(p, v, { compact: true }),
  'vr-headset': vrHeadset,
  'powerbank': powerbank,
  'charger': charger,
  'drive': drive,
  'monitor': monitor,
  'charge-pad': chargePad,
  'trackpad': trackpad,
  'microphone': microphone,
  'webcam': webcam,
  'router': router,
  'light-bar': lightBar,
  'board': board,
};

export const SHAPE_NAMES = Object.keys(SHAPES);
export const COLORWAY_NAMES = Object.keys(COLORWAYS);

/**
 * @param {{shape: string, colorway?: string, view?: string, label?: string}} spec
 * @returns {string|null} SVG document, or null when the shape/colorway/view is unknown.
 */
export function renderProductArt({ shape, colorway = 'graphite', view = 'front', label = '', style = 'render', draw: animate = false }) {
  const draw = SHAPES[shape];
  const palette = COLORWAYS[colorway];
  if (!draw || !palette || !VIEWS.includes(view)) return null;

  // Ids are namespaced per render: two of these inlined into the same page
  // would otherwise share `#bg` and the second would take the first's
  // gradients. Served as <img> each document is its own scope, but inlining
  // is a reasonable thing for someone to do later.
  const uid = `${shape}-${colorway}-${view}`.replace(/[^a-z0-9-]/gi, '');
  const body = draw(palette, view).replace(/url\(#([a-zA-Z]+)\)/g, (_m, id) => `url(#${id}-${uid})`);

  if (style === 'blueprint') return blueprint({ body, uid, label: label || shape, draw: animate });
  // 'cutout': the device alone on a transparent ground, for a storefront that
  // is not white. The backdrop and floor shadow are the first two elements.
  const art = style === 'cutout' ? `<g class="cutout">${body}</g>` : body;
  const cutoutCss = style === 'cutout'
    ? '<style>.cutout > rect:first-child, .cutout > ellipse:nth-child(2) { display: none; }</style>'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="${CANVAS.width}" height="${CANVAS.height}" role="img" aria-label="${esc(label || shape)}">
  <defs>
    <radialGradient id="bg-${uid}" cx="50%" cy="38%" r="78%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="${palette.bg}"/>
    </radialGradient>
    <linearGradient id="glass-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.09"/>
    </linearGradient>
    <linearGradient id="rgb-${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF5A1F"/>
      <stop offset="33%" stop-color="#FFD400"/>
      <stop offset="66%" stop-color="#2D2BF5"/>
      <stop offset="100%" stop-color="#00D4A0"/>
    </linearGradient>
    <clipPath id="scrclipF-${uid}"><rect x="240" y="135" width="520" height="261"/></clipPath>
    <clipPath id="scrclipA-${uid}"><path d="M272 158 L768 190 L776 396 L264 378 Z"/></clipPath>
    <clipPath id="phclipF-${uid}"><rect x="378" y="108" width="244" height="534" rx="34"/></clipPath>
    <clipPath id="phclipA-${uid}"><path d="M375 122 L630 152 L630 628 L375 598 Z"/></clipPath>
    <clipPath id="wclip-${uid}"><rect x="280" y="150" width="440" height="450" rx="60"/></clipPath>
    <clipPath id="hclip-${uid}"><rect x="330" y="230" width="500" height="300" rx="12"/></clipPath>
    <clipPath id="mclip-${uid}"><rect x="140" y="146" width="720" height="360" rx="8"/></clipPath>
  </defs>
  ${cutoutCss}${art}
</svg>`;
}

// ---------------------------------------------------------------- blueprint
//
// The same drawing, as a technical line drawing: every fill removed, every
// edge stroked in blueprint white on a transparent ground, with dash-dot
// centre lines and a registration frame. Nothing is redrawn by hand — a CSS
// rule inside the SVG overrides the shapes' fill/stroke attributes, so every
// shape (and every shape added later) gets a blueprint version for free.
//
// `draw` adds a pen-plotter animation: each edge is dashed to its full length
// and the dash offset runs to zero, so the lines appear as if being drawn.
// It plays inside an <img> too, since the animation lives in the document.
export const BLUEPRINT_INK = '#E8F0FF';

function blueprint({ body, uid, label, draw }) {
  const pen = draw
    ? `
    .bp-art * { stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: bp-draw 2.4s cubic-bezier(.6,.05,.3,1) forwards; }
    .bp-art > *:nth-child(3n+1) * , .bp-art > *:nth-child(3n+1) { animation-delay: .15s; }
    .bp-art > *:nth-child(3n+2) * , .bp-art > *:nth-child(3n+2) { animation-delay: .35s; }
    .bp-guides { opacity: 0; animation: bp-fade .8s ease 1.6s forwards; }
    @keyframes bp-draw { to { stroke-dashoffset: 0; } }
    @keyframes bp-fade { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .bp-art *, .bp-guides { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; } }`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="${CANVAS.width}" height="${CANVAS.height}" role="img" aria-label="${esc(label)} — technical drawing">
  <style>
    .bp-art, .bp-art * { fill: none !important; stroke: ${BLUEPRINT_INK} !important; stroke-width: 2.4px !important; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .bp-art > rect:first-child, .bp-art > ellipse:nth-child(2) { display: none; }
    .bp-guides line { stroke: ${BLUEPRINT_INK}; stroke-width: 1px; opacity: .45; stroke-dasharray: 22 6 3 6; }
    .bp-guides path { fill: none; stroke: ${BLUEPRINT_INK}; stroke-width: 1.5px; opacity: .6; }${pen}
  </style>
  <defs>
    <clipPath id="scrclipF-${uid}"><rect x="240" y="135" width="520" height="261"/></clipPath>
    <clipPath id="scrclipA-${uid}"><path d="M272 158 L768 190 L776 396 L264 378 Z"/></clipPath>
    <clipPath id="phclipF-${uid}"><rect x="378" y="108" width="244" height="534" rx="34"/></clipPath>
    <clipPath id="phclipA-${uid}"><path d="M375 122 L630 152 L630 628 L375 598 Z"/></clipPath>
    <clipPath id="wclip-${uid}"><rect x="280" y="150" width="440" height="450" rx="60"/></clipPath>
    <clipPath id="hclip-${uid}"><rect x="330" y="230" width="500" height="300" rx="12"/></clipPath>
    <clipPath id="mclip-${uid}"><rect x="140" y="146" width="720" height="360" rx="8"/></clipPath>
  </defs>
  <g class="bp-guides">
    <line x1="500" y1="40" x2="500" y2="710"/>
    <line x1="60" y1="375" x2="940" y2="375"/>
    <path d="M40 70 V40 H70 M930 40 H960 V70 M960 680 V710 H930 M70 710 H40 V680"/>
  </g>
  <g class="bp-art">${body}</g>
</svg>`;
}

/**
 * The catalogue stores relative paths; this builds them so the shape of the
 * URL lives in exactly one place.
 */
export function artPath(shape, colorway, view = 'front') {
  return `/media/products/${shape}/${colorway}/${view}.svg`;
}
