#!/usr/bin/env node
/**
 * sync-flickr.js — Download Flickr images and generate a local manifest.
 *
 * Usage:  node scripts/sync-flickr.js
 *    or:  npm run sync
 *
 * Downloads:
 *   img/slider/         — Hero slider images (tagged "websiteslider")
 *   img/recent/         — 6 most-recent photos for the homepage "Recent Works"
 *   img/portfolio/{id}/ — All photos in each set of the portfolio collection
 *
 * Generates:
 *   data/site-images.json — manifest read by mainpage.js + portfoliopage.js
 *
 * Re-runs skip already-downloaded files, so only new/changed photos are fetched.
 * To force a full re-download, delete the relevant img/ subdirectory first.
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

// ─── Configuration ────────────────────────────────────────────────────────────

const FLICKR_API_KEY  = '67bf3b9056d556648271355d1cf0616f';
const FLICKR_USER_ID  = '69414961@N00';
const COLLECTION_ID   = '1126003-72157641779573683';
const SLIDER_TAG      = 'websiteslider';
const SLIDER_COUNT    = 8;   // max slider images
const RECENT_COUNT    = 6;   // max recent-works images
const EXTRAS          = 'url_t,url_s,url_m,url_z,url_l,url_o,description';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT          = path.join(__dirname, '..');
const IMG_SLIDER    = path.join(ROOT, 'img', 'slider');
const IMG_RECENT    = path.join(ROOT, 'img', 'recent');
const IMG_PORTFOLIO = path.join(ROOT, 'img', 'portfolio');
const DATA_DIR      = path.join(ROOT, 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'site-images.json');

// ─── Utilities ────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Flickr REST API call — resolves to parsed JSON. */
function flickrCall(params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      format:         'json',
      nojsoncallback: '1',
      api_key:        FLICKR_API_KEY,
      ...params,
    }).toString();

    const url = `https://api.flickr.com/services/rest/?${qs}`;
    process.stdout.write(`  [api] ${params.method}\n`);

    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.stat !== 'ok') {
            reject(new Error(`Flickr ${json.code}: ${json.message}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nBody: ${raw.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Download url → destPath, following up to 5 redirects.
 * Skips the download if the file already exists.
 * Returns the destPath on success, or null if url is falsy.
 */
function downloadFile(url, destPath, _depth) {
  _depth = _depth || 0;
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);

    if (fs.existsSync(destPath)) {
      process.stdout.write(`    ↷ ${path.basename(destPath)} (cached)\n`);
      return resolve(destPath);
    }

    if (_depth > 5) {
      return reject(new Error('Too many redirects: ' + url));
    }

    ensureDir(path.dirname(destPath));
    const lib  = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        return downloadFile(res.headers.location, destPath, _depth + 1)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write(`    ↓ ${path.basename(destPath)}\n`);
        resolve(destPath);
      });
      file.on('error', (err) => {
        file.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
    }).on('error', (err) => {
      file.destroy();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(err);
    });
  });
}

/** Return the first non-empty value from a list of property keys on obj. */
function pick(obj) {
  var keys = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]]) return obj[keys[i]];
  }
  return null;
}

/** Absolute-from-root web path, e.g. /img/slider/12345_l.jpg */
function webPath() {
  return '/' + Array.prototype.slice.call(arguments).join('/').replace(/\/+/g, '/').replace(/^\//, '');
}

/** Convert a downloaded JPG to WebP alongside it. Skips if WebP already exists. */
async function toWebP(jpgPath) {
  if (!jpgPath || !fs.existsSync(jpgPath)) return null;
  const webpPath = jpgPath.replace(/\.jpg$/, '.webp');
  if (fs.existsSync(webpPath)) {
    process.stdout.write(`    ↷ ${path.basename(webpPath)} (cached)\n`);
    return webpPath;
  }
  await sharp(jpgPath).webp({ quality: 82 }).toFile(webpPath);
  process.stdout.write(`    ✦ ${path.basename(webpPath)}\n`);
  return webpPath;
}

// ─── Prune: Remove local files not referenced by the current manifest ─────────

/** Convert a manifest web-path (/img/...) to an absolute filesystem path. */
function toAbsolute(webpath) {
  return path.join(ROOT, webpath.replace(/^\//, ''));
}

/**
 * Delete any file under img/slider/, img/recent/, and img/portfolio/
 * that is not listed in the manifest.  Also removes empty set directories
 * (i.e. albums that were removed from the Flickr collection).
 * Returns the number of deleted files.
 */
function pruneOrphanedFiles(manifest) {
  // Build the complete set of files that should exist on disk
  const expected = new Set();

  manifest.slider.forEach(function (s) {
    expected.add(toAbsolute(s.image));
    if (s.webp) expected.add(toAbsolute(s.webp));
  });

  manifest.recentWorks.forEach(function (r) {
    expected.add(toAbsolute(r.image));
    if (r.webp) expected.add(toAbsolute(r.webp));
  });

  manifest.portfolio.data.forEach(function (set) {
    set.gallery.forEach(function (photo) {
      expected.add(toAbsolute(photo.image));
      if (photo.imageWebp) expected.add(toAbsolute(photo.imageWebp));
      expected.add(toAbsolute(photo.thumb));
      if (photo.thumbWebp) expected.add(toAbsolute(photo.thumbWebp));
      expected.add(toAbsolute(photo.big));
      if (photo.bigWebp) expected.add(toAbsolute(photo.bigWebp));
    });
  });

  var deleted = 0;

  // ── Flat directories: slider and recent ──────────────────────────────────────
  [IMG_SLIDER, IMG_RECENT].forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (f) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isFile() && !expected.has(full)) {
        fs.unlinkSync(full);
        process.stdout.write('  ✗ ' + path.relative(ROOT, full) + '\n');
        deleted++;
      }
    });
  });

  // ── Portfolio set subdirectories ─────────────────────────────────────────────
  if (!fs.existsSync(IMG_PORTFOLIO)) return deleted;

  fs.readdirSync(IMG_PORTFOLIO, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isDirectory()) return;
    const setDir = path.join(IMG_PORTFOLIO, entry.name);

    // Prune individual files within the set directory
    fs.readdirSync(setDir).forEach(function (f) {
      const full = path.join(setDir, f);
      if (fs.statSync(full).isFile() && !expected.has(full)) {
        fs.unlinkSync(full);
        process.stdout.write('  ✗ ' + path.relative(ROOT, full) + '\n');
        deleted++;
      }
    });

    // If the directory is now empty the entire album was removed — delete it too
    if (fs.readdirSync(setDir).length === 0) {
      fs.rmdirSync(setDir);
      process.stdout.write('  ✗ removed empty set dir: ' + entry.name + '\n');
    }
  });

  return deleted;
}

// ─── Fetch: Slider ────────────────────────────────────────────────────────────

async function fetchSliderImages() {
  console.log('\n── Slider (tag: ' + SLIDER_TAG + ') ──');
  ensureDir(IMG_SLIDER);

  const res = await flickrCall({
    method:   'flickr.photos.search',
    user_id:  FLICKR_USER_ID,
    tags:     SLIDER_TAG,
    extras:   EXTRAS,
    sort:     'date-posted-desc',
    per_page: String(SLIDER_COUNT + 2),  // fetch a couple extra as buffer
  });

  const photos   = res.photos.photo;
  const manifest = [];

  for (var i = 0; i < photos.length && manifest.length < SLIDER_COUNT; i++) {
    const p   = photos[i];
    // prefer large (1024px) — original can be many MB
    const url = pick(p, 'url_l', 'url_z', 'url_m');
    if (!url) continue;

    const filename  = p.id + '_l.jpg';
    const jpgDest   = path.join(IMG_SLIDER, filename);
    await downloadFile(url, jpgDest);
    await toWebP(jpgDest);
    manifest.push({
      image: webPath('img', 'slider', filename),
      webp:  webPath('img', 'slider', filename.replace('.jpg', '.webp')),
      title: p.title,
    });
  }

  console.log('  → ' + manifest.length + ' slider image(s)');
  return manifest;
}

// ─── Fetch: Recent Works ──────────────────────────────────────────────────────

async function fetchRecentWorks() {
  console.log('\n── Recent Works ──');
  ensureDir(IMG_RECENT);

  const res = await flickrCall({
    method:   'flickr.photos.search',
    user_id:  FLICKR_USER_ID,
    extras:   EXTRAS,
    sort:     'date-posted-desc',
    per_page: String(RECENT_COUNT + 2),
  });

  const photos   = res.photos.photo;
  const manifest = [];

  for (var i = 0; i < photos.length && manifest.length < RECENT_COUNT; i++) {
    const p        = photos[i];
    const imageUrl = pick(p, 'url_z', 'url_m');
    if (!imageUrl) continue;

    const imgFile  = p.id + '_m.jpg';
    const jpgDest  = path.join(IMG_RECENT, imgFile);
    await downloadFile(imageUrl, jpgDest);
    await toWebP(jpgDest);
    manifest.push({
      image: webPath('img', 'recent', imgFile),
      webp:  webPath('img', 'recent', imgFile.replace('.jpg', '.webp')),
      title: p.title,
    });
  }

  console.log('  → ' + manifest.length + ' recent work(s)');
  return manifest;
}

// ─── Fetch: Portfolio Sets ────────────────────────────────────────────────────

async function fetchSetPhotos(setId, setDir) {
  const setName = path.basename(setDir);

  const res = await flickrCall({
    method:      'flickr.photosets.getPhotos',
    photoset_id: setId,
    user_id:     FLICKR_USER_ID,
    extras:      EXTRAS,
  });

  const photos        = res.photoset.photo;
  const gallery       = [];
  var   primaryEntry  = null;

  for (var i = 0; i < photos.length; i++) {
    const p = photos[i];

    const thumbUrl = pick(p, 'url_t', 'url_s');
    const imageUrl = pick(p, 'url_z', 'url_m');
    const bigUrl   = pick(p, 'url_l', 'url_z', 'url_m');
    if (!imageUrl) continue;

    // Download medium (gallery display image)
    const imgFile  = p.id + '_m.jpg';
    await downloadFile(imageUrl, path.join(setDir, imgFile));
    await toWebP(path.join(setDir, imgFile));

    // Download thumbnail
    const thumbFile = p.id + '_t.jpg';
    if (thumbUrl) {
      await downloadFile(thumbUrl, path.join(setDir, thumbFile));
      await toWebP(path.join(setDir, thumbFile));
    }

    // Download large only when it differs from medium
    const hasLarger = bigUrl && bigUrl !== imageUrl;
    const bigFile   = hasLarger ? p.id + '_l.jpg' : imgFile;
    if (hasLarger) {
      await downloadFile(bigUrl, path.join(setDir, bigFile));
      await toWebP(path.join(setDir, bigFile));
    }

    const wp = function (f) { return webPath('img', 'portfolio', setName, f.replace('.jpg', '.webp')); };

    const entry = {
      image:       webPath('img', 'portfolio', setName, imgFile),
      imageWebp:   wp(imgFile),
      thumb:       thumbUrl
                     ? webPath('img', 'portfolio', setName, thumbFile)
                     : webPath('img', 'portfolio', setName, imgFile),
      thumbWebp:   thumbUrl ? wp(thumbFile) : wp(imgFile),
      big:         webPath('img', 'portfolio', setName, bigFile),
      bigWebp:     wp(bigFile),
      title:       p.title,
      description: p.description ? p.description._content : '',
    };

    gallery.push(entry);
    if (p.isprimary === '1') primaryEntry = entry;
  }

  // Fall back to first photo if no primary is flagged
  if (!primaryEntry && gallery.length > 0) primaryEntry = gallery[0];
  return { gallery, primary: primaryEntry };
}

async function fetchPortfolioCollection() {
  console.log('\n── Portfolio Collection ──');
  ensureDir(IMG_PORTFOLIO);

  const res = await flickrCall({
    method:        'flickr.collections.getTree',
    user_id:       FLICKR_USER_ID,
    collection_id: COLLECTION_ID,
  });

  const sets = res.collections.collection[0].set;
  const data = [];

  for (var i = 0; i < sets.length; i++) {
    const set    = sets[i];
    const setDir = path.join(IMG_PORTFOLIO, set.id);
    console.log('\n  Set ' + i + ': "' + set.title + '" (' + set.id + ')');
    ensureDir(setDir);

    const { gallery, primary } = await fetchSetPhotos(set.id, setDir);

    data.push({
      title:       set.title,
      description: set.description,
      seq:         i,
      // url_m / url_m_webp used as CSS background-image in portfoliopage.js
      primary:     {
        url_m:      primary ? primary.image    : '',
        url_m_webp: primary ? primary.imageWebp : '',
      },
      gallery,
    });
  }

  return { data };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Flickr → local sync ===');
  console.log('User:       ' + FLICKR_USER_ID);
  console.log('Collection: ' + COLLECTION_ID);

  ensureDir(DATA_DIR);

  const slider      = await fetchSliderImages();
  const recentWorks = await fetchRecentWorks();
  const portfolio   = await fetchPortfolioCollection();

  const manifest = { slider, recentWorks, portfolio };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // Remove any local files that are no longer in the Flickr albums/sets
  console.log('\n── Pruning orphaned files ──');
  const pruned = pruneOrphanedFiles(manifest);
  console.log('  → ' + (pruned > 0 ? pruned + ' file(s) removed' : 'nothing to prune'));

  const totalPhotos = portfolio.data.reduce(function(n, s) { return n + s.gallery.length; }, 0);
  console.log('\n=== Done ===');
  console.log('Slider images:   ' + slider.length);
  console.log('Recent works:    ' + recentWorks.length);
  console.log('Portfolio sets:  ' + portfolio.data.length);
  console.log('Gallery photos:  ' + totalPhotos);
  console.log('Pruned files:    ' + pruned);
  console.log('Manifest:        ' + MANIFEST_PATH);
}

main().catch(function(err) {
  console.error('\nFatal: ' + err.message);
  process.exit(1);
});
