package com.finova.money;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * FileProvider بدون کتابخانه androidx — فقط دو پوشه امن برنامه را سرو می‌کند:
 *  ۱) getExternalFilesDir(null)/update  (APK دانلودشده برای بروزرسانی)
 *  ۲) getCacheDir()/share               (فایل‌های موقت اشتراک‌گذاری)
 * هیچ مسیر دیگری قابل خواندن نیست؛ نام فایل با «..» یا «/» رد می‌شود.
 */
public class FinovaFileProvider extends ContentProvider {

    @Override public boolean onCreate() { return true; }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.length() == 0
                || name.contains("..") || name.contains("/") || name.contains("\\")) {
            throw new FileNotFoundException("bad name");
        }
        File[] bases = {
                new File(getContext().getExternalFilesDir(null), "update"),
                new File(getContext().getCacheDir(), "share"),
        };
        for (File base : bases) {
            if (base == null) continue;
            File f = new File(base, name);
            if (f.exists() && f.isFile()) return f;
        }
        throw new FileNotFoundException(name);
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment().toLowerCase();
        if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
