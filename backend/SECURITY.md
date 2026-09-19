# ElectrOnia — security and correctness fixes

What was wrong, what changed, and what you still have to do by hand.
Everything here is worth knowing by heart: these are the exact things a
backend interviewer probes in a project deep-dive.

---

## 🔴 Do these two things before anything else

Both of these credentials were committed in plain text inside `index.js`.
Anyone who has ever had a copy of this folder — or who sees the repository if
it goes public — has them. Changing the code does not un-leak them.

1. **Rotate the MongoDB Atlas password.**
   Atlas → Database Access → the `vyankateshc21` user → Edit → Edit Password.
   Better: create a brand-new database user, give it access only to the
   `electronia` database, and delete the old one. Then put the new connection
   string in `backend/.env`.

2. **Revoke the Gmail App Password.**
   Google Account → Security → 2-Step Verification → App passwords → remove
   the one used by `project13v@gmail.com`. Generate a new one and put it in
   `backend/.env` as `SMTP_PASS`.

Also confirm `backend/.env` is ignored by git before your next commit:

```bash
git check-ignore -v backend/.env    # should print a .gitignore line
git rm --cached backend/.env        # if it was ever committed
```

If the repository history already contains the old `index.js`, the secrets are
still in the history even after you edit the file. Rotating them, as above, is
what actually fixes it.

---

## What changed

### 1. Anyone could forge a vendor or admin token

Every protected route did `jwt.verify(token, process.env.JWT_SECRET || "defaultsecret")`.
`.env` did not define `JWT_SECRET`, so the fallback was live: the signing key
for the whole application was the literal string `defaultsecret`. Anyone could
sign their own token and be any user.

**Now:** `config/env.js` validates configuration at boot and the process exits
if `JWT_SECRET` is missing or shorter than 32 characters. There is no fallback.

### 2. A customer token worked on the vendor routes

Customer and vendor tokens had identical shapes — `{ id, email, name }` — so
`POST /api/products` and `DELETE /api/products/:id`, both labelled "vendor
protected", accepted any valid token, including a customer's.

**Now:** every token carries a `role` claim (`customer` / `vendor` / `admin`),
and `middleware/auth.js` exposes `requireAuth` and `requireRole(...)`. Tokens
issued before this change have no role and are rejected with
`code: "LEGACY_TOKEN"`, which asks the user to log in again.

### 3. Any vendor could delete any other vendor's products

`DELETE /api/products/:id` verified a token and then called
`findByIdAndDelete` with no ownership check. `VendorDashboard` also fetched
`/api/products` — the whole catalogue — so the delete button next to another
company's product worked.

**Now:** delete and update run through
`findOneAndUpdate({ _id, companyId: req.user.id })`. The ownership check is the
filter itself, so another vendor's product simply does not match and returns
404. `GET /api/products/mine` was added and the dashboard uses it.

### 4. Customer personal data was public

`GET /api/orders/vendor-orders` had **no authentication of any kind** and
returned every order in the database: names, email addresses, phone numbers
and full shipping addresses.

**Now:** it requires a vendor token, returns only orders containing that
vendor's products, and filters each order's items down to that vendor's lines.

### 5. Anyone could change any order's status

`PATCH /api/orders/:id/status` had no authentication and did not validate the
status value.

**Now:** vendor or admin only; a vendor may only touch orders containing their
own products; the status must be one of the enum values; and every change
appends to `statusHistory` so tracking shows a real timeline.

### 6. A ₹2,499 laptop could be bought for ₹1

`POST /api/orders` took `totalAmount` straight from the request body and saved
it. Item prices came from the body too. Editing one number in DevTools was
enough.

**Now:** the server looks every product up by id and computes the total from
the **current database prices**. `totalAmount` sent by the client is ignored.
Titles, prices and images are snapshotted onto the order from the database.

### 7. Stock was never checked or decremented

You could order 500 units of a product with 8 in stock, repeatedly, and the
stock number never moved.

**Now:** each line is reserved with a conditional atomic update:

```js
Product.findOneAndUpdate(
  { _id: line.productId, stock: { $gte: line.quantity } },
  { $inc: { stock: -line.quantity } },
  { new: true }
)
```

