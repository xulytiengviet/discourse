# Phục dựng GISVN từ GISForum và HTML gốc

Nguồn được yêu cầu: https://base27-cvnss.github.io/GISForum/docs/

Repository nguồn: `Base27-CVNSS/GISForum`, commit
`fca154f053966fb657b03b1bc614d0a940dd9881`.

## Đã thu thập

| Nguồn | Dữ liệu thực có |
| --- | --- |
| Toàn bộ repository GISForum | 633 tệp, gồm trang classic/modern/archive và bộ locale Flarum; lưu nguyên trong `sources/GISForum-fca154f.tar.gz` |
| Trang GISForum docs | 19 nhóm, 49 chuyên mục, thông báo, danh sách thành viên/bài mới mẫu, số liệu tổng |
| HTML gốc do người dùng cung cấp | 19 nhóm; 50 hàng cấp hai (49 forum và nhóm AutoCAD), thêm 2 forum con AutoCAD; 15 thành viên và 15 dòng TopX |
| Liên kết lịch sử trong HTML | 209 đích forum/thread/member/post khác nhau, lưu URL Wayback; chưa có nội dung các đích này |
| Hình ảnh tham chiếu trong HTML | Khôi phục 27/28 tài nguyên ảnh GISVN, gồm logo chính và biểu tượng forum; có checksum/nguồn từng tệp |

Không có database vBulletin, nội dung đầy đủ các topic, attachment người dùng hoặc
manifest 863 Wayback entries trong repository này. Con số 863 chỉ là nội dung mô tả
của nguồn. Các tiêu đề/link không được coi là nội dung bài viết đã khôi phục.

## Hai snapshot khác nhau

| Snapshot | Chủ đề | Bài gửi | Thành viên |
| --- | ---: | ---: | ---: |
| HTML gốc 06/03/2016 | 4.239 | 24.627 | 101.013 |
| GISForum static reconstruction | 4.297 | 24.799 | 101.617 |

`classic/index.html` có bộ chọn nguồn. Số liệu, tiêu đề, ngày và tác giả của hai
snapshot được giữ riêng; không dùng số thống kê cũ làm số đếm live của Discourse.
Ảnh `images/statusicon/category_forum_old.png` chưa tải được; danh mục AutoCAD dùng
biểu tượng forum đã khôi phục. Logo và các ảnh Wayback vẫn giữ nguồn/điều kiện gốc,
không được tuyên bố là tài sản mới dưới MIT. Giấy phép MIT của GISForum được giữ
trong `sources/GISForum-LICENSE`.

## Bản classic

Mở `classic/index.html` qua web server tĩnh hoặc file HTML tự chứa được cung cấp kèm.
Header xanh, logo GISVN gốc, khung banner, thanh menu, thông báo vàng, TopX, forum
rows và cột bài cuối được đối chiếu với ảnh gốc. Dữ liệu dài giữ mật độ cổ điển;
mobile xuống một cột và không tràn ngang.

Các liên kết chuyên mục mở thông tin thực đã có và link Wayback tương ứng. Không
tạo trang bài viết giả. Đăng nhập/đăng ký trong bản lưu mở giải thích chế độ chỉ đọc,
không thu mật khẩu. Search, đổi snapshot, thu gọn, dialog chuyên mục hoạt động offline.

## Theme Discourse 2.1

`themes/gisvn` và `packages/discourse-gisvn-theme` có cùng giao diện mới; gói theme
được phân phối ở nhánh `gisvn-theme`. Preview GIS vẫn ở plugin Phase 4 riêng biệt.

Theme dùng tài khoản, topic, category và số liệu thật qua Discourse. TopX có ba tab
thực: latest, top tháng và latest sắp theo views. Khối thành viên ghi rõ là thành
viên tham gia, không giả định họ là thành viên mới đăng ký. Thông báo lấy pinned topics.
Danh sách chuyên mục dùng `site.categories` theo quyền truy cập hiện hành. Nhóm
AutoCAD được giữ dưới dạng danh mục con khi database có hierarchy tương ứng.

Script dưới đây **mặc định chỉ báo cáo**, chưa được chạy trên server/database:

```bash
RAILS_ENV=production bundle exec rails runner script/gisvn/import_classic_taxonomy.rb
```

Sau khi xem mapping trên staging, có thể áp dụng với `GISVN_APPLY=1`. Hierarchy gốc
cần `max_category_nesting >= 3`; script không tự thay đổi thiết lập đó. Tên lưu trong
DB tối đa 50 ký tự theo validation của Discourse; theme dùng slug để hiển thị tên
gốc đầy đủ. Script không ghi số đếm lịch sử, không tạo tài khoản/bài giả, không ghi
đè category không thuộc bộ quản lý, không sửa category đã import có `import_id`.

## Kiểm tra

- Đã kiểm kê đủ 633 tệp và tạo SHA-256 từng tệp nguồn.
- Browser test: 19 groups, 49 reference forums, 50 original rows + 2 subforums;
  số liệu riêng theo snapshot, ảnh, dialog, tìm kiếm, collapse, không lỗi JS;
  không tràn ngang ở 390/768/1280 px.
- Thành phần Glimmer theme đã biên dịch; script Python và JavaScript kiểm tra cú pháp.
- Runtime hiện không có Ruby/Rails: đã thử `bin/lint --fix` nhưng không chạy được;
  cần kiểm thử theme trên Discourse staging trước production.

Lệnh browser test từ root repo:

```bash
node script/gisvn/test_classic.mjs
```

Trích xuất lại: Python 3 + lxml, clone nguồn đúng commit, sau đó:

```bash
python script/gisvn/extract_classic_source.py \
  --source /path/to/GISForum \
  --original-html docs/gisvn/sources/gisvn-20160306.html.txt
```
