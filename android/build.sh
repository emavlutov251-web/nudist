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
# Номер версии один на всё: APP_VERSION в MainActivity.java (его же приложение сообщает серверу, с ним сверяется public/apk.json).
# 16 → versionCode 16, versionName 1.6. Сборка 1.6, которая уже разошлась, вышла с versionCode 7 — любая следующая её перекроет.
APPV="$(sed -n 's/.*APP_VERSION = \([0-9][0-9]*\);.*/\1/p' src/ru/nudist/app/MainActivity.java | head -1)"
[ -n "$APPV" ] || { echo "Не нашёл APP_VERSION в MainActivity.java"; exit 1; }
VERSION_CODE="${VERSION_CODE:-$APPV}"; VERSION_NAME="${VERSION_NAME:-${APPV%?}.${APPV#"${APPV%?}"}}"
if [ -f ../public/apk.json ]; then J="$(sed -n 's/.*"code": *\([0-9][0-9]*\).*/\1/p' ../public/apk.json | head -1)"; [ "$J" = "$APPV" ] || echo "ВНИМАНИЕ: в public/apk.json версия ${J:-?}, а собирается $APPV — поправьте apk.json, иначе окно обновления покажется не тем."; fi
# SERVER_URL=https://… вшивает адрес сервера: приложение открывает его сразу, без экрана настройки.
SERVER_URL="${SERVER_URL:-}"
# STORE=rustore — сборка для магазина: меняет User-Agent (магазин/сайт). Нужна, чтобы приложение,
# установленное из RuStore, не предлагало оплату картой в обход магазина (требование RuStore 9.1).
STORE="${STORE:-}"
# MIGRATE_FROM=https://старый-адрес[,ещё-один] — прежние адреса сервера: приложение, настроенное на них, само перейдёт на SERVER_URL и перенесёт вход.
MIGRATE_FROM="${MIGRATE_FROM:-}"
case "$MIGRATE_FROM" in *[\<\>\&\"\']*) echo "В MIGRATE_FROM недопустимые символы"; exit 1;; esac
case "$SERVER_URL" in *[\<\>\&\"\']*) echo "В SERVER_URL недопустимые символы"; exit 1;; esac
cp -r res "$W/res"
# Сборка с вшитым https-адресом не ходит по открытому http вообще; без вшитого адреса (свой сервер в домашней сети) http остаётся разрешён.
cp AndroidManifest.xml "$W/AndroidManifest.xml"
case "$SERVER_URL" in https://*) sed -i 's/android:usesCleartextTraffic="true"/android:usesCleartextTraffic="false"/' "$W/AndroidManifest.xml";; esac
# Сборка для магазина обновляется через магазин и никогда не открывает установщик Android. Разрешение
# REQUEST_INSTALL_PACKAGES ей не нужно, а в магазинах оно «ограниченное»: без объяснения проверку не пройти.
case "$STORE" in
  ""|0|site) ;;
  *) awk '{
       if ($0 ~ /REQUEST_INSTALL_PACKAGES/) { if (buf ~ /Автообновление/) buf = ""; next }   # разрешение и его пояснение
       if (buf != "") print buf; buf = $0
     } END { if (buf != "") print buf }' "$W/AndroidManifest.xml" > "$W/AndroidManifest.xml.store" && mv "$W/AndroidManifest.xml.store" "$W/AndroidManifest.xml"
     if grep -q REQUEST_INSTALL_PACKAGES "$W/AndroidManifest.xml"; then echo "Не удалось убрать REQUEST_INSTALL_PACKAGES из магазинной сборки"; exit 1; fi
     echo "Магазинная сборка ($STORE): установка APK из приложения выключена, разрешение убрано" ;;
esac
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="default_server" translatable="false">%s</string>\n    <string name="migrate_from" translatable="false">%s</string>\n    <string name="build_store" translatable="false">%s</string>\n</resources>\n' "$SERVER_URL" "$MIGRATE_FROM" "$STORE" > "$W/res/values/server.xml"

# ───── Интерфейс внутрь APK
# Мессенджер целиком (код, стили, шрифты, значки) кладём в assets/public. Тогда WebView не тратит время и трафик
# на загрузку интерфейса: страница открывается сразу, сеть нужна только сообщениям. Список файлов тот же,
# что отдаёт сервер в /api/web-list, чтобы приложение могло потом обновить копию без переустановки.
WEB="$W/assets/public"
mkdir -p "$WEB"
cp -r ../public/js ../public/css ../public/fonts ../public/vendor "$WEB"/
cp ../public/index.html ../public/manifest.webmanifest "$WEB"/
cp ../public/icon.svg ../public/icon-180.png ../public/icon-192.png ../public/icon-512.png ../public/icon-maskable.png "$WEB"/ 2>/dev/null || true
cp ../public/*.png ../public/*.svg "$WEB"/ 2>/dev/null || true
# страницы правил открываются в браузере с сервера — их внутрь не кладём, но политика должна быть доступна и офлайн
cp ../public/privacy.html "$WEB"/ 2>/dev/null || true
# лишнее внутрь не тащим
rm -rf "$WEB"/js/admin.js "$WEB"/js/ask.js "$WEB"/js/start.js "$WEB"/js/start-qr.js "$WEB"/css/admin.css 2>/dev/null || true
find "$WEB" -type f | wc -l | xargs printf 'интерфейс в APK: файлов %s\n'
du -sh "$WEB" | awk '{print "интерфейс в APK: " $1}'

"$BT/aapt2" compile --dir "$W/res" -o "$W/res.zip"
"$BT/aapt2" link -o "$W/app.apk" -I "$JAR" --manifest "$W/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$W/res.zip"
mkdir -p "$W/classes" "$W/dex"
javac -encoding UTF-8 -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -d "$W/classes" $(find src "$W/gen" -name '*.java')
"$BT/d8" --release --lib "$JAR" --min-api 26 --output "$W/dex" $(find "$W/classes" -name '*.class')
(cd "$W/dex" && zip -q -j "$W/app.apk" classes.dex)
(cd "$W" && zip -q -r "$W/app.apk" assets)      # интерфейс внутрь APK
"$BT/zipalign" -f -p 4 "$W/app.apk" "$W/aligned.apk"
# Ключ подписи: один и тот же для всех сборок, иначе обновление не встанет поверх старой версии.
# Пароль хранилища — только из переменной NUDIST_KEYSTORE_PASS (в репозитории его нет). Нет файла nudist.keystore — создаётся новый ключ с этим паролем.
KS_PASS="${NUDIST_KEYSTORE_PASS:?Задайте пароль хранилища ключа: NUDIST_KEYSTORE_PASS=… ./build.sh}"
[ -f nudist.keystore ] || keytool -genkeypair -keystore nudist.keystore -storepass "$KS_PASS" -keypass "$KS_PASS" -alias nudist \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Nudist, O=Nudist, C=RU" >/dev/null 2>&1
"$BT/apksigner" sign --ks nudist.keystore --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --out nudist-android.apk "$W/aligned.apk"
rm -f nudist-android.apk.idsig
"$BT/apksigner" verify --verbose nudist-android.apk | head -5
"$BT/aapt2" dump badging nudist-android.apk | grep -E "^package|sdkVersion|application-label:|uses-permission|launchable"
ls -la nudist-android.apk
