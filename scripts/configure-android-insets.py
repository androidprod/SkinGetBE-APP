"""Keep the Tauri Android WebView clear of system bars and display cutouts."""

from pathlib import Path


activities = list(Path("src-tauri/gen/android/app/src/main").rglob("MainActivity.kt"))
if len(activities) != 1:
    raise SystemExit("Expected exactly one generated Android MainActivity.kt")

activity = activities[0]
source = activity.read_text()
if "ViewCompat.setOnApplyWindowInsetsListener(content)" in source:
    raise SystemExit(0)
marker = "    super.onCreate(savedInstanceState)\n"
if (
    source.count(marker) != 1
    or source.count("import android.os.Bundle\n") != 1
    or "enableEdgeToEdge()" not in source
):
    raise SystemExit("Unexpected Tauri Android MainActivity; update inset setup")

imports = """import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

"""
source = source.replace("import android.os.Bundle\n", "import android.os.Bundle\n" + imports, 1)
source = source.replace(
    marker,
    marker
    + """
    // Tauri draws edge-to-edge. Apply the real Android insets to the WebView
    // container; CSS safe-area-inset-* can be zero on older Android WebViews.
    val content: View = findViewById(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      view.setPadding(
        maxOf(bars.left, cutout.left),
        maxOf(bars.top, cutout.top),
        maxOf(bars.right, cutout.right),
        maxOf(bars.bottom, cutout.bottom)
      )
      insets
    }
    ViewCompat.requestApplyInsets(content)
""",
    1,
)
activity.write_text(source)
