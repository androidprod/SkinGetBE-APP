"""Install the Android bridge after `tauri android init` (generated files are ignored)."""

from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

root = Path("src-tauri/gen/android/app/src/main")
activities = list(root.rglob("MainActivity.kt"))
if len(activities) != 1:
    raise SystemExit("Expected exactly one generated MainActivity.kt")
package = activities[0].read_text().split("package ", 1)[1].splitlines()[0].strip()
if package != "com.skingetbe.gui":
    raise SystemExit(f"Unexpected Android package: {package}")
for file in ("SkinGetPlugin.kt", "ServerService.kt"):
    shutil.copyfile(Path("scripts/android") / file, activities[0].parent / file)

xml_dir = root / "res/xml"
xml_dir.mkdir(parents=True, exist_ok=True)
shutil.copyfile("scripts/android/skin_file_paths.xml", xml_dir / "skin_file_paths.xml")

manifest = root / "AndroidManifest.xml"
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
tree = ET.parse(manifest)
android = "{http://schemas.android.com/apk/res/android}"
top = tree.getroot()
for name in ("FOREGROUND_SERVICE", "FOREGROUND_SERVICE_CONNECTED_DEVICE", "CHANGE_NETWORK_STATE", "POST_NOTIFICATIONS"):
    if not any(e.get(android + "name") == "android.permission." + name for e in top.findall("uses-permission")):
        top.insert(0, ET.Element("uses-permission", {android + "name": "android.permission." + name}))
app = top.find("application")
if app is None:
    raise SystemExit("No Android application in manifest")
if not any(e.get(android + "name") == ".ServerService" for e in app.findall("service")):
    ET.SubElement(app, "service", {
        android + "name": ".ServerService",
        android + "exported": "false",
        android + "foregroundServiceType": "connectedDevice",
    })
if not any(e.get(android + "authorities") == "${applicationId}.skinfiles" for e in app.findall("provider")):
    provider = ET.SubElement(app, "provider", {
        android + "name": "androidx.core.content.FileProvider",
        android + "authorities": "${applicationId}.skinfiles",
        android + "exported": "false",
        android + "grantUriPermissions": "true",
    })
    ET.SubElement(provider, "meta-data", {
        android + "name": "android.support.FILE_PROVIDER_PATHS",
        android + "resource": "@xml/skin_file_paths",
    })
ET.indent(tree, space="    ")
tree.write(manifest, encoding="utf-8", xml_declaration=True)
