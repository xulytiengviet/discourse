# GISVN staging checklist

Use this checklist before changing production DNS or migrating legacy uploads.

## 1. Theme and navigation

- GISVN header/wordmark renders on desktop and mobile.
- Main links open Discourse routes without full-page errors.
- Yellow welcome notice does not cover Discourse controls.
- "Thông Báo Mới Nhất" and "Thống Kê Topx" load on / and /categories.
- Failure of /latest.json or /about.json degrades to a message rather than breaking the page.

## 2. Categories

Run:

```bash
cd /var/www/discourse
RAILS_ENV=production bundle exec rails runner script/gisvn/bootstrap_categories.rb
```

Then verify category permissions, descriptions, moderators, and ordering.

## 3. Legacy redirects

Create a real mapping CSV from migrated content, then run:

```bash
RAILS_ENV=production bundle exec rails runner \
  script/gisvn/import_legacy_permalinks.rb /tmp/gisvn-permalinks.csv
```

Test representative old links for forumdisplay.php and showthread.php.

## 4. R2 uploads

- Create a bucket-scoped Object Read & Write R2 S3 token.
- Keep uploads and backups in separate buckets.
- Set a custom domain for public uploads.
- Add CORS with ETag exposed.
- Merge docs/gisvn/app.yml.r2.example into the real app.yml.
- Rebuild Discourse.
- Upload a fresh image and a non-image attachment.
- Verify original, optimized image, thumbnail, avatar and download URLs.

## 5. Existing upload migration

Make an independent backup first, then:

```bash
cd /var/www/discourse
sudo -E -u discourse bundle exec rake uploads:migrate_to_s3
```

Do not run cleanup until old and new uploads have been checked.

## 6. Backups

Only after uploads are stable:

- enable the private R2 backup bucket;
- create a fresh Discourse backup;
- download/restore that backup to a separate test instance;
- keep at least one backup copy outside the live forum and uploads bucket.

## 7. Go-live

- SMTP/email delivery verified.
- HTTPS and canonical hostname verified.
- Admin recovery account verified.
- Rate limits and registration policy reviewed.
- Search indexing works.
- Mobile layout works.
- Old URL redirect sample passes.
- Database backup and restore procedure documented.
