// modules/media/media.routes.js — generated product imagery.
//
// GET /media/products/:shape/:colorway/:view.svg
//
// The response is a pure function of the path, so it is marked immutable and
// cached for a year. There are no files on disk and no CDN dependency: the
// only way this 404s is an unknown shape, which is a data bug the manifest
// endpoint below makes easy to spot.
//
// GET /media/products  lists every shape, colourway and view — useful when
// adding catalogue rows, and it doubles as a contract test target.
import { Router } from 'express';

import {
  renderProductArt,
  SHAPE_NAMES,
  COLORWAY_NAMES,
  VIEWS,
  CANVAS,
} from '../../lib/productArt.js';
import { NotFoundError } from '../../lib/errors.js';
import { asyncHandler } from '../../lib/asyncHandler.js';

const ONE_YEAR = 60 * 60 * 24 * 365;

export const mediaRoutes = Router();

mediaRoutes.get(
  '/media/products',
  asyncHandler(async (req, res) => {
    res.json({
      canvas: CANVAS,
      shapes: SHAPE_NAMES,
      colorways: COLORWAY_NAMES,
      views: VIEWS,
      total: SHAPE_NAMES.length * COLORWAY_NAMES.length * VIEWS.length,
      example: `/media/products/${SHAPE_NAMES[0]}/${COLORWAY_NAMES[0]}/front.svg`,
    });
  })
);

mediaRoutes.get(
  // Express 5's path parser treats a param as everything up to the next
  // slash, so `:view.svg` would capture "front.svg". The extension is
  // stripped here instead of in the pattern.
  '/media/products/:shape/:colorway/:view',
  asyncHandler(async (req, res) => {
    const { shape, colorway } = req.params;
    const view = req.params.view.replace(/\.svg$/i, '');

    const svg = renderProductArt({
      shape,
      colorway,
      view,
      label: `${shape.replace(/-/g, ' ')} in ${colorway}`,
      // ?style=blueprint → line drawing for the storefront's exploded view;
      // ?style=cutout → the device on a transparent ground;
      // &draw=1 animates it being drawn. Anything else is the normal render.
      style: ['blueprint', 'cutout'].includes(req.query.style) ? req.query.style : 'render',
      draw: req.query.draw === '1',
    });

    if (!svg) {
      throw new NotFoundError(
        `No artwork for ${shape}/${colorway}/${view}. See GET /media/products for what exists.`
      );
    }

    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(svg);
  })
);
