#!/usr/bin/env python3
import re, sys, pathlib

target = pathlib.Path("frontend/src/components/reports/ClientMonthlyReport.jsx")
src = target.read_text(encoding="utf-8")
orig = src

# 1) Add new preview state after rpOpen
src = re.sub(
    r"(const \[rpOpen, setRpOpen\] = useState\(false\);\s*)",
    r"\1"
    r"  const [rpUrl, setRpUrl] = useState(null);\n"
    r"  const [rpLoading, setRpLoading] = useState(false);\n"
    r"  const [rpError, setRpError] = useState(null);\n",
    src, count=1
)

# 2) Add buildPreviewUrl right after buildUrl() helper
src = re.sub(
    r"(function buildUrl\(base, params\) {\s*.*?\n\s*}\n)",
    r"\1"
    r"  function buildPreviewUrl(unitId, ym) {\n"
    r"    const usp = new URLSearchParams({ unitId: String(unitId), yearMonth: ym });\n"
    r"    return `${API_BASE}/api/reports/preview?${usp.toString()}`;\n"
    r"  }\n",
    src, count=1, flags=re.DOTALL
)

# 3) Replace existing open/close preview handlers with fetch+blob version
pattern_handlers = re.compile(
    r"""const\s+openReportPreviewDrawer\s*=\s*\(\)\s*=>\s*{\s*[^}]*}\s*;\s*
        const\s+closeReportPreviewDrawer\s*=\s*\(\)\s*=>\s*[^;]*;""",
    re.DOTALL | re.VERBOSE
)
replacement_handlers = (
    "  async function fetchPreviewPdf() {\n"
    "    if (!selectedUnit?.unitId || !yearMonth) return;\n"
    "    setRpLoading(true);\n"
    "    setRpError(null);\n"
    "    try {\n"
    "      const url = buildPreviewUrl(selectedUnit.unitId, yearMonth);\n"
    "      const resp = await fetch(url, { headers: { Accept: 'application/pdf', ...AUTH_HEADERS } });\n"
    "      if (!resp.ok) throw new Error(`preview ${resp.status}`);\n"
    "      const blob = await resp.blob();\n"
    "      const objectUrl = URL.createObjectURL(blob);\n"
    "      if (rpUrl) URL.revokeObjectURL(rpUrl);\n"
    "      setRpUrl(objectUrl);\n"
    "    } catch (e) {\n"
    "      console.error('preview fetch error', e);\n"
    "      setRpError(e.message || 'Failed to load preview');\n"
    "      if (rpUrl) { URL.revokeObjectURL(rpUrl); setRpUrl(null); }\n"
    "    } finally {\n"
    "      setRpLoading(false);\n"
    "    }\n"
    "  }\n\n"
    "  const openReportPreviewDrawer = async () => {\n"
    "    if (!selectedUnit?.unitId || !yearMonth) return;\n"
    "    setRpOpen(true);\n"
    "    await fetchPreviewPdf();\n"
    "  };\n\n"
    "  const closeReportPreviewDrawer = () => {\n"
    "    setRpOpen(false);\n"
    "    if (rpUrl) {\n"
    "      URL.revokeObjectURL(rpUrl);\n"
    "      setRpUrl(null);\n"
    "    }\n"
    "  };"
)
if pattern_handlers.search(src):
    src = pattern_handlers.sub(replacement_handlers, src, count=1)
else:
    # If not found, insert right after the existing handlers (older shapes)
    src = src.replace(
        "const closeReportPreviewDrawer = () => setRpOpen(false);",
        "const closeReportPreviewDrawer = () => setRpOpen(false);\n\n" + replacement_handlers
    )

# 4) Add two effects: refresh when inputs change, cleanup blob url
if "fetchPreviewPdf();" not in src:
    # already inserted in handlers; ensure effect exists
    pass

# Insert effects once (after closeReportPreviewDrawer)
src = re.sub(
    r"(const\s+closeReportPreviewDrawer\s*=\s*\(\)\s*=>\s*{[^}]*}\s*;\s*)",
    r"\1\n"
    r"  useEffect(() => {\n"
    r"    if (rpOpen) { fetchPreviewPdf(); }\n"
    r"    // eslint-disable-next-line react-hooks/exhaustive-deps\n"
    r"  }, [selectedUnit?.unitId, yearMonth]);\n\n"
    r"  useEffect(() => () => { if (rpUrl) URL.revokeObjectURL(rpUrl); }, [rpUrl]);\n",
    src, count=1, flags=re.DOTALL
)

# 5) Replace the inline <iframe src={`${API_BASE}/api/reports/preview?...`}> with loader/error + blob URL iframe
iframe_pat = re.compile(
    r"""<iframe\s+[^>]*src=\{\s*`\$\{API_BASE\}/api/reports/preview\?unitId=\$\{selectedUnit\.unitId\}&yearMonth=\$\{yearMonth\}`\s*\}[^>]*/>""",
    re.DOTALL | re.VERBOSE
)
iframe_repl = (
    "              <>\\n"
    "                {rpLoading && (\\n"
    "                  <div style={{ color:'#666', fontSize: 14, padding: 16 }}>Loading preview…</div>\\n"
    "                )}\\n"
    "                {rpError && !rpLoading && (\\n"
    "                  <div style={{ color:'crimson', fontSize: 14, padding: 16 }}>Error: {rpError}</div>\\n"
    "                )}\\n"
    "                {!rpLoading && !rpError && rpUrl && (\\n"
    "                  <iframe\\n"
    "                    src={rpUrl}\\n"
    "                    title=\"Owner Report Preview\"\\n"
    "                    style={{ width: '100%', height: '100%', border: 0 }}\\n"
    "                  />\\n"
    "                )}\\n"
    "              </>"
)
src = iframe_pat.sub(iframe_repl, src, count=1)

# Write if changed
if src != orig:
    backup = target.with_suffix(".jsx.bak")
    backup.write_text(orig, encoding="utf-8")
    target.write_text(src, encoding="utf-8")
    print(f"Updated {target} (backup at {backup})")
else:
    print("No changes applied (file already patched or patterns not found).")
