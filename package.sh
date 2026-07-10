#!/usr/bin/env bash
# Bundle Script Traffic Light for store upload / sideload.
# All outputs go under ./dist (gitignored).
#
# Usage:
#   ./package.sh zip      → dist/script-traffic-light-chrome.zip
#   ./package.sh firefox  → dist/script-traffic-light-firefox.zip
#   ./package.sh safari   → dist/safari/… Xcode project
#   ./package.sh all      → zip + firefox + safari
#   ./package.sh clean    → remove dist/
#
# Safari signing (optional — avoids picking a Team in Xcode each time):
#   export DEVELOPMENT_TEAM=XXXXXXXXXX
#   or put DEVELOPMENT_TEAM=XXXXXXXXXX in ./.signing (gitignored)
#   else uses Xcode’s last-selected team if available
set -euo pipefail
cd "$(dirname "$0")"

NAME="script-traffic-light"
DIST="dist"
FILES=(manifest.json background.js popup.html popup.js icons)

ensure_dist() {
  mkdir -p "$DIST"
}

# Resolve Apple Development Team ID for automatic code signing.
resolve_team() {
  if [[ -n "${DEVELOPMENT_TEAM:-}" ]]; then
    echo "$DEVELOPMENT_TEAM"
    return
  fi
  if [[ -f .signing ]]; then
    # shellcheck disable=SC1091
    local team
    team="$(grep -E '^[[:space:]]*DEVELOPMENT_TEAM=' .signing | head -1 | cut -d= -f2- | tr -d '[:space:]"'"'" || true)"
    if [[ -n "$team" ]]; then
      echo "$team"
      return
    fi
  fi
  defaults read com.apple.dt.Xcode IDEProvisioningTeamManagerLastSelectedTeamID 2>/dev/null || true
}

# Inject DEVELOPMENT_TEAM into a generated pbxproj (packager leaves it empty).
apply_signing() {
  local pbx="$1"
  local team="$2"
  [[ -f "$pbx" && -n "$team" ]] || return 0

  sed -i '' '/DEVELOPMENT_TEAM = /d' "$pbx"
  sed -i '' "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic;\\
				DEVELOPMENT_TEAM = ${team};/g" "$pbx"
  echo "Signing: DEVELOPMENT_TEAM=$team"
}

zip_ext() {
  local out="$1"
  ensure_dist
  rm -f "$out"
  zip -r -X "$out" "${FILES[@]}" -x "*.DS_Store" "*/.DS_Store"
  echo "Wrote $out ($(du -h "$out" | awk '{print $1}'))"
}

cmd_zip() {
  zip_ext "$DIST/${NAME}-chrome.zip"
}

cmd_firefox() {
  zip_ext "$DIST/${NAME}-firefox.zip"
  echo "Upload $DIST/${NAME}-firefox.zip at https://addons.mozilla.org/developers/"
}

cmd_safari() {
  if [[ -z "${DEVELOPER_DIR:-}" ]]; then
    if [[ -d /Applications/Xcode-beta.app ]]; then
      export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
    elif [[ -d /Applications/Xcode.app ]]; then
      export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
    fi
  fi
  if ! xcrun --find safari-web-extension-packager &>/dev/null; then
    echo "error: safari-web-extension-packager not found (need Xcode 16+ / 27+)" >&2
    exit 1
  fi
  ensure_dist

  # Stage only web-extension files so the packager doesn't pick up dist/, README, etc.
  local stage
  stage="$(mktemp -d "${TMPDIR:-/tmp}/script-traffic-light-safari.XXXXXX")"
  trap 'rm -rf "$stage"' RETURN
  for f in "${FILES[@]}"; do
    cp -R "$f" "$stage/"
  done

  rm -rf "$DIST/safari"
  xcrun safari-web-extension-packager \
    --app-name "Script Traffic Light" \
    --bundle-identifier app.local.script-traffic-light \
    --swift --no-prompt --force --no-open \
    --copy-resources \
    --project-location "$DIST/safari" \
    "$stage"

  local team pbx
  team="$(resolve_team)"
  pbx="$DIST/safari/Script Traffic Light/Script Traffic Light.xcodeproj/project.pbxproj"
  if [[ -n "$team" ]]; then
    apply_signing "$pbx" "$team"
  else
    echo "Signing: no team found — set DEVELOPMENT_TEAM, create .signing, or pick a Team once in Xcode"
  fi

  echo "Xcode project: $DIST/safari/Script Traffic Light/Script Traffic Light.xcodeproj"
  echo "Open → scheme Script Traffic Light (macOS) → Run → enable in Safari Settings"
}

cmd_clean() {
  rm -rf "$DIST"
  echo "Removed $DIST/"
}

case "${1:-}" in
  zip) cmd_zip ;;
  firefox) cmd_firefox ;;
  safari) cmd_safari ;;
  all) cmd_zip; cmd_firefox; cmd_safari ;;
  clean) cmd_clean ;;
  *)
    echo "Usage: $0 {zip|firefox|safari|all|clean}" >&2
    exit 1
    ;;
esac
