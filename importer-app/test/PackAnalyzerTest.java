import io.github.fawn2004.addonimporter.PackAnalyzer;
import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Run: test/run.sh  — checks real and broken layouts, and that repairs come out right. */
public class PackAnalyzerTest {
    static int fails = 0;
    static File dir;

    static File zip(String name, String... entries) throws IOException {
        File f = new File(dir, name);
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(f))) {
            for (String e : entries) {
                z.putNextEntry(new ZipEntry(e));
                String body = e.endsWith("manifest.json")
                        ? "{\"header\":{\"name\":\"" + e.replace('\\', '/').replaceAll("/?manifest.json$", "").replaceAll(".*/", "") + " pack\"},\"modules\":[{\"type\":\"" + (e.contains("RP") ? "resources" : "data") + "\"}]}"
                        : "x";
                z.write(body.getBytes("UTF-8"));
                z.closeEntry();
            }
        }
        return f;
    }

    static List<String> names(File f) throws IOException {
        List<String> out = new ArrayList<>();
        try (ZipFile z = new ZipFile(f)) { for (Enumeration<? extends ZipEntry> e = z.entries(); e.hasMoreElements();) out.add(e.nextElement().getName()); }
        Collections.sort(out);
        return out;
    }

    static void check(String label, boolean ok) {
        System.out.println((ok ? "PASS " : "FAIL ") + label);
        if (!ok) fails++;
    }

    static PackAnalyzer.Result run(String label, File f, PackAnalyzer.Kind kind, boolean repair, List<String> expected) throws Exception {
        PackAnalyzer.Result r = PackAnalyzer.analyze(f, f.getName());
        boolean ok = r.kind == kind && r.needsRepair == repair;
        if (repair) {
            File out = new File(dir, "out-" + f.getName());
            PackAnalyzer.repair(f, r, out);
            List<String> got = names(out);
            if (!got.equals(expected)) { ok = false; System.out.println("   got " + got); }
        }
        check(label + " -> " + r.kind + (r.needsRepair ? " (repaired)" : "") + " " + r.packs, ok);
        return r;
    }

    public static void main(String[] a) throws Exception {
        dir = new File(a[1]);
        dir.mkdirs();
        File real = new File(a[0], "MoreBuildingBlocks3.mcaddon");
        PackAnalyzer.Result rr = run("real .mcaddon", real, PackAnalyzer.Kind.ADDON, false, null);
        check("real .mcaddon has BP + RP", rr.packs.size() == 2);
        run("real BP .mcpack", new File(a[0], "MoreBuildingBlocks3_BP.mcpack"), PackAnalyzer.Kind.PACK, false, null);

        run("pack at root, named .zip", zip("p.zip", "manifest.json", "pack_icon.png"), PackAnalyzer.Kind.PACK, false, null);
        run("pack in wrapper folder", zip("w.zip", "Cool/manifest.json", "Cool/textures/a.png"),
                PackAnalyzer.Kind.PACK, true, Arrays.asList("manifest.json", "textures/a.png"));
        run("addon double-wrapped", zip("d.mcaddon", "Outer/BP/manifest.json", "Outer/BP/x.json", "Outer/RP/manifest.json", "__MACOSX/junk", "Outer/.DS_Store"),
                PackAnalyzer.Kind.ADDON, true, Arrays.asList("BP/manifest.json", "BP/x.json", "RP/manifest.json"));
        run("addon with subpacks not split", zip("s.mcaddon", "RP/manifest.json", "RP/subpacks/low/manifest.json", "BP/manifest.json"),
                PackAnalyzer.Kind.ADDON, false, null);
        run("addon of nested zips", zip("n.zip", "stuff/a.zip", "stuff/b.mcpack"),
                PackAnalyzer.Kind.ADDON, true, Arrays.asList("a.mcpack", "b.mcpack"));
        run("windows backslashes", zip("b.mcpack", "Pack\\manifest.json", "Pack\\x.png"),
                PackAnalyzer.Kind.PACK, true, Arrays.asList("manifest.json", "x.png"));
        run("world in folder", zip("wo.zip", "My World/level.dat", "My World/db/CURRENT"),
                PackAnalyzer.Kind.WORLD, true, Arrays.asList("db/CURRENT", "level.dat"));

        try { PackAnalyzer.analyze(zip("bad.zip", "readme.txt"), "bad.zip"); check("no manifest rejected", false); }
        catch (PackAnalyzer.NotAnAddonException e) { check("no manifest rejected: " + e.getMessage(), true); }
        File notZip = new File(dir, "nz.mcaddon");
        try (FileWriter w = new FileWriter(notZip)) { w.write("<html>404</html>"); }
        try { PackAnalyzer.analyze(notZip, "nz.mcaddon"); check("non-zip rejected", false); }
        catch (PackAnalyzer.NotAnAddonException e) { check("non-zip rejected", true); }

        System.out.println(fails == 0 ? "ALL PASSED" : fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
