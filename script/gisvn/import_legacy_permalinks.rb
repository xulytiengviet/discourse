# frozen_string_literal: true

require "csv"
require "uri"

# Imports legacy GISVN/vBulletin URL redirects into Discourse's Permalink table.
#
# CSV columns:
#   old_path,new_url
#
# Examples:
#   forumdisplay.php/54-Giai-dap-thac-mac-ve-WebGIS,/c/webgis/54
#   showthread.php/6334-Tham-khao-trang-WebGIS-hoan-chinh,/t/tham-khao-trang-webgis-hoan-chinh/6334
#
# Run:
#   RAILS_ENV=production bundle exec rails runner \
#     script/gisvn/import_legacy_permalinks.rb docs/gisvn/legacy-permalinks.example.csv

csv_path = ARGV.first || ENV["GISVN_PERMALINK_CSV"]

abort "Provide a CSV path as the first argument or GISVN_PERMALINK_CSV." if csv_path.blank?
abort "CSV not found: #{csv_path}" unless File.file?(csv_path)

def legacy_path(value)
  raw = value.to_s.strip
  return if raw.blank?

  begin
    uri = URI.parse(raw)
    raw = uri.request_uri if uri.absolute? && uri.host
  rescue URI::InvalidURIError
    # Keep the raw path; Discourse will normalize it below.
  end

  raw.sub(%r{\A/+}, "")
end

created = 0
updated = 0
skipped = 0
failed = 0

CSV.foreach(csv_path, headers: true).with_index(2) do |row, line|
  source = legacy_path(row["old_path"])
  destination = row["new_url"].to_s.strip

  if source.blank? || destination.blank?
    skipped += 1
    puts "[skip line #{line}] missing old_path or new_url"
    next
  end

  begin
    permalink = Permalink.find_or_initialize_by(url: Permalink.normalize_url(source))
    was_new = permalink.new_record?

    permalink.topic_id = nil
    permalink.post_id = nil
    permalink.category_id = nil
    permalink.tag_id = nil
    permalink.user_id = nil
    permalink.external_url = destination
    permalink.save!

    was_new ? created += 1 : updated += 1
    puts "[#{was_new ? 'created' : 'updated'}] #{source} -> #{destination}"
  rescue StandardError => e
    failed += 1
    warn "[failed line #{line}] #{source}: #{e.class}: #{e.message}"
  end
end

puts
puts "GISVN permalink import complete."
puts "created=#{created} updated=#{updated} skipped=#{skipped} failed=#{failed}"

exit(1) if failed.positive?
