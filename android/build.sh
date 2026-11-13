#!/usr/bin/env bash
# Сборка APK без Gradle. Нужны JDK 11 или 17 и Android SDK (platforms;android-34, build-tools;34.0.0).
#   ANDROID_SDK=/path/to/sdk ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_SDK:-$HOME/.cache/asdk/sdk}"
BT="$SDK/build-tools/34.0.0"; JAR="$SDK/platforms/android-34/android.jar"
# JDK 11 или 17: с JDK 21 падает d8 из build-tools 34 (NullPointerException на анонимных классах).
if [ -n "${JDK_HOME:-}" ]; then export JAVA_HOME="$JDK_HOME" PATH="$JDK_HOME/bin:$PATH"; elif [ -d /usr/lib/jvm/jdk-11 ]; then export JAVA_HOME=/usr/lib/jvm/jdk-11 PATH="/usr/lib/jvm/jdk-11/bin:$PATH"; fi
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
VERSION_CODE="${VERSION_CODE:-6}"; VERSION_NAME="${VERSION_NAME:-1.5}"
# SERVER_URL=https://… вшивает адрес сервера: приложение открывает его сразу, без экрана настройки.
SERVER_URL="${SERVER_URL:-}"
case "$SERVER_URL" in *[\<\>\&\"\']*) echo "В SERVER_URL недопустимые символы"; exit 1;; esac
cp -r res "$W/res"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="default_server" translatable="false">%s</string>\n</resources>\n' "$SERVER_URL" > "$W/res/values/server.xml"

"$BT/aapt2" compile --dir "$W/res" -o "$W/res.zip"
"$BT/aapt2" link -o "$W/app.apk" -I "$JAR" --manifest AndroidManifest.xml --java "$W/gen" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$W/res.zip"
mkdir -p "$W/classes" "$W/dex"
javac -encoding UTF-8 -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -d "$W/classes" $(find src "$W/gen" -name '*.java')
"$BT/d8" --release --lib "$JAR" --min-api 26 --output "$W/dex" $(find "$W/classes" -name '*.class')
(cd "$W/dex" && zip -q -j "$W/app.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$W/app.apk" "$W/aligned.apk"
# Ключ подписи: один и тот же для всех сборок, иначе обновление не встанет поверх старой версии.
[ -f nudist.keystore ] || keytool -genkeypair -keystore nudist.keystore -storepass nudist-leaf -keypass nudist-leaf -alias nudist \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Nudist, O=Nudist, C=RU" >/dev/null 2>&1
"$BT/apksigner" sign --ks nudist.keystore --ks-pass pass:nudist-leaf --key-pass pass:nudist-leaf --out nudist-android.apk "$W/aligned.apk"
rm -f nudist-android.apk.idsig
"$BT/apksigner" verify --verbose nudist-android.apk | head -5
"$BT/aapt2" dump badging nudist-android.apk | grep -E "^package|sdkVersion|application-label:|uses-permission|launchable"
ls -la nudist-android.apk
