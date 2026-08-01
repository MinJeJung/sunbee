#!/bin/zsh
set -euo pipefail

usage() {
  print '사용법: update_desktop_app_icon.zsh <PNG|JPG|ICNS> [앱 경로]'
}

if [[ "${1:-}" == '--help' ]]; then
  usage
  exit 0
fi

if (( $# < 1 || $# > 2 )); then
  usage >&2
  exit 64
fi

source_icon="$1"
app_path="${2:-/Users/minje/Desktop/선비북스 전자책 대시보드.app}"

if [[ ! -f "$source_icon" ]]; then
  print -u2 -- "아이콘 파일을 찾을 수 없습니다: $source_icon"
  exit 66
fi

if [[ ! -d "$app_path" ]]; then
  print -u2 -- "앱을 찾을 수 없습니다: $app_path"
  exit 66
fi

plist="$app_path/Contents/Info.plist"
resources="$app_path/Contents/Resources"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
compiled_icon="$temp_dir/icon.icns"

case "${source_icon:e:l}" in
  icns)
    cp "$source_icon" "$compiled_icon"
    ;;
  png|jpg|jpeg)
    normalized="$temp_dir/icon.png"
    iconset="$temp_dir/SunbeeBooks.iconset"
    mkdir "$iconset"
    sips -s format png -z 1024 1024 "$source_icon" --out "$normalized" >/dev/null
    sips -z 16 16 "$normalized" --out "$iconset/icon_16x16.png" >/dev/null
    sips -z 32 32 "$normalized" --out "$iconset/icon_16x16@2x.png" >/dev/null
    sips -z 32 32 "$normalized" --out "$iconset/icon_32x32.png" >/dev/null
    sips -z 64 64 "$normalized" --out "$iconset/icon_32x32@2x.png" >/dev/null
    sips -z 128 128 "$normalized" --out "$iconset/icon_128x128.png" >/dev/null
    sips -z 256 256 "$normalized" --out "$iconset/icon_128x128@2x.png" >/dev/null
    sips -z 256 256 "$normalized" --out "$iconset/icon_256x256.png" >/dev/null
    sips -z 512 512 "$normalized" --out "$iconset/icon_256x256@2x.png" >/dev/null
    sips -z 512 512 "$normalized" --out "$iconset/icon_512x512.png" >/dev/null
    cp "$normalized" "$iconset/icon_512x512@2x.png"
    iconutil -c icns "$iconset" -o "$compiled_icon"
    ;;
  *)
    print -u2 -- '지원 형식은 PNG, JPG, ICNS입니다.'
    exit 65
    ;;
esac

icon_hash="$(shasum -a 256 "$compiled_icon" | awk '{print substr($1, 1, 12)}')"
icon_file="SunbeeBooksDashboard-${icon_hash}.icns"
cp "$compiled_icon" "$resources/$icon_file"
find "$resources" -maxdepth 1 -type f -name 'SunbeeBooksDashboard-*.icns' ! -name "$icon_file" -delete

plutil -replace CFBundleIconFile -string "$icon_file" "$plist"
plutil -remove CFBundleIconName "$plist" 2>/dev/null || true
rm -f "$app_path/$(printf 'Icon\r')"
xattr -d com.apple.FinderInfo "$app_path" 2>/dev/null || true
codesign --force --deep --sign - "$app_path" >/dev/null

launch_services='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
"$launch_services" -f "$app_path"
touch "$app_path"
osascript - "$app_path" >/dev/null <<'APPLESCRIPT'
on run argv
  tell application "Finder" to update (POSIX file (item 1 of argv) as alias)
end run
APPLESCRIPT

print -r -- "icon_updated=$resources/$icon_file"
