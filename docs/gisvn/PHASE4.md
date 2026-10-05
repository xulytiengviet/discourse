# Phase 4 — theme và GIS plugin độc lập

Phase 3 có preview nằm trong `themes/gisvn`. Phase 4 chuyển preview sang plugin để
có thể nâng cấp Discourse core, theme và chức năng GIS riêng biệt.

## Các gói

- `packages/discourse-gisvn-theme`: theme hoàn chỉnh, root có `about.json`.
- `packages/discourse-gisvn-geo`: plugin hoàn chỉnh, root có `plugin.rb`, bundle tự phục vụ.
- `themes/gisvn`: bản theme trong fork đã bỏ preview Phase 3 để tránh hai decorator.

Hai nhánh phân phối cùng repository là `gisvn-theme` và `gisvn-geo-plugin`, chỉ chứa
nội dung từng gói tại gốc. Đây là phương án cài ngay trong lúc chờ tạo **hai repository
riêng**. Connector hiện có không hỗ trợ tạo repository mới; không coi việc xuất gói
hoặc tạo nhánh là đã tạo repository.

## Chuyển đổi

1. Trên staging cài plugin theo README của gói; giữ tên thư mục `discourse-gisvn-geo`.
2. Cài theme 2.0 từ nhánh phân phối; thay theme GISVN Phase 3 đang hoạt động.
3. Cấu hình origin uploads/R2 chính xác và upload extensions phù hợp.
4. Dán lần lượt các fixture trong `examples/`; kiểm tra popup, tọa độ, fullscreen,
   export GeoJSON, đóng/mở và chuyển topic. Không có hai thẻ preview cho cùng link.
5. Kiểm tra CSP, HTTP 206, người dùng thường/khách, mobile, theme sáng/tối và lỗi mạng.
6. Chạy Rails/Ember test của bản Discourse triển khai. Môi trường phát triển hiện tại
   không có Ruby/Rails, nên `bin/lint --fix` không chạy được; không coi unit test là
   chứng nhận tích hợp production.

Rollback: tắt `gisvn_geo_enabled`, gỡ plugin nếu cần rồi rebuild. Link gốc vẫn đọc được;
plugin không tạo bảng dữ liệu hoặc thay đổi bài viết/database.

## Xuất repository riêng

Khi có GitHub CLI đã đăng nhập quyền tạo repository cho `xulytiengviet`:

```bash
bash script/gisvn/publish_phase4.sh xulytiengviet
```

Script xuất hai thư mục có `.git` riêng từ gói đã kiểm tra, tạo hai repository public
bằng `gh repo create --source --push`, không sửa/xóa repository đã có. Sau khi thành công,
chuyển URL theme/plugin sang repository mới, branch `main`. Không còn phụ thuộc vào
fork Discourse để vận hành. Giữ `packages/` làm checkpoint nguồn của Phase 4;
các thay đổi tiếp theo nên thực hiện tại hai repository đích.
