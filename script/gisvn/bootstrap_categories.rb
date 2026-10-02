# frozen_string_literal: true

# Idempotent GISVN category bootstrap.
#
# Run from the Discourse root:
#   RAILS_ENV=production bundle exec rails runner script/gisvn/bootstrap_categories.rb
#
# The script creates/updates only the categories listed below. It never deletes
# existing categories, topics, users, or uploads.

PALETTE = %w[
  167EAD 15739E 2A8DB6 247DA4 3C8DA8 2A7FA9 1A789C 4089A0
  167EAD 247DA4 3C8DA8 2A7FA9 1A789C 4089A0 167EAD 247DA4
  3C8DA8 2A7FA9 1A789C
].freeze

STRUCTURE = [
  ["Nội quy & Tin tức", [
    "Nội quy diễn đàn",
    "Góp ý",
    "Tin tức diễn đàn - công nghệ",
  ]],
  ["Các phần mềm của hãng ESRI - ArcGIS, ArcView, ArcEngine, ArcSDE, ArcServer", [
    "Software ESRI - Không trao đổi tại đây",
    "Giải đáp thắc mắc ArcGIS, ArcView, ArcEngine, ArcSDE, ArcServer",
    "Lập trình trong ArcGIS",
  ]],
  ["Các phần mềm của hãng Pitney Bowes - MapInfo, Vertical, Discover, MapExtreme, MapBasic", [
    "Software MapInfo - Không trao đổi tại đây",
    "Giải đáp thắc mắc MapInfo, Vertical, Discover, MapExtreme, MapBasic",
    "Lập trình trong MapInfo",
  ]],
  ["Các phần mềm của Bentley - MicroStation, GEOVEC, IRASC, IRASB", [
    "Software Bentley - Không trao đổi tại đây",
    "Giải đáp thắc mắc MicroStation, GEOVEC, IRASC, IRASB",
    "Lập trình cho MicroStation",
  ]],
  ["Viễn thám", [
    "Software ENVI, ERDAS, PCI, IDRISI - Không trao đổi tại đây",
    "Giải đáp thắc mắc các phần mềm trong Viễn thám",
    "Lập trình trong Viễn thám",
  ]],
  ["WebGIS", [
    "Phần mềm WebGIS - Không trao đổi tại đây",
    "Giải đáp thắc mắc về WebGIS",
  ]],
  ["Trắc địa và bản đồ", [
    "Phần mềm Trắc địa - GPS - Không trao đổi tại đây",
    "Giải đáp thắc mắc Trắc địa, GPS và bản đồ",
  ]],
  ["Mã nguồn mở", [
    "Software mã nguồn mở - Không trao đổi tại đây",
    "Giải đáp thắc mắc trong Mã nguồn mở",
    "Lập trình cho mã nguồn mở",
  ]],
  ["Các phần mềm GIS khác", [
    "Software GIS khác - Không trao đổi tại đây",
    "Giải đáp thắc mắc về các phần mềm GIS khác",
  ]],
  ["Mô hình hóa", [
    "Software mô hình hóa - Không trao đổi tại đây",
    "Giải đáp thắc mắc trong Mô hình hóa",
  ]],
  ["Quản lý Đất đai", [
    "Nghiệp vụ quản lý đất đai",
    "Phần mềm và dữ liệu đất đai",
  ]],
  ["Các Tool của thành viên", [
    "Các phần mềm - công cụ viết tặng riêng cho diễn đàn từ các thành viên",
  ]],
  ["Công nghệ thông tin", [
    "AutoCAD và AutoCAD Map",
    "Các phần mềm IT",
    "Giải đáp thắc mắc trong CNTT",
  ]],
  ["Nghiên cứu khoa học", [
    "GIS và Viễn thám ứng dụng",
    "GPS, Trắc địa, Bản đồ ứng dụng",
  ]],
  ["Tài liệu học tập", [
    "Các môn liên quan đến GIS, Viễn thám",
    "Các môn liên quan đến GPS, Trắc địa, Bản đồ",
    "Các tài liệu khác",
    "Thư viện luận văn",
  ]],
  ["Đào tạo", [
    "Các khóa học (Ngắn hạn)",
    "Thông tin đào tạo (ĐH, CH, NCS)",
    "Thông tin học bổng, du học",
  ]],
  ["Hội thảo - OFFLINE diễn đàn", [
    "Thông tin tổ chức",
    "Bài báo cáo hội thảo",
    "Hình ảnh",
  ]],
  ["Việc làm", [
    "Người tìm việc",
    "Nhà tuyển dụng",
    "Tìm nơi thực tập tốt nghiệp ĐH, Thạc sĩ",
  ]],
  ["Relax", [
    "Truyện cười",
    "Kết bạn",
    "Mừng sinh nhật thành viên",
  ]],
].freeze

system_user = Discourse.system_user

def upsert_category(name:, parent:, color:, position:, user:)
  category = Category.find_or_initialize_by(name: name)

  if category.new_record?
    category.user = user
    category.text_color = "FFFFFF"
  end

  category.color = color
  category.parent_category_id = parent&.id
  category.position = position if category.respond_to?(:position=)
  category.save!

  puts "#{category.preload? ? '[preload]' : '[ok]'} #{parent ? '  ↳ ' : ''}#{category.name}"
  category
end

STRUCTURE.each_with_index do |(parent_name, children), parent_index|
  parent = upsert_category(
    name: parent_name,
    parent: nil,
    color: PALETTE.fetch(parent_index % PALETTE.length),
    position: parent_index,
    user: system_user,
  )

  children.each_with_index do |child_name, child_index|
    upsert_category(
      name: child_name,
      parent: parent,
      color: parent.color,
      position: child_index,
      user: system_user,
    )
  end
end

puts
puts "GISVN category bootstrap complete: #{STRUCTURE.length} top-level sections."
