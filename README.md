# GISVN Community theme 2.1

Giao diện GISVN do Long Ngo / GISVN Community phát triển: nhận diện xanh, chuyên mục,
thông báo và TopX. Gói này là một theme Discourse độc lập, với `about.json` ngay tại gốc.
Giấy phép GPL-2.0-only, giữ nguyên giấy phép của nguồn đã tách từ fork Discourse.

## Cài đặt

Trong Discourse Admin → Appearance → Themes → Install → From a Git repository:

- URL: `https://github.com/xulytiengviet/discourse`
- Branch (Advanced): `gisvn-theme`

Đây là nhánh phân phối chỉ chứa theme, không phải nhánh `main` chứa Discourse core.
Tên repository riêng dự kiến: `xulytiengviet/discourse-gisvn-theme`; chỉ dùng URL đó
sau khi repository thực sự được tạo và đẩy mã bằng `script/gisvn/publish_phase4.sh`.

Thay theme GISVN cũ bằng theme này. Không kích hoạt đồng thời hai bản GISVN.
Theme không cần plugin GIS để hiển thị và không tự tải thư viện bản đồ.

## Phần GIS

Preview bản đồ đã chuyển sang plugin `discourse-gisvn-geo`. Plugin dùng được với theme
GISVN hoặc theme Discourse khác. Theme không còn decorator hoặc CSS bản đồ Phase 3.
Các script tạo chuyên mục/migration vẫn là công cụ vận hành riêng trong fork;
chúng không phải điều kiện để cài theme.

## Nguồn và giới hạn

Tách từ `themes/gisvn` tại Phase 3 commit `37c583eac9e5c3c3d5173db9927c9cd19501d827`.
TopX giữ cách hoạt động hiện có: Hot/Xem nhiều được sắp xếp trong tập bài lấy từ
`/latest.json`, không phải bảng xếp hạng toàn bộ lịch sử diễn đàn.
Gói sử dụng frontend API của Discourse tại commit nguồn; cần smoke test trên phiên bản
Discourse thực tế trước khi thay theme đang chạy.

## Phục dựng giao diện 2.1

Đã cập nhật theo GISForum và HTML gốc 06/03/2016: logo gốc, icon forum, header xanh, TopX và các hàng chuyên mục. Theme dùng dữ liệu Discourse live; số liệu lịch sử chỉ nằm trong bản classic lưu trữ. TopX đã chuyển sang các endpoint latest, top tháng và latest sắp theo views; thông tin mô tả TopX 2.0 ở trên chỉ áp dụng cho phiên bản trước. Giữ nguyên nguồn ảnh GISVN/Wayback, không tái cấp phép các ảnh đó.
