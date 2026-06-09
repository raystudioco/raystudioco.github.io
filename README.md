#Raytudiophoto theme

Adopted from Clean Blog by Start Bootstrap.

Following modification is done to the theme:
- Added index page adopt from Modern Business (another theme from Start Bootstrap)
- Added Slide function with Nerve Slide
- Integrate Flickr image load function
 + loading image to Nerve Slide, recent works
- Added portfolio page.
 + Porfolio page utilize plugin photomosaic
- Moved blog post to blog pages.(originally on index page)
- Lightbox feature added to photos.

Update in 2026 June, following changes suggest and applied by using Claude
- Replaced the dead PHP contact form and Wufoo embed with Formspree.
- Removed the Flickr API runtime dependency. Downloads all slider, recent-works, and portfolio images from Flickr and serve locally.
- Removed 140 KB of legacy JavaScript: jQuery, Bootstrap JS, and clean-blog.min.js were replaced by a 2 KB vanilla JS file. NerveSlider, PhotoMosaic, and baguetteBox were replaced with CSS scroll-snap, CSS columns, and GLightbox respectively.
- Bootstrap was upgraded from v3 to v5.3.3, then PurgeCSS reduced the Bootstrap CSS from 256 KB to 36 KB by stripping unused rules.
- The hero slider was rebuilt with CSS
- Full dark mode was implemented using Bootstrap 5's data-bs-theme system combined with a custom dark-mode class
- Font Awesome was upgraded from 4.3.0 to 6.7.2 and downloaded locally
- The Grunt + LESS build system was removed entirely along with all related dev dependencies
- Orphaned files removed.