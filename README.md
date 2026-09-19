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
- **99 ready-made categories** covering office/IT, office furniture and fixtures, school
  items, construction plant and tools, vehicles and electrical. Add your own at any time.
- **Barcode sticker** (Code 128) sized exactly 50 x 25 mm, printed one per page for a
  label roll printer, carrying the asset code and the serial number. Print one, print a
  batch, or print every sticker not yet printed.
- **Scan / Find** page: scan a sticker with any USB barcode reader - or just type the
  **serial number**, the unique number or the asset code - and the asset's details open,
  with a "Mark verified" button for physical stock checks.
- **Dashboard and reports**: totals per company, per category group, per status, purchase
  value, warranty expiring in 60 days, recent entries, and an activity log of who did what.
- **CSV export** of any filtered view, ready for Excel.
- **Installs as an app** on Android, iPhone, Windows and Mac - own icon, own window, and
  the screens still open when the network drops (section 9). On a phone the register shows
  as cards instead of a wide table.

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

Open **Scan / Find** and either scan the sticker with a USB barcode reader (it types the
code and presses Enter by itself) or type what you can read on the asset - the **serial
number**, the unique number you gave it, or the asset code. The record appears with who
holds it, where it is and its status. Press **Mark verified** to stamp the date of the
physical check.

Serial numbers are not forced to be unique, so if the same one sits on several assets they
are all listed and you pick the one in your hand.

---

## 4. Users and roles

Create logins under **Users** (admin only). Every new user must change their password at
first sign-in.

| Role | Can do |
| --- | --- |
| **Admin** | Everything: users, companies, categories, assets, delete, reports |
| **Asset Controller** | Add and edit assets, print stickers, verify, export |
| **Owner** | Read only - dashboard, asset register, reports, activity log |

Every password box has an eye button - press it to check what you typed before signing in
or saving.

### If a password is forgotten

Run this on the computer that holds the database:

```bash
npm run reset-password -- admin
```

It sets a fresh password, prints it on screen, and asks that user to choose their own at
their next sign-in. Other forms:

```bash
npm run reset-password -- --list                 # show the logins
npm run reset-password -- kasim.ctrl 'NewPass12' # set one yourself
npm run reset-password -- kasim.ctrl --enable    # also switch a disabled login back on
```

Leaving the password out is safer, because one you type on the command line is kept in
your shell history.

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

Take a backup with one command - it works even while people are using the register, and
always produces a complete, openable copy:

```bash
npm run backup                          # into ./backups
npm run backup -- D:\AssetBackups       # into a folder you choose
npm run backup -- /mnt/usb --keep 30    # and keep only the newest 30 copies
```

Point it at a pen drive, a shared folder or a synced folder (OneDrive, Google Drive) and it
is off the machine as well. To run it every night without thinking about it:

- **Windows** - Task Scheduler, daily, action `npm` with arguments `run backup -- D:\AssetBackups`,
  started in the project folder.
- **Linux** - `crontab -e`, then
  `0 21 * * * cd /opt/asset-register && /usr/bin/npm run backup -- /mnt/backup`

To restore, stop the register, copy the backup over `data/assets.db` (delete any
`assets.db-wal` and `assets.db-shm` beside it), and start it again.

To move the system to another computer, copy the project folder including `data`, run
`npm ci --omit=dev`, then `npm start`.

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

## 8. Putting it on a server for good

Three ways, pick the one that suits you. In every case the database is the `data` folder -
back it up.

### a) Docker (simplest on a Linux server or NAS)

```bash
docker compose up -d --build     # first time
docker compose logs -f           # watch it start, see the first admin password
docker compose pull && docker compose up -d --build   # after an update
```

It listens on port 3000 and keeps the database in `./data`. To choose the admin login
yourself, uncomment `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `docker-compose.yml` **before**
the very first start (they are read only when the database is created).

### b) Straight on a Linux machine, started again after a reboot

```bash
sudo useradd -r -m -d /opt/asset-register assetreg
sudo cp -r . /opt/asset-register && cd /opt/asset-register
sudo -u assetreg npm ci --omit=dev
sudo cp deploy/asset-register.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now asset-register
sudo journalctl -u asset-register -n 30      # the first admin password is in here
```

### c) On an office Windows PC

Install [Node.js](https://nodejs.org) (the LTS download), copy the project folder onto the
PC, then **double-click `start-windows.bat`**. It installs what it needs the first time and
starts the register; leave that window open while people are using it.

To have it start by itself after a reboot, press `Win+R`, type `shell:startup`, and put a
shortcut to `start-windows.bat` in the folder that opens. For a proper background service
that runs with nobody logged in, use [NSSM](https://nssm.cc) pointing at `node server.js`
in the project folder.

When the register starts it prints the address the other computers should use, e.g.
`http://192.168.1.25:3000`. Give that to the asset controllers; nothing needs installing on
their machines, only a browser. If they cannot reach it, allow Node.js through the Windows
firewall on the private network, and give that PC a fixed IP address so the link keeps
working.

### d) Railway (or another platform that builds from the repo)

