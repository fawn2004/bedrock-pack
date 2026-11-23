package io.github.fawn2004.addonimporter;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {

    static final String MINECRAFT = "com.mojang.minecraftpe";
    private static final int PICK_FILES = 1;
    private static final String[] KNOWN_EXT = {".mcaddon", ".mcpack", ".mcworld", ".mctemplate", ".zip"};

    private boolean dark;
    private int cText, cMuted, cCard, cAccent, cAccentText, cError, cLine;
    private LinearLayout results;
    private TextView emptyHint;

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        cText = dark ? 0xFFECEDE8 : 0xFF1D1F1B;
        cMuted = dark ? 0xFFA9ADA4 : 0xFF5D6158;
        cCard = dark ? 0xFF262825 : 0xFFFFFFFF;
        cLine = dark ? 0xFF3A3D38 : 0xFFE1DED6;
        cAccent = dark ? 0xFF6CC04A : 0xFF3C8527;
        cAccentText = dark ? 0xFF10200A : 0xFFFFFFFF;
        cError = dark ? 0xFFFF8A80 : 0xFFB3261E;
        setContentView(buildUi());
        cleanOldFiles();
        if (state == null) handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILES || resultCode != RESULT_OK || data == null) return;
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            ClipData clip = data.getClipData();
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        process(uris, false);
    }

    private void handleIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        List<Uri> uris = new ArrayList<>();
        switch (intent.getAction()) {
            case Intent.ACTION_VIEW:
                if (intent.getData() != null) uris.add(intent.getData());
                break;
            case Intent.ACTION_SEND:
                Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (one != null) uris.add(one);
                break;
            case Intent.ACTION_SEND_MULTIPLE:
                ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (many != null) uris.addAll(many);
                break;
        }
        if (uris.isEmpty() && intent.getClipData() != null) {
            ClipData clip = intent.getClipData();
            for (int i = 0; i < clip.getItemCount(); i++)
                if (clip.getItemAt(i).getUri() != null) uris.add(clip.getItemAt(i).getUri());
        }
        // Opening a single file should feel like it went straight into Minecraft.
        process(uris, uris.size() == 1);
    }

    // ---------------------------------------------------------------- work

    private static final class Item {
        String name;
        File ready;
        PackAnalyzer.Result result;
        String error;
    }

    private void process(List<Uri> uris, boolean autoImport) {
        if (uris.isEmpty()) return;
        for (Uri uri : uris) {
            final View placeholder = loadingCard();
            results.addView(placeholder, 0);
            emptyHint.setVisibility(View.GONE);
            new Thread(() -> {
                Item item = prepare(uri);
                runOnUiThread(() -> {
                    int idx = results.indexOfChild(placeholder);
                    results.removeView(placeholder);
                    results.addView(card(item), Math.max(idx, 0));
                    if (autoImport && item.error == null) sendToMinecraft(item);
                });
            }).start();
        }
    }

    private Item prepare(Uri uri) {
        Item item = new Item();
        item.name = displayName(uri);
        File tmp = new File(getCacheDir(), "incoming-" + System.nanoTime());
        try {
            try (InputStream in = getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(tmp)) {
                if (in == null) throw new java.io.IOException("Couldn't open the file.");
                PackAnalyzer.copy(in, out);
            }
            PackAnalyzer.Result r = PackAnalyzer.analyze(tmp, item.name);
            item.result = r;
            File out = new File(ShareProvider.outDir(this), PackAnalyzer.sanitize(baseName(item.name)) + r.extension);
            out.delete();
            if (r.needsRepair) {
                PackAnalyzer.repair(tmp, r, out);
            } else if (!tmp.renameTo(out)) {
                throw new java.io.IOException("Couldn't save the prepared file.");
            }
            item.ready = out;
        } catch (PackAnalyzer.NotAnAddonException e) {
            item.error = e.getMessage();
        } catch (SecurityException e) {
            item.error = "Android didn't give this app permission to read that file. Try opening it from your file manager instead.";
        } catch (Exception e) {
            item.error = "Couldn't read the file: " + e.getMessage();
        } finally {
            tmp.delete();
        }
        return item;
    }

    private void sendToMinecraft(Item item) {
        if (!isMinecraftInstalled()) {
            new AlertDialog.Builder(this)
                    .setTitle("Minecraft isn't installed")
                    .setMessage("Install Minecraft (Bedrock Edition) first, then try again.")
                    .setPositiveButton("Open Play Store", (d, w) -> {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + MINECRAFT)));
                        } catch (ActivityNotFoundException e) {
                            startActivity(new Intent(Intent.ACTION_VIEW,
                                    Uri.parse("https://play.google.com/store/apps/details?id=" + MINECRAFT)));
                        }
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
            return;
        }
        Uri uri = ShareProvider.uriFor(item.ready);
        grantUriPermission(MINECRAFT, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, "application/octet-stream");
        view.setClipData(ClipData.newRawUri(item.ready.getName(), uri));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        view.setPackage(MINECRAFT);
        try {
            startActivity(view);
            return;
        } catch (ActivityNotFoundException ignored) {
            // Fall through: open Minecraft's main screen directly with the file.
        }
        view.setPackage(null);
        view.setClassName(MINECRAFT, MINECRAFT + ".MainActivity");
        try {
            startActivity(view);
        } catch (ActivityNotFoundException | SecurityException e) {
            new AlertDialog.Builder(this)
                    .setTitle("Couldn't open Minecraft")
                    .setMessage("Minecraft didn't accept the file. Make sure Minecraft is up to date, then try again.")
                    .setPositiveButton("OK", null)
                    .show();
        }
    }

    private boolean isMinecraftInstalled() {
        try {
            getPackageManager().getPackageInfo(MINECRAFT, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private String displayName(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
            } catch (Exception ignored) {
            }
        }
        if (TextUtils.isEmpty(name)) name = uri.getLastPathSegment();
        if (TextUtils.isEmpty(name)) name = "addon";
        return name.substring(name.lastIndexOf('/') + 1);
    }

    /** "My Pack.mcaddon.zip" -> "My Pack" */
    private static String baseName(String name) {
        String n = name;
        boolean changed = true;
        while (changed) {
            changed = false;
            for (String ext : KNOWN_EXT) {
                if (n.toLowerCase(Locale.ROOT).endsWith(ext) && n.length() > ext.length()) {
                    n = n.substring(0, n.length() - ext.length());
                    changed = true;
                }
            }
        }
        return n.replaceAll("\\s*\\(\\d+\\)$", "").trim();
    }

    private void cleanOldFiles() {
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        File[] old = ShareProvider.outDir(this).listFiles();
        if (old != null) for (File f : old) if (f.lastModified() < cutoff) f.delete();
        File[] tmp = getCacheDir().listFiles((d, n) -> n.startsWith("incoming-"));
        if (tmp != null) for (File f : tmp) f.delete();
    }

    // ---------------------------------------------------------------- UI

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, dp(28), pad, dp(28));
        scroll.addView(root);

        TextView title = text("Add-on Importer", 28, cText, true);
        root.addView(title);
        TextView sub = text("Open a .mcaddon, .mcpack, .mcworld or .mctemplate file and it goes straight into Minecraft Bedrock Edition.", 15, cMuted, false);
        sub.setPadding(0, dp(6), 0, dp(20));
        root.addView(sub);

        Button pick = button("Choose add-on files", true);
        pick.setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, PICK_FILES);
            } catch (ActivityNotFoundException e) {
                i.setAction(Intent.ACTION_GET_CONTENT);
                startActivityForResult(i, PICK_FILES);
            }
        });
        root.addView(pick, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54)));

        results = new LinearLayout(this);
        results.setOrientation(LinearLayout.VERTICAL);
        results.setPadding(0, dp(12), 0, 0);
        root.addView(results);

        emptyHint = text("No files yet.", 14, cMuted, false);
        emptyHint.setPadding(0, dp(8), 0, dp(8));
        results.addView(emptyHint);

        TextView howTitle = text("Other ways to import", 16, cText, true);
        howTitle.setPadding(0, dp(24), 0, dp(6));
        root.addView(howTitle);
        root.addView(text(
                "• Tap the file in your Files app or browser downloads and choose Add-on Importer.\n"
                        + "• Or use Share → Add-on Importer from any app.\n"
                        + "• If a file was packed wrongly (an extra folder, a .zip name, Windows paths), it's fixed automatically before it's sent.\n"
                        + "• After it imports, open a world's settings and turn on the packs under Behavior Packs or Resource Packs.",
                14, cMuted, false));

        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, left, right;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets in = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = in.top; bottom = in.bottom; left = in.left; right = in.right;
            } else {
                top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom();
                left = insets.getSystemWindowInsetLeft(); right = insets.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
        return scroll;
    }

    private View loadingCard() {
        LinearLayout c = cardShell();
        c.setOrientation(LinearLayout.HORIZONTAL);
        c.setGravity(Gravity.CENTER_VERTICAL);
        ProgressBar pb = new ProgressBar(this);
        pb.setIndeterminateTintList(ColorStateList.valueOf(cAccent));
        c.addView(pb, new LinearLayout.LayoutParams(dp(28), dp(28)));
        TextView t = text("Checking file…", 15, cMuted, false);
        t.setPadding(dp(12), 0, 0, 0);
        c.addView(t);
        return c;
    }

    private View card(Item item) {
        LinearLayout c = cardShell();
        TextView name = text(item.name, 17, cText, true);
        name.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        name.setSingleLine(true);
        c.addView(name);

        if (item.error != null) {
            TextView err = text(item.error, 14, cError, false);
            err.setPadding(0, dp(6), 0, 0);
            c.addView(err);
            return c;
        }

        PackAnalyzer.Result r = item.result;
        String kind;
        switch (r.kind) {
            case ADDON: kind = "Add-on"; break;
            case WORLD: kind = "World"; break;
            case TEMPLATE: kind = "World template"; break;
            default: kind = "Pack";
        }
        TextView k = text(kind + " · sent as " + item.ready.getName(), 13, cMuted, false);
        k.setPadding(0, dp(2), 0, dp(8));
        c.addView(k);

        StringBuilder sb = new StringBuilder();
        for (PackAnalyzer.PackInfo p : r.packs) {
            if (sb.length() > 0) sb.append('\n');
            sb.append("• ").append(p.name).append("  —  ").append(p.type);
        }
        c.addView(text(sb.toString(), 14, cText, false));

        if (r.needsRepair) {
            TextView fix = text("Fixed before importing: " + TextUtils.join(" ", r.repairReasons), 13, cAccent, false);
            fix.setPadding(0, dp(8), 0, 0);
            c.addView(fix);
        }

        Button go = button("Import into Minecraft", true);
        go.setOnClickListener(v -> {
            sendToMinecraft(item);
            go.setText("Import again");
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
        lp.topMargin = dp(14);
        c.addView(go, lp);
        return c;
    }

    private LinearLayout cardShell() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(cCard);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), cLine);
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        c.setLayoutParams(lp);
        return c;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setTextColor(primary ? cAccentText : cAccent);
        b.setStateListAnimator(null);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(14));
        shape.setColor(primary ? cAccent : Color.TRANSPARENT);
        if (!primary) shape.setStroke(dp(1), cAccent);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33000000), shape, null));
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