That single document update is atomic, so two simultaneous orders cannot both
take the last unit — the second one matches no document and gets a 409. If a
later line in the same order fails, the earlier decrements are compensated
(rolled back) before returning the error.

> **Know this for interviews.** The follow-up question is always: "what if the
> process dies between the decrement and the order insert?" The honest answer
> is that the compensating rollback would not run, so the stock stays reserved
> — and the fix is a multi-document transaction
> (`session.withTransaction`), which Atlas supports because it is a replica
> set. `reserveStock()` is written as a separate function so it can be swapped
> to a transaction without touching the route.

### 8. Verification codes were stored in plain text and never really consumed

The OTP was kept in a plain object as the literal code, generated with
`Math.random()`, with no attempt limit. Your resume says *hashed, expiring
one-time codes* — the expiring part was true, the hashed part was not.

**Now:** `lib/otpStore.js` stores only a bcrypt hash of the code, generates it
with `crypto.randomInt`, allows 5 attempts, marks it verified once, and
deletes it the moment it is spent on a signup. The resume line is now true.

Also added: `express-rate-limit` on the OTP routes (5 per 15 min) and the
login routes (10 per 15 min), and identical error messages for "wrong
password" and "no such user" so the API cannot be used to enumerate which
emails are registered.

### 9. The catalogue had no pagination and no indexes

`GET /api/products` returned **every** product, and search used
`$regex` across three fields — which no index can serve, so every keystroke
scanned the whole collection.

**Now:** the route is paginated (`page`, `limit`, default 12, max 60) and
returns `{ items, page, limit, total, totalPages }`. `product.model.js`
declares:

- `{ category: 1, brand: 1, price: 1 }` — one index serving the common filter
  *and* the price sort
- `{ featured: 1, createdAt: -1 }` — the homepage query
- a weighted text index on title / brand / description, replacing the regex

`Product.syncIndexes()` runs on boot so they are created automatically.

> **This is where your resume numbers come from.** Seed 10,000 products, then:
>
> ```js
> db.products.find({ category: 'Laptops' }).sort({ price: 1 }).explain('executionStats')
> ```
>
> Record `executionTimeMillis` and `totalDocsExamined` before and after the
> index, and put both in the README.

### 10. The API host was hardcoded in 13 files

`http://localhost:3000` appeared in thirteen frontend files, so deploying
meant a find-and-replace.

**Now:** `src/lib/api.js` exports `API_BASE` from `import.meta.env.VITE_API_URL`,
defaulting to localhost. Set `VITE_API_URL` in Vercel and the build points at
your deployed API.

---

## Setup after pulling these changes

```bash
cd backend
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste into JWT_SECRET
# paste your NEW Atlas connection string into MONGO_URI
npm install          # adds express-rate-limit
npm run dev
```

Then, in the frontend:

```bash
cd forentend
echo "VITE_API_URL=http://localhost:3000" > .env
npm run dev
```

**Everyone must log in again.** Old tokens have no `role` claim and are
rejected on purpose. Clear `token` and `vendorToken` from localStorage if a
stale session gets stuck.

---

## Still open

Not fixed here, roughly in priority order:

1. **The admin app does not compile.** `admin/admin1/src/App.jsx` imports
   `./page/adminsignup`, and `src/page/` is empty. There are also no admin
   routes on the API and no admin login. Either build it or delete the folder —
   a broken third app helps nothing.
2. **The cart lives only in `localStorage`**, and prices travel with it. The
   order route no longer trusts those prices, so this is not a security hole
   any more, but a server-side cart is what makes the "cart management" claim
   on your resume real.
3. **No tests.** Four are worth writing first: place an order and assert the
   total comes from the database; order more than the stock and assert 409;
   delete another vendor's product and assert 404; call `vendor-orders` with a
   customer token and assert 403. That last one is the test that proves you
   understand authorization.
4. **Tokens in `localStorage`** are readable by any XSS. An httpOnly refresh
   cookie with a short-lived access token is the upgrade.
5. **`user.model.js` registers the model as `Cutomers`** (typo), so the
   collection is named `cutomers`. Renaming it means migrating the existing
   documents, which is why it was left alone — but fix it before there is real
   data.
6. **`company.model.js` spells `mongoose` as `mongooose`.** Harmless, since
   it's just a local variable name, but it's the kind of thing a reviewer sees
   immediately.
