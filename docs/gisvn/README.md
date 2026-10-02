# GISVN on Discourse

This directory defines the GISVN modernization layer without forking the
Discourse application architecture.

## Design goal

Recreate the recognizable GISVN forum identity shown by the archived 2016
forum — deep blue header, compact forum navigation, yellow welcome notice,
strong blue section bars, category-first information architecture, and green
latest-topic accents — while retaining current Discourse behavior,
accessibility, responsive layouts, search, moderation, trust levels, badges,
notifications, and mobile support.

## Repository layout

- `themes/gisvn/` — isolated GISVN visual theme. No core Ember/Rails patching.
- `script/gisvn/bootstrap_categories.rb` — idempotent category bootstrap based
  on the historical GISVN hierarchy.
- `docs/gisvn/cloudflare-r2.md` — production runbook for Cloudflare R2 uploads
  and optional R2 backups.

This is intentionally an overlay. Keeping GISVN-specific work out of Discourse
core makes upstream synchronization substantially safer.

## Install the theme

For a production forum, import the theme from the Git repository using the
subdirectory `themes/gisvn`, or copy that directory into a dedicated theme
repository. Then select **GISVN Community** as the default site theme in the
Discourse admin interface.

For local development, use the standard Discourse theme tooling and point it at
`themes/gisvn`.

## Create the GISVN category hierarchy

Back up the database first, then run:

```bash
cd /var/www/discourse
RAILS_ENV=production bundle exec rails runner script/gisvn/bootstrap_categories.rb
```

The script is idempotent and does not delete existing categories or content.
Review permissions and descriptions in the admin UI after the first run.

## Recommended site settings

- Default locale: Vietnamese (`vi`)
- Home page: Categories
- Category page: category list with latest/featured topics
- Enable solved topics for Q&A-oriented sections
- Keep registration, email verification, rate limits and trust levels enabled
- Configure a custom logo/favicon in Admin rather than baking brand assets into
  the theme
- Use a dedicated hostname such as `forum.gis.vn` or your production domain

## Next phase

1. Import/migrate legacy users, topics and posts after data ownership and
   encoding are verified.
2. Add redirect mapping from old `forumdisplay.php` / `showthread.php`
   URLs to new Discourse URLs.
3. Configure R2 for uploads, validate upload + thumbnail + backup restore, then
   migrate existing uploads.
4. Add GIS-specific integrations (MapLibre/PMTiles previews, GeoJSON/KML
   attachments, code syntax highlighting and data-download policies) as
   separate plugins or theme components.
