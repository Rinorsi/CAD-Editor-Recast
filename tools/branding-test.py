#!/usr/bin/env python3
"""Headless branding contract checks; Python 3.11+, no third-party modules."""
import argparse
import json
from pathlib import Path, PurePosixPath
import struct
import tomllib
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
AUTHOR = "\u4e91\u8bfa\u7fb2Rinorsi"
HOME = "https://github.com/Rinorsi/CAD-Editor-Recast"
BILIBILI = "https://b23.tv/hjUvs0c"
AFDIAN = "https://afdian.com/a/Rinorsi"
FABRIC_META = "fabric/src/main/resources/fabric.mod.json"
NEO_META = "neoforge/src/main/resources/META-INF/neoforge.mods.toml"


def text(path):
    return (ROOT / path).read_text(encoding="utf-8")


class BrandingTest(unittest.TestCase):
    def png(self, data, size):
        self.assertEqual(data[:8], PNG_SIGNATURE)
        self.assertEqual(data[12:16], b"IHDR")
        self.assertEqual(struct.unpack(">II", data[16:24]), (size, size))

    def icon_path(self, path):
        self.assertFalse(PurePosixPath(path).is_absolute())
        self.assertNotIn("..", PurePosixPath(path).parts)
        self.assertEqual(path, "assets/cadeditor/icon.png")
        resources = [ROOT / loader / "src/main/resources" / path
                     for loader in ("common", "fabric", "neoforge")]
        files = [p for p in resources if p.is_file()]
        self.assertTrue(files, f"Missing source resource: {path}")
        for file in files:
            self.png(file.read_bytes(), 128)
        return files[0].read_bytes()

    def fabric(self, meta):
        self.assertEqual(meta["name"], "CAD Editor")
        self.assertEqual(meta["authors"], [AUTHOR])
        self.assertEqual(meta["contact"], {
            "homepage": HOME, "sources": HOME, "issues": HOME + "/issues",
            "bilibili": BILIBILI, "afdian": AFDIAN,
        })
        self.assertIn("Oriel", meta["description"])
        self.assertIn("modrinth", meta["custom"])
        self.assertIn("curseforge", meta["custom"])
        return meta["icon"]

    def neoforge(self, meta, key):
        mod, = meta["mods"]
        self.assertEqual(mod["displayName"], "CAD Editor")
        self.assertEqual(mod["authors"], AUTHOR)
        self.assertEqual(mod["displayURL"], HOME)
        self.assertEqual(meta["issueTrackerURL"], HOME + "/issues")
        for value in ("Oriel", BILIBILI, AFDIAN):
            self.assertIn(value, mod["credits"])
        self.assertNotIn("iconFile" if key == "logoFile" else "logoFile", mod)
        return mod[key]

    def test_source_metadata_icons(self):
        self.icon_path(self.fabric(json.loads(text(FABRIC_META))))
        template = text(NEO_META)
        self.assertIn("${neoforge_logo_key}", template)
        settings = tomllib.loads(text("stonecutter.properties.toml"))
        for version, values in settings.items():
            with self.subTest(version=version):
                key = values["neoforge_logo_key"]
                self.assertEqual(key, "logoFile" if version == "26.1" else "iconFile")
                meta = tomllib.loads(template.replace("${neoforge_logo_key}", key))
                self.icon_path(self.neoforge(meta, key))
        self.assertIn("neoforge_logo_key: neoforge_logo_key",
                      text("build-logic/src/main/groovy/multiloader-common.gradle"))

    def test_documentation_assets(self):
        for kind in ("icon-plate", "logo-transparent"):
            for size in (512, 256):
                with self.subTest(kind=kind, size=size):
                    self.png((ROOT / f"docs/branding/{kind}-{size}.png").read_bytes(), size)
        self.assertTrue((ROOT / "docs/branding/README.md").is_file())
        self.assertFalse((ROOT / "docs/branding/sheet.png").exists())
        readme = text("README.md")
        self.assertIn('src="docs/branding/icon-plate-256.png" width="128"', readme)
        self.assertIn("<!-- editor-version -->", readme)

    def test_jars(self):
        if not OPTIONS.fabric_jar and not OPTIONS.neoforge_jar:
            self.skipTest("jar paths not supplied; source checks only")
        for loader, path in (("fabric", OPTIONS.fabric_jar), ("neoforge", OPTIONS.neoforge_jar)):
            if not path:
                continue
            with self.subTest(loader=loader), zipfile.ZipFile(path) as jar:
                entry = "fabric.mod.json" if loader == "fabric" else "META-INF/neoforge.mods.toml"
                raw = jar.read(entry).decode("utf-8")
                self.assertNotIn("${", raw, f"Unexpanded placeholder in {entry}")
                if loader == "fabric":
                    meta = json.loads(raw)
                    icon = self.fabric(meta)
                    version = meta["version"]
                else:
                    meta = tomllib.loads(raw)
                    mod, = meta["mods"]
                    mc = next(d for d in meta["dependencies"]["cadeditor"] if d["modId"] == "minecraft")
                    key = "logoFile" if mc["versionRange"].startswith("[26.1,") else "iconFile"
                    icon = self.neoforge(meta, key)
                    version = mod["version"]
                self.assertTrue(version.strip())
                self.assertEqual(jar.read(icon), self.icon_path(icon))
                self.png(jar.read(icon), 128)
                print(f"PASS {loader}: {path}; version={version}; icon={icon}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fabric-jar", type=Path)
    parser.add_argument("--neoforge-jar", type=Path)
    OPTIONS = parser.parse_args()
    unittest.main(argv=[__file__], verbosity=2)
