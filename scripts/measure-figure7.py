#!/usr/bin/env python3
"""Measure visual glyphs in the known Figure 7 artwork; no chess data inferred."""
import hashlib
import io
import json
import pathlib
import sys

import pdfplumber
from pypdf import PdfReader, PdfWriter

source = pathlib.Path(sys.argv[1])
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != "584bd5e16cfed095866c4b20651a737282a22ec69b28bce97611fe26abc61e7e":
    raise SystemExit("This measurement is calibrated only for the documented author PDF.")

writer = PdfWriter()
writer.add_page(PdfReader(source).pages[7].rotate(90))
buffer = io.BytesIO()
writer.write(buffer)
buffer.seek(0)

with pdfplumber.open(buffer) as document:
    page = document.pages[0]
    groups = {}
    for curve in page.curves:
        signature = "".join(op[0] for op in curve["path"])
        circle = signature == "mcccch" and 3.74 < curve["width"] < 3.76
        square = signature == "mlllhh" and 1.86 < curve["width"] < 1.88
        if curve["top"] < 156 and (circle or square):
            key = (round(curve["x0"], 2), round(curve["top"], 2))
            groups[key] = "circle" if circle else "square"
    circles = sum(kind == "circle" for kind in groups.values())
    assert circles == 90, f"Unexpected circle count: {circles}"
    print(json.dumps({
        "sha256": digest,
        "figure": 7,
        "visibleNodes": len(groups),
        "playedCircles": circles,
        "alternativeSquares": len(groups) - circles,
        "mateImageMarkers": sum(30 < image["top"] < 156 for image in page.images),
        "note": "Fill/stroke duplicates removed; enlarged inset and chart excluded.",
    }, indent=2))
