# frozen_string_literal: true

# Default: report only. Set GISVN_APPLY=1 to create the source taxonomy.
require "json"

source = JSON.parse(File.read(File.join(__dir__, "data/gisforum-source.json")))
groups = source.fetch("original_20160306").fetch("groups")
apply = ENV["GISVN_APPLY"] == "1"

puts "GISVN classic taxonomy: #{groups.length} top-level groups; apply=#{apply}"
unless apply
  groups.each do |group|
    puts "[group #{group['id']}] #{group['title']}"
    group.fetch("forums").each do |forum|
      puts "  [forum #{forum['id']}] #{forum['title']}"
      forum.fetch("children", []).each { |child| puts "    [forum #{child['id']}] #{child['title']}" }
    end
  end
  puts "No changes. Run with GISVN_APPLY=1 on staging to create categories."
  exit
end

if SiteSetting.max_category_nesting < 3
  abort "The original AutoCAD hierarchy needs max_category_nesting >= 3. Configure it explicitly before applying."
end

def create_classic_category(record, prefix, parent, position)
  key = "#{prefix}:#{record.fetch('id')}"
  managed = CategoryCustomField.find_by(name: "gisvn_classic_key", value: key)&.category
  if managed
    puts "[existing] #{key} -> category #{managed.id}"
    return managed
  end

  imported = CategoryCustomField.find_by(name: "import_id", value: record.fetch("id").to_s)&.category
  if imported
    puts "[already imported] #{key} -> category #{imported.id}; unchanged"
    return imported
  end

  name = record.fetch("title")[0, 50]
  conflict = Category.find_by(name: name, parent_category_id: parent&.id)
  if conflict
    abort "Unmanaged category already has name #{name.inspect}. Resolve the mapping before applying; nothing is overwritten."
  end

  category = Category.create!(
    name: name,
    slug: "gisvn-#{prefix}-#{record.fetch('id')}",
    parent_category_id: parent&.id,
    user: Discourse.system_user,
    color: "1D78A8",
    text_color: "FFFFFF",
    position: position,
  )
  category.custom_fields["gisvn_classic_key"] = key
  category.custom_fields["gisvn_classic_full_title"] = record.fetch("title")
  category.save_custom_fields
  puts "[created] #{key} -> category #{category.id}"
  category
end

Category.transaction do
  groups.each_with_index do |group, index|
    parent = create_classic_category(group, "g", nil, index + 1)
    group.fetch("forums").each_with_index do |forum, forum_index|
      category = create_classic_category(forum, "f", parent, forum_index + 1)
      forum.fetch("children", []).each_with_index do |child, child_index|
        create_classic_category(child, "f", category, child_index + 1)
      end
    end
  end
end

puts "Created taxonomy only. Historical counts, users and topic bodies were not imported."
