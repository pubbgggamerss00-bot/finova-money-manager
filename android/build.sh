#!/usr/bin/env bash
# ═════════ ساخت APK فینوا — pipeline دستی (بدون Gradle) ═════════
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_SDK:-$HOME/android-sdk}"
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"
SRC="app/src/main"
WORK="build_work"
OUT="."

mkdir -p "$WORK/gen" "$WORK/classes" "$WORK/dex"

echo "── 1) aapt2: کامپایل منابع"
"$BT/aapt2" compile --dir "$SRC/res" -o "$WORK/res.zip"

echo "── 2) aapt2: لینک (تولید R.java و apk پایه)"
"$BT/aapt2" link \
  -o "$WORK/base.apk" \
  -I "$AJAR" \
  --manifest "$SRC/AndroidManifest.xml" \
  --min-sdk-version 29 --target-sdk-version 34 \
  --version-code 15 --version-name "1.10.1" \
  --auto-add-overlay \
  --java "$WORK/gen" \
  "$WORK/res.zip"

echo "── 3) ECJ: کامپایل جاوا"
JAVACMD=(java -jar "$SDK/dl/ecj.jar")
find "$SRC/java" "$WORK/gen" -name "*.java" > "$WORK/sources.txt"
"${JAVACMD[@]}" -nowarn -source 8 -target 8 -encoding UTF-8 \
  -classpath "$AJAR" -d "$WORK/classes" @"$WORK/sources.txt"

echo "── 4) d8: تبدیل به DEX"
find "$WORK/classes" -name "*.class" > "$WORK/classes.txt"
"$BT/d8" --release --lib "$AJAR" --output "$WORK/dex" $(cat "$WORK/classes.txt")

echo "── 5) افزودن classes.dex و assets به APK"
cd "$WORK/dex"
zip -q -u ../base.apk classes.dex
cd ../..
cd "$SRC"
zip -rq "$OLDPWD/$WORK/base.apk" assets
cd "$OLDPWD"

echo "── 6) zipalign"
"$BT/zipalign" -f 4 "$WORK/base.apk" "$WORK/aligned.apk"

echo "── 7) امضای APK"
if [ ! -f finova-key.jks ]; then
  keytool -genkeypair -v -keystore finova-key.jks -alias finova \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass finova123456 -keypass finova123456 \
    -dname "CN=Finova Money, O=Finova, C=IR" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks finova-key.jks --ks-pass pass:finova123456 \
  --key-pass pass:finova123456 --out "$OUT/Finova-v1.13.0.apk" "$WORK/aligned.apk"

echo "── 8) تأیید امضا"
"$BT/apksigner" verify --print-certs "$OUT/Finova-v1.13.0.apk" | head -4

echo ""
echo "✅ APK ساخته شد: $(pwd)/$OUT/Finova-v1.13.0.apk ($(du -h "$OUT/Finova-v1.13.0.apk" | cut -f1))"
