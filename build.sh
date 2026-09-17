#!/bin/zsh
# Bouwt MotionKeys.app in ./build. Gebruik: ./build.sh [--run | --install]
#   --run      start de gebouwde app uit ./build
#   --install  kopieert de app naar /Applications en start ze vandaar
set -e
cd "$(dirname "$0")"

swift build -c release

APP="build/MotionKeys.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/MotionKeys "$APP/Contents/MacOS/MotionKeys"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# Signing: env CODESIGN_IDENTITY > self-signed "MotionKeys Dev" > ad-hoc (-)
IDENTITY="${CODESIGN_IDENTITY:-}"
if [[ -z "$IDENTITY" ]] && security find-identity -v -p codesigning 2>/dev/null | grep -q '"MotionKeys Dev"'; then
  IDENTITY="MotionKeys Dev"
fi
IDENTITY="${IDENTITY:--}"
codesign --force --deep --sign "$IDENTITY" "$APP"
echo "Gebouwd: $APP (gesigneerd met: $IDENTITY)"
if [[ "$IDENTITY" == "-" ]]; then
  echo "Let op: ad-hoc gesigneerd. Na elke rebuild moet je MotionKeys opnieuw toestaan onder"
  echo "Systeeminstellingen > Privacy en beveiliging > Toegankelijkheid (verwijderen en opnieuw toevoegen)."
  echo "Zie README.md om dat eenmalig op te lossen met een self-signed certificaat."
fi

if [[ "$1" == "--run" ]]; then
  open "$APP"
elif [[ "$1" == "--install" ]]; then
  DEST="/Applications/MotionKeys.app"
  pkill -x MotionKeys 2>/dev/null || true
  rm -rf "$DEST"
  ditto "$APP" "$DEST"
  # Finder/Launchpad het nieuwe icoon laten oppikken
  touch "$DEST"
  echo "Geïnstalleerd: $DEST"
  open "$DEST"
fi
