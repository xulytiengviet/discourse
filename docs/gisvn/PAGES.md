# GISVN trên GitHub Pages

URL: https://xulytiengviet.github.io/discourse/

Workflow `.github/workflows/gisvn-pages.yml` xuất bản trực tiếp nội dung
`docs/gisvn/classic` vào gốc của site. Tệp `index.html`, CSS, JavaScript, dữ liệu
và ảnh dùng đường dẫn tương đối nên hoạt động dưới tiền tố `/discourse/`.
Thay đổi thư mục này trên nhánh `main` sẽ tự triển khai; cũng có thể chạy workflow
thủ công từ Actions.

Trong Settings → Pages, chọn Source **GitHub Actions**. Nếu Pages chưa được bật,
cần bật ở đây một lần; token mặc định của workflow không có quyền bật dịch vụ.

Đây là bản phục dựng chỉ đọc. GitHub Pages phục vụ giao diện tĩnh; tài khoản,
đăng bài và plugin GIS của Discourse cần một máy chủ Discourse riêng.
