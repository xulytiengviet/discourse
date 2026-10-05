# discourse-gisvn-geo

Plugin GIS độc lập cho Discourse, do Long Ngo / GISVN Community phát triển.
Không yêu cầu fork Discourse hoặc theme GISVN. GPL-2.0-only.

## Chức năng

| Tệp | Preview |
| --- | --- |
| GeoJSON | FeatureCollection, Feature, Geometry, GeometryCollection; popup thuộc tính |
| KML | Point, LineString, Polygon có lỗ, MultiGeometry, ExtendedData |
| KMZ | Giải nén KML trong bộ nhớ: ưu tiên `doc.kml`, nếu không có chọn tên KML đầu theo thứ tự chữ |
| GPX | Waypoint, route, track, nhiều track segment |
| PMTiles | Raster PNG/JPEG/WebP/AVIF và vector MVT; tạo style từ `vector_layers`/`tilestats` |
| `.style.json` | MapLibre Style v8 với PMTiles, inline GeoJSON hoặc URL tile; giữ màu và source-layer |

Chỉ tải thư viện và dữ liệu khi bấm **Xem bản đồ**. Có popup thuộc tính, tọa độ
kinh/vĩ độ WGS84, zoom, thước tỷ lệ, toàn màn hình (nếu trình duyệt hỗ trợ), mở/tải tệp gốc,
xuất GeoJSON từ GeoJSON/KML/KMZ/GPX và nút đóng để giải phóng WebGL.
Giữ nguyên link trong bài khi preview lỗi hoặc bị tắt.

## Cài trên Discourse Docker

Nhánh phân phối `gisvn-geo-plugin` có `plugin.rb` ngay tại gốc. Thêm trong
`hooks.after_code.exec.cmd` của `/var/discourse/containers/app.yml`:

```yaml
- git clone --single-branch --branch gisvn-geo-plugin https://github.com/xulytiengviet/discourse.git discourse-gisvn-geo
```

Lệnh này chạy trong thư mục `$home/plugins`, cùng chỗ với các plugin khác. Sau đó:

```bash
cd /var/discourse
./launcher rebuild app
```

Tên repository riêng dự kiến là `xulytiengviet/discourse-gisvn-geo`; chưa dùng URL đó
cho đến khi đã tạo repository. Các bundle trong `public/` được commit sẵn;
server production không cần Node/pnpm để biên dịch plugin.

Trong Admin → Settings, tìm `gisvn_geo`:

- `gisvn_geo_enabled`: bật/tắt plugin.
- `gisvn_geo_allowed_origins`: danh sách origin chính xác, ví dụ `https://files.gis.vn`.
  Mặc định chỉ cho dữ liệu cùng origin với forum. Không dùng `*`.
- `gisvn_geo_max_file_mb`: mặc định 12 MiB, áp dụng cho tệp và KML giải nén.
- `gisvn_geo_max_cards_per_post`: mặc định 4.

Thêm `geojson|kml|kmz|gpx|pmtiles|json` vào `authorized_extensions` nếu muốn thành viên
upload các loại này; plugin không tự thay đổi chính sách upload. PMTiles lớn nên đặt
trên R2 rồi dán link vào bài. Đặt tên style là `*.style.json`; `.json` thông thường
không tự động được coi là bản đồ. Link upload bị đổi tên được nhận diện thêm qua tên
gốc trong anchor. URL tệp phải trả dữ liệu trực tiếp, không redirect; dùng CDN origin
cuối cùng đã cho phép. Secure upload redirect cần một tích hợp riêng, không được tự
chuyển tệp riêng tư thành public để dùng preview.

## Cloudflare R2

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

Khai báo origin R2/CDN trong `gisvn_geo_allowed_origins`. PMTiles bắt buộc trả HTTP 206
và `Content-Range`. Tệp PMTiles mẫu trong `examples/` là ô raster tổng hợp để kiểm thử,
không phải dữ liệu địa lý Việt Nam. Không cấu hình R2 secret trong plugin/browser.
Worker, JS và CSS phục vụ từ plugin, không cần mở CSP cho unpkg. Nếu forum dùng CSP
tùy chỉnh, cho phép module worker cùng origin; không tắt CSP.

## Giới hạn rõ ràng

- Dữ liệu vector preview cần WGS84 longitude/latitude. Không tự chuyển VN-2000/UTM.
- Không tải KML NetworkLink, GroundOverlay, ảnh/model hoặc tài nguyên nhúng KMZ;
  không tái hiện toàn bộ styling KML. Nhiều KML trong KMZ chỉ đọc một tệp.
- PMTiles vector cần MVT và metadata lớp; chưa hỗ trợ MLT. Raster không có thuộc tính đối tượng.
- Style chỉ cho `source.url` dạng `pmtiles://`; TileJSON gián tiếp bị từ chối.
  `tiles`/sprites/glyphs cần origin được cho phép. Remote GeoJSON trong style bị từ chối;
  dùng inline GeoJSON hoặc liên kết `.geojson` riêng để áp dụng giới hạn streaming.
- Tối đa 50.000 features, 250.000 tọa độ, 500 style layers, 1.024 ZIP entries.
- Thuộc tính hiển thị bằng text, tối đa 60 trường/2.000 ký tự mỗi giá trị.
- Nút tệp gốc có thể mở tab với URL khác origin vì trình duyệt không bắt buộc thực thi
  thuộc tính `download`; đây không phải tải proxy qua server.
- Chưa chạy tích hợp Rails/Ember đầy đủ trong phiên phát triển này. Cần staging trước production.

## Phát triển

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:browser
```

`src/` là runtime độc lập, bundler xử lý npm ở bước build. Frontend Discourse chỉ
dùng API Discourse và `loadScript`, không import npm trực tiếp. `scripts/build.mjs`
đóng gói runtime + module worker, xuất SHA-256; commit bundle sau mỗi thay đổi nguồn.
Browser test kiểm tra WebGL, HTTP Range, controls và cleanup với fixtures tự tạo.

API tham chiếu: [Discourse Plugin API](https://github.com/discourse/discourse/blob/main/docs/developer-guides/docs/03-code-internals/12-pluginapi.md),
[PMTiles MapLibre](https://docs.protomaps.com/pmtiles/maplibre),
[MapLibre](https://maplibre.org/maplibre-gl-js/docs/).
