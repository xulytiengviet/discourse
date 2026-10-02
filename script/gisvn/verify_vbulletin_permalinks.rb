# frozen_string_literal: true

# Verifies every imported vBulletin thread/forum ID can be resolved through both
# path-style and query-style legacy URLs after
# script/gisvn/install_vbulletin_permalinks.rb has run.
#
# Run:
#   RAILS_ENV=production bundle exec rails runner \
#     script/gisvn/verify_vbulletin_permalinks.rb

failures = []
checked = 0

def verify_target(path, expected_type, expected_id, failures)
  permalink = Permalink.find_by_url(path)

  if permalink.nil?
    failures << "#{path} -> missing"
    return
  end

  actual_id =
    case expected_type
    when :topic
      permalink.topic_id
    when :category
      permalink.category_id
    else
      nil
    end

  return if actual_id.to_i == expected_id.to_i

  failures << "#{path} -> expected #{expected_type}=#{expected_id}, got #{permalink.target_url.inspect}"
end

PostCustomField
  .includes(post: :topic)
  .where(name: "import_id")
  .where("value LIKE 'thread-%'")
  .find_each do |field|
    match = field.value.to_s.match(/\Athread-(\d+)\z/)
    next unless match && field.post&.topic_id

    old_id = match[1]
    expected = field.post.topic_id

    verify_target("showthread.php/#{old_id}-legacy", :topic, expected, failures)
    verify_target("showthread.php?t=#{old_id}", :topic, expected, failures)
    checked += 2
  end

CategoryCustomField
  .includes(:category)
  .where(name: "import_id")
  .find_each do |field|
    old_id = field.value.to_s
    next unless old_id.match?(/\A\d+\z/) && field.category

    expected = field.category.id

    verify_target("forumdisplay.php/#{old_id}-legacy", :category, expected, failures)
    verify_target("forumdisplay.php?f=#{old_id}", :category, expected, failures)
    checked += 2
  end

puts "GISVN legacy permalink verification"
puts "checked=#{checked}"
puts "failures=#{failures.length}"

failures.first(100).each { |failure| warn "[FAIL] #{failure}" }

if failures.length > 100
  warn "... #{failures.length - 100} additional failures omitted"
end

exit(1) if failures.any?
