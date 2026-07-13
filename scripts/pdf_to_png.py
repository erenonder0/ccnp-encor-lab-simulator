"""PDF sayfalarini work/page-XX.png olarak render eder (200 dpi).

Kullanim: python scripts/pdf_to_png.py
Gereksinim: pip install pymupdf
"""

import pathlib

import fitz  # PyMuPDF

PDF = "input/CCNP_ENCOR_LAB_June_2026.pdf"

pathlib.Path("work").mkdir(exist_ok=True)
doc = fitz.open(PDF)
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=200)
    pix.save(f"work/page-{i:02d}.png")
print(f"{len(doc)} sayfa work/ altina yazildi.")
