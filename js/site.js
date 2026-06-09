// site.js — vanilla JS
// Replaces: jquery.min.js + bootstrap.min.js + clean-blog.min.js

(function () {
    'use strict';

    // ── Mobile navbar collapse ──────────────────────────────────────────────────
    // Bootstrap 5 uses .navbar-toggler + data-bs-target and toggles .show.
    var navToggle = document.querySelector('.navbar-toggler');
    if (navToggle) {
        navToggle.addEventListener('click', function () {
            var target = document.querySelector(this.getAttribute('data-bs-target'));
            if (!target) return;
            var expanded = target.classList.toggle('show');
            this.setAttribute('aria-expanded', expanded);
        });
    }

    // ── Navbar scroll behaviour (sticky header, wide screens only) ─────────────
    // Mirrors clean-blog.js: at > 1170px, hide navbar on scroll-down, reveal on
    // scroll-up (is-fixed / is-visible classes drive the CSS transitions).
    var navbar = document.querySelector('.navbar-custom');
    if (navbar && window.innerWidth > 1170) {
        var navH    = navbar.offsetHeight;
        var prevTop = 0;

        window.addEventListener('scroll', function () {
            var top = window.scrollY;

            if (top < prevTop) {                                // scrolling UP
                if (top > 0 && navbar.classList.contains('is-fixed')) {
                    navbar.classList.add('is-visible');
                } else {
                    navbar.classList.remove('is-visible', 'is-fixed');
                }
            } else {                                            // scrolling DOWN
                navbar.classList.remove('is-visible');
                if (top > navH && !navbar.classList.contains('is-fixed')) {
                    navbar.classList.add('is-fixed');
                }
            }
            prevTop = top;
        }, { passive: true });
    }

    // ── Floating label form effects (contact page) ──────────────────────────────
    document.addEventListener('input', function (e) {
        var g = e.target.closest && e.target.closest('.floating-label-form-group');
        if (g) g.classList.toggle('floating-label-form-group-with-value', Boolean(e.target.value));
    });
    document.addEventListener('focusin', function (e) {
        var g = e.target.closest && e.target.closest('.floating-label-form-group');
        if (g) g.classList.add('floating-label-form-group-with-focus');
    });
    document.addEventListener('focusout', function (e) {
        var g = e.target.closest && e.target.closest('.floating-label-form-group');
        if (g) g.classList.remove('floating-label-form-group-with-focus');
    });

    // ── Theme toggle (dark / light mode) ───────────────────────────────────────
    (function () {
        var THEME_KEY = 'theme';
        var html      = document.documentElement;

        function systemDark() {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        function updateIcon() {
            var btn = document.getElementById('theme-toggle');
            if (!btn) return;
            var dark = html.classList.contains('dark-mode');
            btn.querySelector('i').className = dark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
            btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        }

        function setTheme(dark) {
            html.classList.toggle('dark-mode', dark);
            // Bootstrap 5.3 native dark mode — components adapt automatically
            if (dark) {
                html.setAttribute('data-bs-theme', 'dark');
            } else {
                html.removeAttribute('data-bs-theme');
            }
            // If choice matches system, let system lead (clear override)
            if (dark === systemDark()) {
                localStorage.removeItem(THEME_KEY);
            } else {
                localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
            }
            updateIcon();
        }

        // Sync icon with the class already set by the flash-prevention script
        updateIcon();

        var btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.addEventListener('click', function () {
                setTheme(!html.classList.contains('dark-mode'));
            });
        }

        // Follow OS preference changes (e.g. automatic sunset/sunrise)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            if (!localStorage.getItem(THEME_KEY)) {
                html.classList.toggle('dark-mode', e.matches);
                if (e.matches) { html.setAttribute('data-bs-theme', 'dark'); }
                else            { html.removeAttribute('data-bs-theme'); }
                updateIcon();
            }
        });
    }());

    // ── Scroll-triggered fade-in (#21) ─────────────────────────────────────────
    var fadeEls = document.querySelectorAll('.fade-in');
    if (fadeEls.length) {
        if ('IntersectionObserver' in window) {
            var fadeObs = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) {
                        e.target.classList.add('visible');
                        fadeObs.unobserve(e.target);
                    }
                });
            }, { threshold: 0.1 });
            fadeEls.forEach(function (el) { fadeObs.observe(el); });
        } else {
            // Fallback: reveal immediately for browsers without IntersectionObserver
            fadeEls.forEach(function (el) { el.classList.add('visible'); });
        }
    }

    // ── Responsive tables (blog posts) ─────────────────────────────────────────
    document.querySelectorAll('table').forEach(function (t) {
        if (t.closest('.table-responsive')) return;
        var w = document.createElement('div');
        w.className = 'table-responsive';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
        t.classList.add('table', 'table-hover');
    });

    // ── Responsive embeds (YouTube / Vimeo in blog posts) ──────────────────────
    document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="vimeo.com"]')
        .forEach(function (iframe) {
            var w = document.createElement('div');
            w.className = 'embed-responsive embed-responsive-16by9';
            iframe.parentNode.insertBefore(w, iframe);
            w.appendChild(iframe);
            iframe.classList.add('embed-responsive-item');
        });

}());
