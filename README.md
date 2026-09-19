# Asset Register

Asset control and barcode labelling for the group's companies (AICC, AKB, AKR and any
others you add). An asset controller enters each item, the system gives it an asset code
automatically, and the sticker prints as a **50 x 25 mm** barcode label. The owner signs in
and sees, at a glance, how many assets the group holds and where they are.

---

## 1. What it does

- **Admin (owner) login** with full control, plus as many **asset controller** logins as you need.
- **Automatic asset code**: `COMPANY-CATEGORY-NUMBER`, e.g. `AICC-LAP-0007`, `AKB-EXC-0001`.
  The running number is kept per company and category, so codes never repeat.
- **Full entry form** - name of asset, category, unique no, asset code, brand, model,
  serial no, quantity, date of purchase, cost, vendor, invoice, warranty, handover to,
  handover date, currently used by, department, location, condition, status and remarks.
- **83 ready-made categories** covering office/IT, furniture, school items, construction
  plant and tools, vehicles and electrical. Add your own at any time.
- **Barcode sticker** (Code 128) sized exactly 50 x 25 mm, printed one per page for a
  label roll printer. Print one, print a batch, or print every sticker not yet printed.
- **Scan / Find** page: scan a sticker with any USB barcode reader and the asset opens,
  with a "Mark verified" button for physical stock checks.
- **Dashboard and reports**: totals per company, per category group, per status, purchase
  value, warranty expiring in 60 days, recent entries, and an activity log of who did what.
- **CSV export** of any filtered view, ready for Excel.
- Works on a PC, tablet or phone browser.

---

## 2. Getting started

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

On the very first run an administrator login is created and printed in the terminal:

```
username : admin
password : admin123
```

You are asked to set your own password as soon as you sign in. To choose the first
password yourself instead, start it once like this:

```bash
ADMIN_USERNAME=kasim ADMIN_PASSWORD='your-own-password' npm start
```

### Sample data (optional)

```bash
npm run seed:demo
```

Loads 16 example assets across the three companies so you can see the screens filled in.

---

## 3. Day-to-day use

### Adding an asset (asset controller)

1. **Add Asset** in the left menu.
2. Pick the **category** and which company it **belongs to** - the **asset code** fills in
   by itself.
3. Fill the rest of the form and press **Save asset**. Leave *"Print the sticker straight
   after saving"* ticked and the label goes to the printer immediately.
4. **Save & add another** keeps you on the form for the next item.

### Printing stickers

**Print Labels** in the left menu:

- Sticker size is set to 50 x 25 mm. Change it there if your roll is a different size.
- Choose what appears on the sticker: company code, category code, asset name, purchase date.
- **Print one test sticker** first and check it against the roll.
- **Batch print** prints every label for a company or category - tick *"Only assets whose
  sticker is not printed yet"* to catch up on new entries.

In the printer dialog set **Scale: 100%** (never "Fit to page") and **Margins: none**,
otherwise the barcode width changes and scanners may struggle.

### Checking assets on site

Open **Scan / Find**, scan the sticker with a USB barcode reader (it types the code and
presses Enter by itself), and the record appears. Press **Mark verified** to stamp the
date of the physical check.

---

## 4. Users and roles

Create logins under **Users** (admin only). Every new user must change their password at
first sign-in.

| Role | Can do |
| --- | --- |
| **Admin** | Everything: users, companies, categories, assets, delete, reports |
| **Asset Controller** | Add and edit assets, print stickers, verify, export |
| **Owner** | Read only - dashboard, asset register, reports, activity log |

---

## 5. Companies and categories

- **Companies** - AICC, AKB, AKR and OTHER are ready. Add more at any time; the company
  code becomes the first part of the asset code.
- **Categories** - the code (e.g. `LAP`, `EXC`, `SDK`) becomes the middle part of the asset
  code. Once an asset carries a code, that code can no longer be renamed, because it is
  already printed on a sticker. Switch a category off instead, or add a new one.

---

## 6. Keeping the data safe

Everything lives in one file: **`data/assets.db`**.

- To back up, copy that file (together with `data/assets.db-wal` if present) while the app
  is stopped, or simply copy the whole `data` folder daily to a pen drive or shared folder.
- To move the system to another computer, copy the project folder including `data`, run
  `npm install`, then `npm start`.

---

## 7. Running it for the whole office

Start it on one PC or a small server and let the others reach it over the office network:

```bash
PORT=3000 npm start
```

Then the others open `http://<that-computer's-IP>:3000` in their browser.

Useful settings:

| Variable | Meaning | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `3000` |
| `HOST` | Address to bind | `0.0.0.0` |
| `DATA_DIR` | Where the database is kept | `./data` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | First admin login, first run only | `admin` / `admin123` |
| `JWT_SECRET` | Sign-in token secret | generated into `data/.jwt-secret` |
| `TOKEN_TTL` | How long a sign-in lasts | `12h` |

If it will be reachable from outside the office, put it behind HTTPS (for example nginx or
Caddy in front of it) so passwords are not sent in the clear.

---

## 8. How it is built

| Part | Detail |
| --- | --- |
| Server | Node.js + Express 5 |
| Database | SQLite (`better-sqlite3`), single file, no separate server |
| Sign-in | JWT tokens, passwords hashed with bcrypt |
| Front end | Plain HTML, CSS and JavaScript - no build step, nothing to compile |
| Barcode | Code 128 drawn as SVG by `public/js/barcode.js` - no internet needed to print |

```
server.js            starts the web server
src/db.js            database schema, default companies and categories
src/auth.js          tokens, password hashing, role guards
src/codes.js         asset code and S.NO generation
src/routes/          auth, users, companies/categories, assets, reports
public/              the screens (index.html, css, js)
scripts/seed-demo.js sample data
data/assets.db       your data
```
