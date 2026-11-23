package io.github.fawn2004.addonimporter;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Looks inside an add-on file (they are all zip archives) to work out what it
 * is, and rebuilds it when it was packed in a way Minecraft won't import:
 * an extra wrapper folder, a .zip extension, Windows backslash paths, etc.
 *
 * Pure Java (no Android classes) so it can be tested on a normal JVM.
 */
public final class PackAnalyzer {

    public enum Kind { ADDON, PACK, WORLD, TEMPLATE }

    public static final class PackInfo {
        public final String name;
        public final String type;
        PackInfo(String name, String type) { this.name = name; this.type = type; }
        @Override public String toString() { return name + " (" + type + ")"; }
    }

    public static final class Result {
        public Kind kind;
        /** True when the archive must be rebuilt before Minecraft will accept it. */
        public boolean needsRepair;
        public final List<String> repairReasons = new ArrayList<>();
        public final List<PackInfo> packs = new ArrayList<>();
        /** Extension Minecraft expects, including the dot. */
        public String extension;

        // Internal layout, used by repair().
        String worldRoot;
        final List<String> packRoots = new ArrayList<>();
        final List<String> nestedArchives = new ArrayList<>();
    }

    public static final class NotAnAddonException extends Exception {
        public NotAnAddonException(String msg) { super(msg); }
    }

    private static final String[] NESTED_EXT = {".mcpack", ".mcaddon", ".mcworld", ".mctemplate", ".zip"};

    private PackAnalyzer() {}

    public static Result analyze(File file, String fileName) throws IOException, NotAnAddonException {
        ZipFile zip;
        try {
            zip = new ZipFile(file);
        } catch (IOException e) {
            throw new NotAnAddonException("This file isn't a zip archive, so it can't be a Minecraft add-on. It may be damaged or only partly downloaded.");
        }
        try {
            return analyze(zip, fileName == null ? "" : fileName);
        } finally {
            zip.close();
        }
    }

