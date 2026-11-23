package io.github.fawn2004.addonimporter;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Hands prepared add-on files to Minecraft. Minecraft only gets read access to
 * the single file we grant it, and the file name keeps its .mcaddon/.mcpack
 * extension so Minecraft knows what to do with it.
 */
public final class ShareProvider extends ContentProvider {

    static final String AUTHORITY = "io.github.fawn2004.addonimporter.files";

    static File outDir(Context c) {
        File d = new File(c.getCacheDir(), "ready");
        d.mkdirs();
        return d;
    }

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY)
                .appendPath("ready").appendPath(f.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null) throw new FileNotFoundException();
        File dir = outDir(getContext());
        File f = new File(dir, name);
        try {
            if (!f.getCanonicalFile().getParentFile().equals(dir.getCanonicalFile()) || !f.isFile())
                throw new FileNotFoundException(uri.toString());
        } catch (IOException e) {
            throw new FileNotFoundException(uri.toString());
        }
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        if (projection == null) projection = new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(projection, 1);
        Object[] row = new Object[projection.length];
        for (int i = 0; i < projection.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(projection[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(projection[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override public String getType(Uri uri) { return "application/octet-stream"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
