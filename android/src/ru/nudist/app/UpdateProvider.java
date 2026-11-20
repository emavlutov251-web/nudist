package ru.nudist.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Отдаёт установщику Android ровно один файл — скачанную новую сборку {@code update.apk}.
 * Нужен потому, что с Android 7 нельзя передать другому приложению ссылку на файл вида file:// —
 * только через content:// с разовым разрешением на чтение. Больше ничего этот провайдер не показывает.
 */
public class UpdateProvider extends ContentProvider {
    public static final String AUTHORITY = "ru.nudist.app.updates";
    private static final String NAME = "update.apk";

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) {
        File f = new File(getContext().getFilesDir(), NAME);
        if (!f.isFile()) return null;
        try { return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY); }
        catch (Throwable e) { return null; }
    }

    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) { return null; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