    private static Result analyze(ZipFile zip, String fileName) throws IOException, NotAnAddonException {
        Result r = new Result();
        boolean backslashes = false;
        Map<String, ZipEntry> entries = new LinkedHashMap<>();
        for (Enumeration<? extends ZipEntry> e = zip.entries(); e.hasMoreElements(); ) {
            ZipEntry ze = e.nextElement();
            if (ze.getName().indexOf('\\') >= 0) backslashes = true;
            String n = normalize(ze.getName());
            if (n == null || ze.isDirectory() || n.endsWith("/")) continue;
            entries.put(n, ze);
        }
        if (entries.isEmpty()) throw new NotAnAddonException("This archive is empty.");

        // Folders that hold a world (level.dat) or a pack (manifest.json).
        List<String> worldDirs = new ArrayList<>();
        List<String> manifestDirs = new ArrayList<>();
        for (String n : entries.keySet()) {
            String base = n.substring(n.lastIndexOf('/') + 1).toLowerCase(Locale.ROOT);
            String dir = n.substring(0, n.lastIndexOf('/') + 1);
            if (base.equals("level.dat")) worldDirs.add(dir);
            if (base.equals("manifest.json")) manifestDirs.add(dir);
        }
        Collections.sort(worldDirs, (a, b) -> a.length() - b.length());
        Collections.sort(manifestDirs, (a, b) -> a.length() - b.length());

        String lowerName = fileName.toLowerCase(Locale.ROOT);

        if (!worldDirs.isEmpty()) {
            String root = worldDirs.get(0);
            r.worldRoot = root;
            boolean template = lowerName.endsWith(".mctemplate") || manifestDirs.contains(root);
            r.kind = template ? Kind.TEMPLATE : Kind.WORLD;
            r.extension = template ? ".mctemplate" : ".mcworld";
            String levelName = readText(zip, entries.get(root + "levelname.txt"));
            String name = levelName != null && !levelName.trim().isEmpty() ? levelName.trim()
                    : root.isEmpty() ? stripExt(fileName) : lastSegment(root);
            r.packs.add(new PackInfo(name, template ? "World template" : "World"));
            if (!root.isEmpty()) {
                r.needsRepair = true;
                r.repairReasons.add("The world was inside an extra folder (\"" + root + "\").");
            }
        } else {
            // Pack roots, ignoring sub-packs nested inside another pack.
            for (String d : manifestDirs) {
                boolean nested = false;
                for (String root : r.packRoots) if (d.startsWith(root)) { nested = true; break; }
                if (!nested) r.packRoots.add(d);
            }
            for (String n : entries.keySet()) {
                boolean insidePack = false;
                for (String root : r.packRoots) if (n.startsWith(root)) { insidePack = true; break; }
                if (insidePack) continue;
                String ln = n.toLowerCase(Locale.ROOT);
                for (String ext : NESTED_EXT) if (ln.endsWith(ext)) { r.nestedArchives.add(n); break; }
            }
            if (r.packRoots.isEmpty() && r.nestedArchives.isEmpty()) {
                throw new NotAnAddonException("No manifest.json was found inside, so this isn't a Minecraft add-on, resource pack or world.");
            }

            for (String root : r.packRoots) {
                String json = readText(zip, entries.get(root + "manifest.json"));
                String fallback = root.isEmpty() ? stripExt(fileName) : lastSegment(root);
                r.packs.add(describeManifest(json, fallback));
            }
            for (String n : r.nestedArchives) {
                r.packs.add(new PackInfo(stripExt(lastSegment(n)), "Packed file"));
            }

            if (r.packRoots.size() == 1 && r.packRoots.get(0).isEmpty()) {
                r.kind = Kind.PACK;
                r.extension = ".mcpack";
            } else if (r.packRoots.size() == 1 && r.nestedArchives.isEmpty() && !lowerName.endsWith(".mcaddon")) {
                // A single pack wrapped in a folder: unwrap it into a plain .mcpack.
                r.kind = Kind.PACK;
                r.extension = ".mcpack";
                r.needsRepair = true;
                r.repairReasons.add("The pack was inside an extra folder (\"" + r.packRoots.get(0) + "\").");
            } else {
                r.kind = Kind.ADDON;
                r.extension = ".mcaddon";
                for (String root : r.packRoots) {
                    if (root.isEmpty() || root.indexOf('/') != root.length() - 1) {
                        r.needsRepair = true;
                        r.repairReasons.add("Packs were not at the top level of the add-on.");
                        break;
                    }
                }
                for (String n : r.nestedArchives) {
                    if (n.indexOf('/') >= 0 || n.toLowerCase(Locale.ROOT).endsWith(".zip")) {
                        r.needsRepair = true;
                        r.repairReasons.add("Packed files inside were in a folder or named .zip.");
                        break;
                    }
                }
            }
        }
        if (backslashes) {
            r.needsRepair = true;
            r.repairReasons.add("File paths used Windows backslashes.");
        }
        return r;
    }

