import crypto from 'crypto';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { cartService } from './cart.service.js';

export const GUEST_COOKIE = 'cartToken';

/**
 * Who owns this cart: the signed-in user, or an anonymous browser token.
 *
 * The guest token is issued server-side as a random value in an httpOnly
 * cookie. A predictable id would make every guest cart enumerable.
 */
export function resolveOwner(req, res) {
  if (req.user?.id) return { userId: req.user.id };

  let token = req.cookies?.[GUEST_COOKIE];

  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    res.cookie(GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  return { guestToken: token };
}

export const cartController = {
  get: asyncHandler(async (req, res) => {
    res.json(await cartService.get(resolveOwner(req, res)));
  }),

  addItem: asyncHandler(async (req, res) => {
    res.status(201).json(await cartService.addItem(resolveOwner(req, res), req.body));
  }),

  updateItem: asyncHandler(async (req, res) => {
    res.json(
      await cartService.updateQuantity(
        resolveOwner(req, res),
        req.params.productId,
        req.body.quantity
      )
    );
  }),

  removeItem: asyncHandler(async (req, res) => {
    res.json(await cartService.removeItem(resolveOwner(req, res), req.params.productId));
  }),

  toggleSaveForLater: asyncHandler(async (req, res) => {
    res.json(await cartService.toggleSaveForLater(resolveOwner(req, res), req.params.productId));
  }),

  clear: asyncHandler(async (req, res) => {
    res.json(await cartService.clear(resolveOwner(req, res)));
  }),

  merge: asyncHandler(async (req, res) => {
    // The guest token lives in an httpOnly cookie, which is the point — page
    // scripts cannot read it, so the client cannot send it in the body. The
    // browser does send the cookie, so read it here and let the body override
    // only for tests and server-to-server callers.
    const guestToken = req.body?.guestToken ?? req.cookies?.[GUEST_COOKIE] ?? null;

    if (!guestToken) {
      // Nothing to fold in. Returning the user's own cart keeps the caller's
      // code identical whether or not they shopped as a guest first.
      res.json(await cartService.get({ userId: req.user.id }));
      return;
    }

    // Only ever folds a guest cart into the authenticated caller's own cart —
    // the endpoint cannot name another user.
    const merged = await cartService.mergeGuestCart(req.user.id, guestToken);

    // The guest cart is gone; leaving its cookie behind would let a later
    // sign-out pick up a cart that no longer exists.
    res.clearCookie(GUEST_COOKIE, { path: '/' });

    res.json(merged);
  }),

  applyCoupon: asyncHandler(async (req, res) => {
    res.json(await cartService.applyCoupon(resolveOwner(req, res), req.body.code));
  }),

  removeCoupon: asyncHandler(async (req, res) => {
    res.json(await cartService.removeCoupon(resolveOwner(req, res)));
  }),
};
