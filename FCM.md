# Push в Android-приложение (FCM)

Что уже работает **без всяких настроек**:
- браузерный push (VAPID) — уведомления в браузере и в установленном из браузера PWA;
- лента для Android-приложения: `GET /api/notify?since=N` — служба APK долго подключается, сервер сам отвечает, когда пришло уведомление. Это и есть «push» в текущей сборке.

Чтобы включить **FCM** (настоящий push через Firebase, надёжнее при убитых производителем приложениях):

1. Firebase Console → Create project → Android app с package name из `android/` → скачать `google-services.json` (положить рядом с `android/app/build.gradle` и пересобрать APK — это отдельная задача, скажете — сделаю).
2. Firebase → Project settings → Service accounts → Generate new private key. Скачанный JSON — это `FCM_SERVICE_ACCOUNT`.
3. На сервере (`/etc/nudist.env`): `FCM_SERVICE_ACCOUNT=` и либо весь JSON одной строкой, либо путь к файлу, например `FCM_SERVICE_ACCOUNT=/etc/fcm-nudist.json` (файл `chmod 600`).
4. `sudo systemctl restart nudist`.
5. Проверка: админка → Мониторинг → «Push (веб и Android)» должен написать про FCM «включён». Плюс RPC `fcm.register` / `fcm.unregister` доступны.

Если FCM_SERVICE_ACCOUNT задан неправильно, в журнале будет `[fcm] FCM_SERVICE_ACCOUNT повреждён: …`, а пуши пойдут через ленту, как и раньше.

**iOS**: не поддерживается. Доставка на iOS требует Apple Developer ($99/год) и APNs-сертификатов — это отдельный проект.