    /** Writes a corrected copy of {@code in} to {@code out}. */
    public static void repair(File in, Result r, File out) throws IOException {
        try (ZipFile zip = new ZipFile(in);
             ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(out))) {
            Set<String> written = new HashSet<>();
            Map<String, String> folderFor = new LinkedHashMap<>();
            if (r.kind == Kind.ADDON) {
                Set<String> used = new HashSet<>();
                for (String root : r.packRoots) {
                    String base = root.isEmpty() ? "pack" : sanitize(lastSegment(root));
                    String folder = base;
                    for (int i = 2; !used.add(folder.toLowerCase(Locale.ROOT)); i++) folder = base + "_" + i;
                    folderFor.put(root, folder + "/");
                }
            }
            for (Enumeration<? extends ZipEntry> e = zip.entries(); e.hasMoreElements(); ) {
                ZipEntry ze = e.nextElement();
                String n = normalize(ze.getName());
                if (n == null || ze.isDirectory() || n.endsWith("/")) continue;
                String target = null;
                switch (r.kind) {
                    case WORLD:
                    case TEMPLATE:
                        if (n.startsWith(r.worldRoot)) target = n.substring(r.worldRoot.length());
                        break;
                    case PACK:
                        String root = r.packRoots.get(0);
                        if (n.startsWith(root)) target = n.substring(root.length());
                        break;
                    case ADDON:
                        String best = null;
                        for (String pr : r.packRoots)
                            if (n.startsWith(pr) && (best == null || pr.length() > best.length())) best = pr;
                        if (best != null) {
                            target = folderFor.get(best) + n.substring(best.length());
                        } else if (r.nestedArchives.contains(n)) {
                            String b = lastSegment(n);
                            if (b.toLowerCase(Locale.ROOT).endsWith(".zip")) b = stripExt(b) + ".mcpack";
                            target = b;
                        }
                        break;
                }
                if (target == null || target.isEmpty() || !written.add(target)) continue;
                zos.putNextEntry(new ZipEntry(target));
                try (InputStream is = zip.getInputStream(ze)) { copy(is, zos); }
                zos.closeEntry();
            }
        }
    }

    // ---- helpers ----

    /** Normalises an entry path; returns null for junk entries that should be dropped. */
    static String normalize(String name) {
        String n = name.replace('\\', '/');
        while (n.startsWith("/") || n.startsWith("./")) n = n.substring(n.startsWith("/") ? 1 : 2);
        if (n.isEmpty() || n.startsWith("__MACOSX/") || n.contains("/../") || n.startsWith("../")) return null;
        String base = n.substring(n.lastIndexOf('/') + 1);
        if (base.equals(".DS_Store") || base.equals("Thumbs.db") || base.equals("desktop.ini")) return null;
        return n;
    }

    private static final Pattern NAME = Pattern.compile("\"name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
    private static final Pattern TYPE = Pattern.compile("\"type\"\\s*:\\s*\"([A-Za-z_]+)\"");

    static PackInfo describeManifest(String json, String fallbackName) {
        String name = fallbackName;
        String type = "Pack";
        if (json != null) {
            int header = json.indexOf("\"header\"");
            if (header >= 0) {
                Matcher m = NAME.matcher(json);
                if (m.find(header)) {
                    String n = m.group(1).replace("\\\"", "\"").trim();
                    // Names like "pack.name" are translation keys; the folder name reads better.
                    if (!n.isEmpty() && !n.equals("pack.name") && !n.matches("[a-z_]+\\.[a-z_.]+")) name = n;
                }
            }
            int modules = json.indexOf("\"modules\"");
            if (modules >= 0) {
                Matcher m = TYPE.matcher(json);
                if (m.find(modules)) type = typeLabel(m.group(1));
            }
        }
        name = name.replaceAll("§.", "");
        return new PackInfo(name, type);
    }

    static String typeLabel(String t) {
        switch (t.toLowerCase(Locale.ROOT)) {
            case "data": case "script": case "javascript": return "Behavior pack";
            case "resources": return "Resource pack";
            case "skin_pack": return "Skin pack";
            case "world_template": return "World template";
            case "interface": return "Interface pack";
            default: return "Pack";
        }
    }

    private static String readText(ZipFile zip, ZipEntry ze) throws IOException {
        if (ze == null || ze.getSize() > 1_000_000) return null;
        try (InputStream is = zip.getInputStream(ze)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            copy(is, bos);
            String s = new String(bos.toByteArray(), StandardCharsets.UTF_8);
            if (s.startsWith("﻿")) s = s.substring(1);
            return s;
        }
    }

    static String lastSegment(String path) {
        String p = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        return p.substring(p.lastIndexOf('/') + 1);
    }

    public static String stripExt(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    public static String sanitize(String name) {
        String s = name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        return s.isEmpty() ? "addon" : s;
    }

    static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
