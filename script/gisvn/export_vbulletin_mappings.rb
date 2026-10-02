# frozen_string_literal: true

require "csv"

# Export every imported vBulletin ID -> Discourse target mapping for audit,
# redirect tests, CDN rules, or external search-engine migration tooling.
#
# Run:
#   GISVN_MAPPING_OUTPUT=/var/tmp/gisvn-vbulletin-redirects.csv \
#   RAILS_ENV=production bundle exec rails runner \
#     script/gisvn/export_vbulletin_mappings.rb

output =
  ENV["GISVN_MAPPING_OUTPUT"].presence ||
    Rails.root.join("tmp", "gisvn-vbulletin-redirects.csv").to_s

rows = []

PostCustomField
  .includes(post: :topic)
  .where(name: "import_id")
  .find_each do |field|
    post = field.post
    next unless post

    import_id = field.value.to_s

    if (match = import_id.match(/\Athread-(\d+)\z/))
      old_id = match[1]
      rows << {
        kind: "thread",
        old_id: old_id,
        discourse_id: post.topic_id,
        canonical_key: "thread/#{old_id}",
        target_url: post.topic&.relative_url,
        path_style: "showthread.php/#{old_id}-legacy",
        query_style: "showthread.php?t=#{old_id}",
      }
    elsif import_id.match?(/\A\d+\z/)
      rows << {
        kind: "post",
        old_id: import_id,
        discourse_id: post.id,
        canonical_key: "post/#{import_id}",
        target_url: post.relative_url,
        path_style: "showthread.php?p=#{import_id}",
        query_style: "showthread.php?p=#{import_id}",
      }
    end
  end

CategoryCustomField
  .includes(:category)
  .where(name: "import_id")
  .find_each do |field|
    category = field.category
    old_id = field.value.to_s
    next unless category && old_id.match?(/\A\d+\z/)

    rows << {
      kind: "forum",
      old_id: old_id,
      discourse_id: category.id,
      canonical_key: "forum/#{old_id}",
      target_url: category.relative_url,
      path_style: "forumdisplay.php/#{old_id}-legacy",
      query_style: "forumdisplay.php?f=#{old_id}",
    }
  end

UserCustomField
  .includes(:user)
  .where(name: "import_id")
  .find_each do |field|
    user = field.user
    old_id = field.value.to_s
    next unless user && old_id.match?(/\A\d+\z/)

    rows << {
      kind: "member",
      old_id: old_id,
      discourse_id: user.id,
      canonical_key: "member/#{old_id}",
      target_url: user.relative_url,
      path_style: "member.php/#{old_id}-legacy",
      query_style: "member.php?u=#{old_id}",
    }
  end

rows.sort_by! { |row| [row[:kind], row[:old_id].to_i] }

FileUtils.mkdir_p(File.dirname(output))

CSV.open(output, "w") do |csv|
  csv << %w[kind old_id discourse_id canonical_key target_url path_style query_style]
  rows.each do |row|
    csv << [
      row[:kind],
      row[:old_id],
      row[:discourse_id],
      row[:canonical_key],
      row[:target_url],
      row[:path_style],
      row[:query_style],
    ]
  end
end

puts "GISVN vBulletin mapping export complete."
puts "rows=#{rows.length}"
puts "output=#{output}"

rows.group_by { |row| row[:kind] }.sort.each do |kind, kind_rows|
  puts "#{kind}=#{kind_rows.length}"
end
