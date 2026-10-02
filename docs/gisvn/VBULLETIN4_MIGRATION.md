# GISVN vBulletin 4.1.7 → Discourse migration

The archived GISVN page identifies the historical forum as **vBulletin 4.1.7**.
This fork already contains Discourse's built-in vBulletin 4 importer at:

```text
script/import_scripts/vbulletin.rb
```

The importer itself points to Discourse's vBulletin 4 migration documentation
and imports groups, users, category hierarchy, topics, replies, private
messages, attachments, closed topics and banned users.

## 1. Never import directly into production first

Use a disposable staging Discourse instance and a read-only copy of the old
MySQL database/files.

Keep three independent copies before starting:

1. original vBulletin MySQL dump;
2. original attachment/avatar filesystem;
3. current Discourse database backup.

## 2. Practical GISVN configuration

Phase 3 includes:

```text
script/gisvn/vbulletin41.env.example
script/gisvn/run_vbulletin41_import.sh
script/gisvn/vbulletin41_preflight.sql
script/gisvn/export_vbulletin_mappings.rb
```

Copy the env example outside Git, protect it with `chmod 600`, and use a
read-only MySQL account for the source database.

The built-in importer accepts these environment variables:

```bash
export DB_HOST="127.0.0.1"
export DB_NAME="vbulletin"
export DB_USER="root"
export DB_PW="<SOURCE_DB_PASSWORD>"
export TABLE_PREFIX="vb_"
export ATTACHMENT_DIR="/path/to/vbulletin/attachments"
export TIMEZONE="<TIMEZONE_USED_BY_THE_OLD_FORUM>"
```

The example uses `Asia/Ho_Chi_Minh`, but confirm it from the old
server/database configuration before importing timestamps.

The archived March 2016 GISVN home page showed an approximate historical
checkpoint of **4,239 topics, 24,627 posts and 101,013 members**. Treat those
figures as a sanity check for the archived date only, not as authoritative
counts for whichever database dump is migrated. The source SQL counts are the
production migration source of truth.

The importer requires the Ruby `php-serialize` dependency in addition to its
normal MySQL dependencies.

## 3. Preflight the source

At minimum, compare counts before and after migration for:

```sql
SELECT COUNT(*) FROM vb_user;
SELECT COUNT(*) FROM vb_forum;
SELECT COUNT(*) FROM vb_thread;
SELECT COUNT(*) FROM vb_post;
SELECT COUNT(*) FROM vb_attachment;
SELECT COUNT(*) FROM vb_pmtext;
```

Adjust `vb_` when the historical installation used another table prefix.

Also inspect character encoding/collation. GISVN contains Vietnamese text, so a
test import must verify diacritics in usernames, category names, titles, posts
and private messages before production.

## 4. Run the built-in vBulletin 4 importer

Run the preflight queries first, then use the GISVN wrapper:

```bash
cp script/gisvn/vbulletin41.env.example /root/gisvn-vbulletin41.env
chmod 600 /root/gisvn-vbulletin41.env
# edit /root/gisvn-vbulletin41.env

bash script/gisvn/run_vbulletin41_import.sh /root/gisvn-vbulletin41.env
```

The wrapper validates required values, runs the built-in importer, installs
legacy permalinks and writes an audit CSV. It does not replace the importer.

The source file remains authoritative:

```text
script/import_scripts/vbulletin.rb
```

Important behavior already implemented by that importer:

- imports vBulletin user groups and memberships;
- imports users and stores original IDs in `import_id` custom fields;
- imports a two-level Discourse category tree from vBulletin forums;
- imports topics with views, visibility and sticky/pinned state;
- imports replies and attempts reply-to relationships;
- converts common vBulletin BBCode to Discourse/Markdown;
- imports private messages;
- imports file/database attachments;
- imports bans/suspensions;
- creates `thread/<old_thread_id>` topic permalinks.

## 5. Install GISVN legacy URL compatibility

After the import completes successfully, run:

```bash
RAILS_ENV=production bundle exec rails runner \
  script/gisvn/install_vbulletin_permalinks.rb
```

This adds idempotent canonical permalink records for old topic, forum, member
and post IDs, then appends vBulletin URL normalization rules for common forms
such as:

```text
showthread.php/6334-Tham-khao-trang-WebGIS-hoan-chinh
showthread.php?t=6334
forumdisplay.php/54-Giai-dap-thac-mac-ve-WebGIS
forumdisplay.php?f=54
member.php/8997-AtranDN
member.php?u=8997
```

The historical Wayback snapshot uses the path-style forms, so those forms
should be part of staging acceptance tests.

The automatic installer creates mappings for every imported ID it can derive.
`script/gisvn/export_vbulletin_mappings.rb` then exports the complete mapping
inventory to CSV for redirect sampling and audit. This avoids hand-writing
thousands of `showthread.php` / `forumdisplay.php` rows.

The generic CSV importer
`script/gisvn/import_legacy_permalinks.rb` remains available only for
exceptional URLs that cannot be derived from imported IDs.

## 6. Validate migration quality

Sample old content from every major area:

- ArcGIS / ESRI;
- MapInfo;
- MicroStation/Bentley;
- Viễn thám;
- WebGIS;
- Trắc địa và bản đồ;
- Mã nguồn mở;
- Nghiên cứu khoa học;
- Tài liệu học tập;
- Hội thảo/OFFLINE;
- Việc làm;
- Relax.

For each sample, verify title, author, timestamp, Vietnamese text, inline
images, attachment downloads, quotes, code blocks and old URL redirects.

## 7. R2 comes after content validation

Do not combine the first vBulletin import test and the first R2 migration into
one irreversible step.

Recommended order:

1. prove database/content import locally;
2. prove legacy redirects;
3. take a clean Discourse backup;
4. configure R2 uploads;
5. test new upload + thumbnail + avatar;
6. migrate existing Discourse uploads to R2;
7. test backup and restore separately;
8. only then plan production cutover.
