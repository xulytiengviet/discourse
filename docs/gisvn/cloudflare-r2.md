# Cloudflare R2 runbook for GISVN Discourse

Use two buckets in production:

- `gisvn-uploads` — public read through a Cloudflare custom domain, e.g.
  `https://files.example.com`.
- `gisvn-backups` — private. Do not expose it through a public custom domain.

Create bucket-scoped R2 S3 credentials with **Object Read & Write** access.
Do not use a general Cloudflare API token as the S3 access key.

## app.yml example

Add the following under `env:` and replace every placeholder:

```yaml
DISCOURSE_USE_S3: "true"
DISCOURSE_S3_REGION: "auto"
DISCOURSE_S3_ENDPOINT: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
DISCOURSE_S3_FORCE_PATH_STYLE: "true"

DISCOURSE_S3_ACCESS_KEY_ID: "<R2_ACCESS_KEY_ID>"
DISCOURSE_S3_SECRET_ACCESS_KEY: "<R2_SECRET_ACCESS_KEY>"

DISCOURSE_S3_BUCKET: "gisvn-uploads"
DISCOURSE_S3_CDN_URL: "https://files.example.com"

# Optional after uploads are stable and a restore test has passed:
DISCOURSE_BACKUP_LOCATION: "s3"
DISCOURSE_S3_BACKUP_BUCKET: "gisvn-backups"

# Compatibility guard for AWS SDK / R2 checksum negotiation.
AWS_REQUEST_CHECKSUM_CALCULATION: "when_required"
AWS_RESPONSE_CHECKSUM_VALIDATION: "when_required"
```

If your current Discourse release exposes the newer S3 setting names in the
admin UI (`enable_s3_uploads`, `s3_upload_bucket`, etc.), use the names
documented by that release. Do not mix database-only S3 settings and container
environment settings during a migration unless you explicitly use the
Discourse DB S3 configuration mode.

## Publish front-end assets during rebuild

For deployments that serve Discourse assets through the configured S3/R2 path,
add this hook:

```yaml
hooks:
  after_assets_precompile:
    - exec:
        cd: $home
        cmd:
          - sudo -E -u discourse bundle exec rake s3:upload_assets
          - sudo -E -u discourse bundle exec rake s3:expire_missing_assets
```

Then rebuild:

```bash
cd /var/discourse
./launcher rebuild app
```

## R2 CORS

For browser/direct uploads, configure CORS on the uploads bucket. Replace the
origin with the real forum origin:

```json
[
  {
    "AllowedOrigins": ["https://forum.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Authorization", "Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

After changing CORS on a bucket already served through a custom domain, purge
the Cloudflare cache for that hostname so stale CORS headers are not retained.

## Safe migration sequence

1. Make a verified local/off-site Discourse backup.
2. Configure the empty uploads bucket and custom domain.
3. Rebuild the container.
4. Upload assets and verify CSS/JS/logo/avatar delivery.
5. Upload a new image through the composer and verify thumbnails and originals.
6. Only then migrate old uploads:

```bash
cd /var/www/discourse
sudo -E -u discourse bundle exec rake uploads:migrate_to_s3
```

7. Verify a representative sample of old images and attachments.
8. Run a new Discourse backup.
9. If R2 backups are enabled, perform a full restore test to a separate test
   instance before relying on R2 as the only backup destination.

Do not run upload cleanup until migration and restore verification are complete.

## Notes specific to R2

- R2's S3 region is `auto`; `us-east-1` is accepted as an alias when a tool
  cannot use `auto`.
- The S3 endpoint is
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- Use a Cloudflare R2 custom domain for public upload delivery. Keep S3 API
  credentials private.
- R2 backup compatibility improved in 2026, but large multipart backups have
  also had AWS SDK interoperability regressions. Treat backup success and full
  restore success as two separate tests.
- Keep at least one independent backup copy outside the live forum and outside
  the uploads bucket.
- Cloudflare's 2026 Standard free tier is 10 GB-month storage, 1 million Class A
  operations and 10 million Class B operations per month; Internet egress is
  free. Pricing can change, so check Cloudflare before production sizing.

## References

- Cloudflare R2 S3 API compatibility:
  https://developers.cloudflare.com/r2/api/s3/api/
- Cloudflare R2 CORS:
  https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare R2 pricing:
  https://developers.cloudflare.com/r2/pricing/
- Discourse Meta, S3-compatible object storage:
  https://meta.discourse.org/t/configure-an-s3-compatible-object-storage-provider-for-uploads/148916
- Discourse Meta, Cloudflare R2 setup discussion:
  https://meta.discourse.org/t/how-to-configure-cloudflare-r2-for-your-discourse-community/349512
