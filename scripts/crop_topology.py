"""Soru sayfasindan topoloji bolgesini kirpip 300 dpi PNG olarak kaydeder.

Kullanim:
  python scripts/crop_topology.py <sayfa_no> <x0> <y0> <x1> <y1> <cikti.png>

Koordinatlar work/page-XX.png uzerindeki 200 dpi piksel koordinatlaridir
(sol-ust kose orijin). Cikti, ayni bolgenin PDF'ten 300 dpi'da yeniden
render edilmis halidir (daha keskin).
"""

import pathlib
import sys

import fitz  # PyMuPDF

PDF = "input/CCNP_ENCOR_LAB_June_2026.pdf"

page_no, x0, y0, x1, y1, out = sys.argv[1:7]
scale = 72 / 200  # 200 dpi piksel -> PDF punto
clip = fitz.Rect(float(x0) * scale, float(y0) * scale, float(x1) * scale, float(y1) * scale)

doc = fitz.open(PDF)
page = doc[int(page_no) - 1]
pix = page.get_pixmap(dpi=300, clip=clip)
pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
pix.save(out)
print(f"{out} yazildi ({pix.width}x{pix.height}).")
