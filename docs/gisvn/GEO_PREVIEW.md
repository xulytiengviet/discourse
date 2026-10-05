# GISVN geospatial previews in Discourse posts

Phase 3 adds lazy in-post preview cards for links ending in:

- `.geojson`
- `.kml`
- `.pmtiles`

The implementation lives in the GISVN theme initializer:

```text
themes/gisvn/javascripts/discourse/api-initializers/gisvn-geo-preview.js
```

## Runtime design

The preview is intentionally **lazy**. A map is not created until the reader
clicks **Xem bản đồ**. This avoids loading WebGL and large geodata for every post
on a topic page.

Pinned browser dependencies:

- MapLibre GL JS `6.11.2`
- PMTiles JS `4.5.0`

MapLibre v6 is ESM-only. The theme loads the pinned ESM build and CSS from
`unpkg.com`. PMTiles is also loaded as a pinned ESM module. If your Discourse
Content Security Policy blocks that host, either allow the exact host for this
theme or self-host these pinned assets and change the three constants at the top
of `gisvn-geo-preview.js`.

Do not use unversioned or `@latest` dependency URLs.

## GeoJSON

The preview accepts FeatureCollection, Feature, or a bare GeoJSON geometry.
The browser download is capped at 12 MiB for inline preview. Larger data should
be converted to PMTiles or opened/downloaded directly.

No external basemap is requested. The data is rendered over a neutral
background so the forum does not silently depend on a third-party tile service.

## KML

The built-in lightweight parser supports the common GISVN cases:

- Point
- LineString
- Polygon, including inner rings

It keeps Placemark `name` and `description` in feature properties. Complex
KML constructs such as NetworkLink, gx:Track, 3D models, GroundOverlay and
style cascades are intentionally not interpreted by the inline preview.

## PMTiles

The preview reads PMTiles directly in the browser using HTTP Range Requests.

Raster archives are shown as raster layers. Vector/MLT archives are styled
generically from `vector_layers` or `tilestats.layers` metadata. For a
publication-quality cartographic style, authors should still provide a
dedicated MapLibre style/application rather than relying on this generic forum
preview.

## Cloudflare R2 CORS for PMTiles

For a public R2 custom domain used by the forum, the PMTiles storage origin
should allow the forum origin to issue `GET`/`HEAD` requests and Range
requests. Example:

```json
[
  {
    "AllowedOrigins": ["https://forum.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "If-Match"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the origin with the real GISVN forum origin. Avoid `*` in production
when a narrow origin is practical.

Uploads handled by Discourse may need a separate CORS rule that also allows the
headers/methods required for browser upload. Keep PMTiles/public read behavior
and write/upload behavior explicit.

## Author workflow

A post only needs a normal link:

```text
https://files.example.com/datasets/quy-hoach.geojson
https://files.example.com/datasets/ranh-gioi.kml
https://tiles.example.com/vietnam.pmtiles
```

After Discourse cooks the post, the GISVN theme detects the extension and adds
the preview card underneath the link. The original link is preserved.
