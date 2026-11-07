package dev.rinorsi.editor.vault;

import java.nio.file.Path;
import java.util.Map;

/** Machine-user storage, intentionally independent of Minecraft's game/config directory. */
public final class VaultPaths {
  private VaultPaths() {}

  public static Path file() {
    return resolve(
        System.getProperty("cadeditor.vault.dir"),
        System.getProperty("os.name"),
        System.getProperty("user.home"),
        System.getenv());
  }

  static Path resolve(String override, String os, String home, Map<String, String> env) {
    if (override != null && !override.isBlank()) {
      Path selected = Path.of(override);
      if (!selected.isAbsolute()) selected = Path.of(home).resolve(selected);
      return selected.toAbsolutePath().normalize().resolve("vault.json");
    }
    Path base;
    String platform = os.toLowerCase(java.util.Locale.ROOT);
    if (platform.startsWith("windows")) {
      String appdata = env.get("APPDATA");
      base =
          appdata == null || appdata.isBlank()
              ? Path.of(home, "AppData", "Roaming")
              : Path.of(appdata);
    } else if (platform.contains("mac")) base = Path.of(home, "Library", "Application Support");
    else {
      String xdg = env.get("XDG_DATA_HOME");
      base = xdg == null || xdg.isBlank() ? Path.of(home, ".local", "share") : Path.of(xdg);
    }
    return base.toAbsolutePath().normalize().resolve("cadeditor").resolve("vault.json");
  }
}
