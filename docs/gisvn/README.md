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
- `docs/gisvn/app.yml.r2.example` — copy-safe R2 configuration fragment with no
  real credentials.
- `script/gisvn/import_legacy_permalinks.rb` — CSV importer for legacy vBulletin
  `forumdisplay.php` / `showthread.php` redirects.
- `docs/gisvn/STAGING_CHECKLIST.md` — staging-to-production validation checklist.
- `docs/gisvn/VBULLETIN4_MIGRATION.md` — GISVN-specific runbook for the built-in Discourse vBulletin 4 importer and automatic legacy URL normalization.
- `script/gisvn/install_vbulletin_permalinks.rb` — post-import helper that derives old topic/forum/member/post redirects from Discourse `import_id` fields.
- `script/gisvn/run_vbulletin41_import.sh` + `vbulletin41.env.example` — executable GISVN 4.1.7 migration wrapper/config.
- `script/gisvn/export_vbulletin_mappings.rb` — exports all imported legacy IDs and redirect targets for audit.
- `docs/gisvn/GEO_PREVIEW.md` — MapLibre/PMTiles/GeoJSON/KML in-post preview design and R2 CORS requirements.

This is intentionally an overlay. Keeping GISVN-specific work out of Discourse
core makes upstream synchronization substantially safer.

## Install the theme

The full `xulytiengviet/discourse` repository is the Discourse application,
not a standalone theme repository. For production, use one of these supported
paths:

1. copy `themes/gisvn/` into a dedicated Git repository whose root contains
   `about.json`, `common/`, etc., then install that repository from
   **Admin → Appearance → Themes & components → Install → From a Git repository**;
2. package the contents of `themes/gisvn/` as a ZIP/TAR archive and install it
   from the admin interface; or
3. use the standard `discourse_theme` tooling to sync `themes/gisvn/` to a
   development or production instance.

Then select **GISVN Community** as the default site theme.

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

## Phase 2: historical home panels and legacy URL continuity

The GISVN theme now adds live versions of the old **Thông Báo Mới Nhất** and
**Thống Kê Topx** panels on the home/categories page. Data comes from
Discourse's own `/latest.json` and `/about.json` endpoints, so the panels do
not maintain a second copy of forum statistics.

To preserve search-engine and bookmark continuity after a vBulletin migration,
create a CSV with `old_path,new_url` columns and run:

```bash
RAILS_ENV=production bundle exec rails runner \
  script/gisvn/import_legacy_permalinks.rb /tmp/gisvn-permalinks.csv
```

Start from `docs/gisvn/legacy-permalinks.example.csv`, but replace every
destination with the actual migrated Discourse URL.

Before production, follow `docs/gisvn/STAGING_CHECKLIST.md`.

## Next phase

1. Import/migrate legacy users, topics and posts after data ownership and
   encoding are verified.
2. Generate the complete old-ID → new-URL permalink CSV from migration output.
3. Add GIS-specific integrations (MapLibre/PMTiles previews, GeoJSON/KML/KMZ
   attachments and safe map embeds) as separate plugins or theme components.
4. Add observability and automated smoke tests for forum + R2 after deployment.


## Phase 3

Phase 3 makes the migration and GIS content path operational:

1. configure and run the built-in Discourse vBulletin 4 importer using the
   GISVN wrapper/environment template;
2. derive redirect records from importer `import_id` fields instead of
   manually maintaining thousands of old URLs;
3. export all old-ID → Discourse target mappings to CSV for audit;
4. detect normal `.geojson`, `.kml` and `.pmtiles` links in cooked posts
   and add a lazy **Xem bản đồ** preview powered by MapLibre/PMTiles;
5. keep the original file link intact and fail safely when CORS or file
   metadata prevents an inline preview.

See `VBULLETIN4_MIGRATION.md`, `GEO_PREVIEW.md`, and
`STAGING_CHECKLIST.md` before production cutover.

## Phase 4

GIS previews now live in the standalone `discourse-gisvn-geo` plugin. Install the
plugin and GISVN theme 2.0 using [PHASE4.md](PHASE4.md). Theme-only installations
no longer provide the Phase 3 map decorator.

## Phục dựng từ GISForum

Xem [CLASSIC_RESTORATION.md](CLASSIC_RESTORATION.md) cho bản classic, dữ liệu nguồn đầy đủ và theme 2.1.
