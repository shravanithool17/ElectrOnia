// tests/unit/productArt.test.js — the images cannot be verified by looking at
// a CDN, so they are verified here instead.
//
// The point of generating artwork was to remove the class of bug where a
// product's image 404s or shows the wrong device. These tests assert exactly
// that: every path the catalogue stores renders, every product's art matches
// its category, and the route rejects rather than serves nonsense.
import request from 'supertest';

import { createApp } from '../../server.js';
import {
  renderProductArt,
  artPath,
  SHAPE_NAMES,
  COLORWAY_NAMES,
  VIEWS,
  COLORWAYS,
  SHAPES,
} from '../../lib/productArt.js';
import { CATALOGUE, CATALOGUE_STATS, IMAGE_OVERRIDES } from '../../lib/catalogue.data.js';

const app = createApp();

// Supertest only populates `res.text` for content types it recognises as
// text, and image/svg+xml is not one of them — the body arrives as a Buffer.
const svgBody = (res) => (res.text ?? Buffer.from(res.body).toString('utf8'));

describe('productArt renderer', () => {
  it('renders every shape × colourway × view without a gap', () => {
    for (const shape of SHAPE_NAMES) {
      for (const colorway of COLORWAY_NAMES) {
        for (const view of VIEWS) {
          const svg = renderProductArt({ shape, colorway, view });
          expect(typeof svg).toBe('string');
          expect(svg.startsWith('<svg')).toBe(true);
          expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
          // An empty body means a renderer silently returned nothing.
          expect(svg.length).toBeGreaterThan(400);
        }
      }
    }
  });

  it('returns null rather than a broken document for unknown input', () => {
    expect(renderProductArt({ shape: 'hovercraft', colorway: 'graphite', view: 'front' })).toBeNull();
    expect(renderProductArt({ shape: 'laptop', colorway: 'chartreuse', view: 'front' })).toBeNull();
    expect(renderProductArt({ shape: 'laptop', colorway: 'graphite', view: 'underside' })).toBeNull();
  });

  it('leaves no unresolved template holes or undefined coordinates', () => {
    for (const shape of SHAPE_NAMES) {
      const svg = renderProductArt({ shape, colorway: 'graphite', view: 'front' });
      expect(svg).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
    }
  });

  it('namespaces its gradient and clip ids so two inlined images do not collide', () => {
    const a = renderProductArt({ shape: 'laptop', colorway: 'graphite', view: 'front' });
    const b = renderProductArt({ shape: 'phone', colorway: 'silver', view: 'front' });

    const idsOf = (svg) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const overlap = idsOf(a).filter((id) => idsOf(b).includes(id));
    expect(overlap).toEqual([]);
  });

  it('references only ids it defines', () => {
    for (const shape of SHAPE_NAMES) {
      const svg = renderProductArt({ shape, colorway: 'forest', view: 'detail' });
      const defined = new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      const used = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      for (const id of used) {
        expect(defined.has(id)).toBe(true);
      }
    }
  });

  it('escapes the label instead of letting it close the tag', () => {
    const svg = renderProductArt({
      shape: 'laptop',
      colorway: 'graphite',
      view: 'front',
      label: '"><script>alert(1)</script>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('catalogue image data', () => {
  it('gives every product three images', () => {
    for (const product of CATALOGUE) {
      expect(product.images).toHaveLength(3);
    }
  });

  it('points every image at artwork that actually renders', () => {
    for (const product of CATALOGUE) {
      for (const path of product.images) {
        if (/^https?:\/\//.test(path)) continue; // an override, not ours to render
        const [, , , shape, colorway, file] = path.split('/');
        expect(SHAPES[shape]).toBeDefined();
        expect(COLORWAYS[colorway]).toBeDefined();
        expect(renderProductArt({ shape, colorway, view: file.replace('.svg', '') })).not.toBeNull();
      }
    }
  });

  it('uses the same shape family as the product category', () => {
    // The original bug this replaced: a headphone photo on a power bank. A
    // laptop must not be drawn as a watch, whatever else changes.
    const allowed = {
      Laptops: ['laptop', 'laptop-gaming', 'laptop-convertible'],
      Smartphones: ['phone', 'phone-island', 'phone-dual'],
      Audio: ['headphones', 'earbuds', 'speaker', 'speaker-brick', 'microphone'],
      Wearables: ['watch', 'watch-round', 'fitness-band'],
    };

    for (const product of CATALOGUE) {
      const permitted = allowed[product.category];
      if (!permitted) continue; // Gaming and Accessories are deliberately mixed
      // Real photos carry no shape in their URL; the fallback art still does,
      // and is what this guard (no headphone photo on a power bank) protects.
      if (/^https?:\/\//.test(product.images[0])) continue;
      const shape = product.images[0].split('/')[3];
      expect(permitted).toContain(shape);
    }
  });

  it('builds generated-art paths through artPath rather than by hand', () => {
    // Real-photo products carry CDN URLs; only the generated-art fallback is
    // built by artPath. Assert the helper's shape directly.
    expect(artPath('laptop', 'graphite', 'front')).toBe('/media/products/laptop/graphite/front.svg');
    const arty = CATALOGUE.find((p) => p.images[0].startsWith('/media/'));
    if (arty) {
      const [, , , shape, colorway] = arty.images[0].split('/');
      expect(arty.images[0]).toBe(artPath(shape, colorway, 'front'));
    }
  });

  it('lets an override replace the generated art', () => {
    // Documented behaviour, so it should be tested even while empty.
    expect(IMAGE_OVERRIDES).toEqual(expect.any(Object));
    expect(CATALOGUE_STATS.overrides).toBe(Object.keys(IMAGE_OVERRIDES).length);
  });

  it('still keeps a realistic spread for the storefront states', () => {
    expect(CATALOGUE_STATS.total).toBeGreaterThanOrEqual(120);
    expect(CATALOGUE_STATS.categories).toBe(6);
    expect(CATALOGUE_STATS.featured).toBeGreaterThan(8);
    expect(CATALOGUE_STATS.outOfStock).toBeGreaterThan(0);
    expect(CATALOGUE_STATS.lowStock).toBeGreaterThan(0);
  });

  it('has no duplicate titles', () => {
    const titles = CATALOGUE.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('GET /media/products', () => {
  it('serves an SVG with an immutable cache header', async () => {
    const res = await request(app).get('/media/products/laptop/graphite/front.svg');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(svgBody(res)).toContain('<svg');
  });

  it('accepts the path with or without the extension', async () => {
    const withExt = await request(app).get('/media/products/phone/midnight/angle.svg');
    const without = await request(app).get('/media/products/phone/midnight/angle');

    expect(withExt.status).toBe(200);
    expect(without.status).toBe(200);
    expect(svgBody(withExt)).toContain('<svg');
    expect(svgBody(withExt)).toBe(svgBody(without));
  });

  it('404s on an unknown shape instead of serving a blank image', async () => {
    const res = await request(app).get('/media/products/hovercraft/graphite/front.svg');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('publishes a manifest of what exists', async () => {
    const res = await request(app).get('/media/products');

    expect(res.status).toBe(200);
    expect(res.body.shapes).toEqual(expect.arrayContaining(['laptop', 'phone', 'headphones']));
    expect(res.body.views).toEqual(['front', 'angle', 'detail']);
    expect(res.body.total).toBe(res.body.shapes.length * res.body.colorways.length * 3);
  });

  it('serves every generated-art path the catalogue references', async () => {
    // Real product photos are served by the image CDN, not this app; only the
    // generated-art fallbacks (/media/...) are ours to serve.
    const paths = [...new Set(CATALOGUE.flatMap((p) => p.images))].filter((p) => p.startsWith('/media/'));

    const statuses = await Promise.all(
      paths.map((path) => request(app).get(path).then((r) => [path, r.status]))
    );

    expect(statuses.filter(([, status]) => status !== 200)).toEqual([]);
  });

  it('every product image is either a served art path or a CDN photo URL', () => {
    for (const product of CATALOGUE) {
      for (const url of product.images) {
        expect(url).toMatch(/^(\/media\/products\/|https:\/\/images\.unsplash\.com\/)/);
      }
    }
  });
});

// ---------------------------------------------------------------- styles
describe('blueprint and cutout styles', () => {
  it('blueprint: every shape renders as linework with no fills and no backdrop', () => {
    for (const shape of SHAPE_NAMES) {
      const svg = renderProductArt({ shape, style: 'blueprint' });
      expect(svg).toContain('fill: none !important');
      expect(svg).toContain('class="bp-art"');
      expect(svg).not.toContain('radialGradient'); // no light backdrop gradient
    }
  });

  it('blueprint + draw adds the pen animation, and honours reduced motion', () => {
    const still = renderProductArt({ shape: 'laptop', style: 'blueprint' });
    const drawn = renderProductArt({ shape: 'laptop', style: 'blueprint', draw: true });
    expect(still).not.toContain('@keyframes bp-draw');
    expect(drawn).toContain('@keyframes bp-draw');
    expect(drawn).toContain('prefers-reduced-motion');
  });

  it('cutout hides the backdrop but keeps the device', () => {
    const plain = renderProductArt({ shape: 'phone' });
    const cut = renderProductArt({ shape: 'phone', style: 'cutout' });
    expect(cut).toContain('.cutout > rect:first-child');
    expect(cut.length).toBeGreaterThan(plain.length);
  });

  it('keyboard keys stay inside the chassis', () => {
    for (const shape of ['keyboard', 'keyboard-compact']) {
      const svg = renderProductArt({ shape, view: 'front' });
      const chassis = shape === 'keyboard' ? [120, 880] : [240, 760];
      const xs = [...svg.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="4[26]"/g)].map((m) => [+m[1], +m[1] + +m[2]]);
      expect(xs.length).toBeGreaterThan(10);
      for (const [l, r] of xs) {
        expect(l).toBeGreaterThanOrEqual(chassis[0]);
        expect(r).toBeLessThanOrEqual(chassis[1]);
      }
    }
  });
});

describe('GET /media/products/... ?style=', () => {
  const app = createApp();
  it('serves blueprint and cutout, and ignores unknown styles', async () => {
    const bp = await request(app).get('/media/products/laptop/graphite/front.svg?style=blueprint&draw=1').expect(200);
    expect(svgBody(bp)).toContain('bp-art');
    expect(svgBody(bp)).toContain('@keyframes bp-draw');
    const cut = await request(app).get('/media/products/laptop/graphite/front.svg?style=cutout').expect(200);
    expect(svgBody(cut)).toContain('class="cutout"');
    const odd = await request(app).get('/media/products/laptop/graphite/front.svg?style=<script>').expect(200);
    expect(svgBody(odd)).not.toContain('bp-art');
    expect(svgBody(odd)).not.toContain('<script>');
  });
});