The repo carries a `Dockerfile` and a `railway.json`, so Railway builds and starts it with
no extra setup. Two settings matter, and the first one is not optional:

1. **Attach a volume mounted at `/data`.** Railway service → *Settings* → *Volumes* → new
   volume, mount path `/data`. The whole register is one file inside that folder. Without a
   volume every deploy starts from an empty register and the previous assets are gone.
2. **Set the admin login before the first start** - service → *Variables* → **two separate
   variables**, each holding only its value:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_USERNAME` | `kasim` |
   | `ADMIN_PASSWORD` | your own password, no quotes |

   Do not paste a whole command line into one of them. They are only read when the database
   is first created; after that, change passwords inside the app or with
   `npm run reset-password`. Without them the first password is printed in the deploy logs,
   where anyone with access to the project can read it.

`PORT` is provided by the platform and picked up on its own. The platform serves the site
over https, so **skip `npm run make-cert` there** - installing the app on phones works
straight away (section 9).

Anything on the public internet is reachable by anyone who has the link: the register asks
for a password and slows down repeated wrong attempts, but give the admin account a strong
password and create a separate login per person.

For backups on a hosted setup, run `npm run backup -- /data/backups` from the platform's
console, and keep a CSV export (section 1) off the platform as well.

### Reaching it from outside the office

Only expose it with HTTPS in front, otherwise passwords travel in the clear. A ready nginx
site file is in `deploy/nginx-asset-register.conf` - change the domain, get a certificate
with `certbot --nginx`, and the register stays on `127.0.0.1:3000` behind it.

---

## 9. Using it as an app on phones and desktops

The register installs like an app - its own icon, its own window, no browser bar - on
Android, iPhone, Windows and Mac. There is nothing to publish to an app store and nothing
for the controllers to download: the app comes from your own office computer.

### Step 1 - turn on https

Browsers only offer to install a site, and only let it keep working with the network down,
when the address is secure. On the computer running the register:

```bash
npm run make-cert     # once, and again about once a year to renew
npm start             # it now says https://... instead of http://...
```

### Step 2 - let each device trust the certificate

The certificate signs itself, so every phone and PC shows a warning the first time.
**Clicking past that warning is not enough to install the app** - the device has to trust
the certificate properly. On each device, once:

1. Open `https://<the office computer>:3000/cert.pem` - the register hands the certificate
   over (only the public half; the secret key never leaves the computer).
2. **Android** - it offers to install it; give it any name.
   **iPhone / iPad** - it downloads a profile: *Settings → Profile Downloaded → Install*,
   then *Settings → General → About → Certificate Trust Settings* and switch it on.
   **Windows** - open the downloaded file → *Install Certificate* → *Local Machine* →
   *Trusted Root Certification Authorities*. **Mac** - open it in Keychain Access and set it
   to *Always Trust*.

Skipping this step is fine if you only want the register in a browser - it works normally,
it just cannot be installed as an app or used with the network down. With a real domain and
a real certificate (section 8) none of this is needed at all.

### Step 3 - install it

| Device | How |
| --- | --- |
| **Android (Chrome)** | Open the address, then the **Install app** button in the top bar, or menu → *Install app* |
| **iPhone / iPad (Safari)** | Open the address, tap **Share**, then *Add to Home Screen* |
| **Windows / Mac (Chrome or Edge)** | Open the address, then the **Install app** button in the top bar, or the install icon at the right of the address bar |

Once installed it opens straight into the register from the home screen or start menu, and
the icon carries shortcuts to *Add Asset*, *Scan / Find* and *Print Labels*.

### What works away from the network

The screens themselves are kept on the device, so the app still opens when the Wi-Fi drops
or the office computer is off - it says plainly that it cannot reach the register rather
than showing a broken page. Asset data is always read live from the server, never from an
old copy on the phone, because a stale register would be worse than an honest error.

### On a phone

The asset list turns into cards instead of a wide table, so a controller standing in front
of a machine can read the code, who holds it and its status without scrolling sideways, and
can tick items for label printing with a thumb.

---

## 10. How it is built

| Part | Detail |
| --- | --- |
| Server | Node.js + Express 5 |
| Database | SQLite (`better-sqlite3`), single file, no separate server |
| Sign-in | JWT tokens, passwords hashed with bcrypt |
| Front end | Plain HTML, CSS and JavaScript - no build step, nothing to compile |
| App install | Web app manifest + service worker, so it installs on phones and desktops |
| Barcode | Code 128 drawn as SVG by `public/js/barcode.js` - no internet needed to print |

```
server.js                 starts the web server
src/db.js                 database schema, default companies and categories
src/auth.js               tokens, password hashing, role guards
src/codes.js              asset code and S.NO generation
src/routes/               auth, users, companies/categories, assets, reports
public/                   the screens (index.html, css, js)
public/sw.js              keeps the screens working with the network down
public/manifest.webmanifest  what the installed app is called and looks like
scripts/seed-demo.js      sample data
scripts/reset-password.js forgotten-password reset
scripts/make-cert.js      certificate for https on the office network
scripts/backup.js         safe copy of the database
data/assets.db            your data
```
