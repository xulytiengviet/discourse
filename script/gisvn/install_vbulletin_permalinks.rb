# frozen_string_literal: true

# Installs idempotent GISVN/vBulletin legacy permalinks after running the
# built-in Discourse vBulletin 4 importer.
#
# It uses import_id custom fields created by the importer and creates canonical
# intermediate permalinks:
#
#   thread/<old_thread_id> -> Discourse topic
#   forum/<old_forum_id>   -> Discourse category
#   member/<old_user_id>   -> Discourse user
#   post/<old_post_id>     -> Discourse post
#
# It also appends normalization rules so common vBulletin 4 URLs resolve to
# those canonical permalink keys.
#
# Run:
#   RAILS_ENV=production bundle exec rails runner \
#     script/gisvn/install_vbulletin_permalinks.rb

NORMALIZATION_RULES = [
  # Post-specific rules must run before general showthread rules.
  %q{/showthread\.php.*[?&]p=(\d+).*/post/\1},
  %q{/showpost\.php.*[?&]p=(\d+).*/post/\1},
  %q{/showthread\.php\/(\d+).*/thread/\1},
  %q{/showthread\.php.*[?&]t=(\d+).*/thread/\1},
  %q{/forumdisplay\.php\/(\d+).*/forum/\1},
  %q{/forumdisplay\.php.*[?&]f=(\d+).*/forum/\1},
  %q{/member\.php\/(\d+).*/member/\1},
  %q{/member\.php.*[?&]u=(\d+).*/member/\1},
  %q{/forum\.php.*/gisvn-home},
].freeze

def upsert_permalink(url:, topic_id: nil, post_id: nil, category_id: nil, user_id: nil)
  permalink = Permalink.find_or_initialize_by(url: url)
  created = permalink.new_record?

  permalink.topic_id = topic_id
  permalink.post_id = post_id
  permalink.category_id = category_id
  permalink.user_id = user_id
  permalink.tag_id = nil
  permalink.external_url = nil
  permalink.save!

  created ? :created : :updated
end

counts = Hash.new(0)

home = Permalink.find_or_initialize_by(url: "gisvn-home")
home.topic_id = nil
home.post_id = nil
home.category_id = nil
home.tag_id = nil
home.user_id = nil
home.external_url = "/categories"
home.save!
counts[:home] += 1

PostCustomField
  .includes(:post)
  .where(name: "import_id")
  .find_each do |field|
    post = field.post
    next unless post

    import_id = field.value.to_s

    if (match = import_id.match(/\Athread-(\d+)\z/))
      state = upsert_permalink(url: "thread/#{match[1]}", topic_id: post.topic_id)
      counts[:"topic_#{state}"] += 1
    elsif import_id.match?(/\A\d+\z/)
      state = upsert_permalink(url: "post/#{import_id}", post_id: post.id)
      counts[:"post_#{state}"] += 1
    end
  end

CategoryCustomField
  .includes(:category)
  .where(name: "import_id")
  .find_each do |field|
    category = field.category
    old_id = field.value.to_s
    next unless category && old_id.match?(/\A\d+\z/)

    state = upsert_permalink(url: "forum/#{old_id}", category_id: category.id)
    counts[:"category_#{state}"] += 1
  end

UserCustomField
  .includes(:user)
  .where(name: "import_id")
  .find_each do |field|
    user = field.user
    old_id = field.value.to_s
    next unless user && old_id.match?(/\A\d+\z/)

    state = upsert_permalink(url: "member/#{old_id}", user_id: user.id)
    counts[:"user_#{state}"] += 1
  end

existing_rules = SiteSetting.permalink_normalizations.to_s.split("|").reject(&:blank?)
# Put GISVN's post-specific rule first so a URL containing ?p=<post_id>
# is not consumed by a broader showthread topic rule.
merged_rules = (NORMALIZATION_RULES + existing_rules).uniq
SiteSetting.permalink_normalizations = merged_rules.join("|")

puts "GISVN vBulletin permalink installation complete."
counts.sort.each { |name, count| puts "#{name}=#{count}" }
puts "normalization_rules=#{merged_rules.length}"
