#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-/root/gisvn-vbulletin41.env}"
DISCOURSE_ROOT="${DISCOURSE_ROOT:-/var/www/discourse}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 2
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

required=(
  DB_HOST DB_NAME DB_USER DB_PW TABLE_PREFIX TIMEZONE ATTACHMENT_DIR
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Required variable is empty: $name" >&2
    exit 2
  fi
done

if [[ ! -d "$DISCOURSE_ROOT" ]]; then
  echo "Discourse root does not exist: $DISCOURSE_ROOT" >&2
  exit 2
fi

if [[ ! -d "$ATTACHMENT_DIR" ]]; then
  echo "Attachment directory does not exist: $ATTACHMENT_DIR" >&2
  echo "If the old forum stored all attachments in MySQL, create an empty, readable directory and point ATTACHMENT_DIR to it." >&2
  exit 2
fi

mkdir -p "${GISVN_MIGRATION_DIR:-/var/tmp/gisvn-migration}"
LOG_DIR="${GISVN_MIGRATION_DIR:-/var/tmp/gisvn-migration}"
LOG_FILE="$LOG_DIR/vbulletin41-$(date +%Y%m%d-%H%M%S).log"

cd "$DISCOURSE_ROOT"

if ! bundle exec ruby -e 'require "php_serialize"' >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Missing Ruby dependency: php-serialize.
The built-in Discourse vBulletin 4 importer requires it.
Add the dependency to the import environment and run bundle install before retrying.
MSG
  exit 3
fi

cat <<MSG
GISVN vBulletin 4.1.7 migration
  Discourse:      $DISCOURSE_ROOT
  Source DB:      $DB_USER@$DB_HOST/$DB_NAME
  Table prefix:   $TABLE_PREFIX
  Timezone:       $TIMEZONE
  Attachments:    $ATTACHMENT_DIR
  Log:            $LOG_FILE

This wrapper does not modify the source database.
Press Ctrl+C now if these values are not correct.
MSG

sleep 3

RAILS_ENV="${RAILS_ENV:-production}" DB_HOST="$DB_HOST" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PW="$DB_PW" TABLE_PREFIX="$TABLE_PREFIX" TIMEZONE="$TIMEZONE" ATTACHMENT_DIR="$ATTACHMENT_DIR" bundle exec ruby script/import_scripts/vbulletin.rb 2>&1 | tee "$LOG_FILE"

echo
echo "Core vBulletin import finished."
echo "Installing GISVN legacy permalink mappings..."

RAILS_ENV="${RAILS_ENV:-production}" bundle exec rails runner script/gisvn/install_vbulletin_permalinks.rb | tee -a "$LOG_FILE"

echo
echo "Exporting redirect audit CSV..."

RAILS_ENV="${RAILS_ENV:-production}" GISVN_MAPPING_OUTPUT="$LOG_DIR/gisvn-vbulletin-redirects.csv" bundle exec rails runner script/gisvn/export_vbulletin_mappings.rb | tee -a "$LOG_FILE"

echo
echo "Migration wrapper completed."
echo "Review:"
echo "  $LOG_FILE"
echo "  $LOG_DIR/gisvn-vbulletin-redirects.csv"
