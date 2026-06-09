#!/usr/bin/env node
/**
 * purge-bootstrap.js — Strip unused Bootstrap 5 CSS rules.
 *
 * Usage:  npm run purge
 *    or:  node scripts/purge-bootstrap.js
 *
 * Reads  : css/bootstrap.min.css  (Bootstrap 5.3 full, ~256KB)
 * Scans  : _site/**\/*.html — Jekyll-rendered pages (all Liquid resolved)
 *          js/*.js          — dynamic class names set by JavaScript
 * Writes : css/bootstrap.min.css  (purged, typically ~10–20KB)
 *
 * To restore the full Bootstrap 5 file before re-purging:
 *   npm run restore-bootstrap && npm run purge
 *
 * Safelist covers classes added at runtime by JS or Bootstrap internals that
 * are not visible in the static HTML snapshot.
 */

'use strict';

const { PurgeCSS } = require('purgecss');
const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const CSS_FILE   = path.join(ROOT, 'css', 'bootstrap.min.css');
const SITE_DIR   = path.join(ROOT, '_site');

if (!fs.existsSync(SITE_DIR)) {
    console.error('Error: _site/ not found — run the Jekyll server first to generate it.');
    process.exit(1);
}

async function main() {
    const sizeBefore = fs.statSync(CSS_FILE).size;

    const [result] = await new PurgeCSS().purge({
        content: [
            path.join(SITE_DIR, '**', '*.html'),   // all rendered pages
            path.join(ROOT, 'js', '*.js'),          // JS-added class names
        ],
        css: [CSS_FILE],

        safelist: {
            // ── Bootstrap runtime state classes ────────────────────────────
            // These are toggled by site.js or Bootstrap's own JS and won't
            // appear in the static HTML snapshot.
            standard: [
                'show',        // Bootstrap collapse visible state
                'collapsing',  // Bootstrap collapse animation
                'collapse',    // Bootstrap collapse base
                'fade',        // Bootstrap fade transition
                'active',      // Bootstrap active nav item
                'disabled',    // Bootstrap disabled state
                // Our custom JS-applied classes
                'dark-mode',
                'is-fixed',    // navbar scroll (site.js)
                'is-visible',  // navbar scroll (site.js)
                'fade-in',     // scroll-triggered animation
                'visible',     // fade-in active state
                'preloader',   // recent-works loading spinner
                'photo-grid',  // portfolio grid (portfoliopage.js)
                // Bootstrap form validation (Formspree responses)
                'was-validated',
                'is-valid',
                'is-invalid',
            ],
            // Keep all Bootstrap responsive / utility class variants so that
            // any class used at any breakpoint in any template is preserved.
            patterns: [
                /^(col-|offset-|row$|container)/,  // grid
                /^(d-|m[xytrbl]?-|p[xytrbl]?-|g[xy]?-)/,  // spacing / display
                /^(text-|bg-|border-|rounded)/,     // colour utilities
                /^(w-|h-|mw-|mh-|vw-|vh-)/,        // sizing
                /^(flex-|align-|justify-|order-)/,  // flexbox
                /^(float-|position-|top-|start-|end-|bottom-)/,
                /^(fs-|fw-|lh-|font-)/,             // typography
                /^(navbar-|nav-|dropdown-)/,        // navigation
                /^(btn-|btn$)/,                     // buttons
                /^(form-|input-|valid|invalid)/,    // forms
                /^(card|card-)/,                    // cards
                /^(list-|table|table-)/,            // lists / tables
                /^(modal-?|offcanvas)/,             // overlays (future-proof)
                /^(visually-hidden)/,               // accessibility
                /^(sr-only)/,                       // Bootstrap 3 compat in clean-blog.css
            ],
        },
    });

    fs.writeFileSync(CSS_FILE, result.css);

    const sizeAfter = fs.statSync(CSS_FILE).size;
    const saved     = Math.round((1 - sizeAfter / sizeBefore) * 100);

    console.log('Bootstrap CSS purged:');
    console.log(`  Before : ${Math.round(sizeBefore / 1024)} KB`);
    console.log(`  After  : ${Math.round(sizeAfter  / 1024)} KB  (−${saved}%)`);
    console.log(`  Wrote  : ${path.relative(ROOT, CSS_FILE)}`);
}

main().catch(function (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
});
