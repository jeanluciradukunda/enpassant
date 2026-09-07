#!/usr/bin/env python3
"""Render attributed research excerpts from the known author PDF (read-only).

Usage: python scripts/extract-paper-atlas.py /path/to/ChessVis14.pdf
Requires Poppler's pdftoppm, pypdf and pdfplumber. Outputs review crops and a
source-coordinate manifest; it does not infer chess positions from artwork.
"""
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile

import pdfplumber
from pypdf import PdfReader, PdfWriter

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHA = "584bd5e16cfed095866c4b20651a737282a22ec69b28bce97611fe26abc61e7e"
URL = "https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf"
# Physical author-manuscript pages. Coordinates in PDF points from top left;
# page 8 is read after a clockwise 90-degree rotation. Crops omit captions.
FIGURES = [
    (1, 1, [287, 328, 526, 463]),
    (2, 4, [37, 54, 273, 357]),
    (3, 5, [36, 52, 527, 238]),
    (4, 6, [287, 53, 527, 143]),
    (5, 7, [36, 53.14, 526.168, 222.813]),
    (6, 7, [35.8, 299, 275, 465]),
    (7, 8, [27.4, 31, 722, 206.6]),
    (8, 8, [27.4, 263, 722, 495.4]),
    (9, 9, [36, 53, 275, 133]),
    (10, 11, [36, 54, 526, 211]),
    (11, 12, [291, 145, 526, 299]),
]


def main():
    source = pathlib.Path(sys.argv[1]).resolve()
    if hashlib.sha256(source.read_bytes()).hexdigest() != SHA:
        raise SystemExit("Unknown PDF: crop coordinates are calibrated for the recorded hash.")
    poppler = shutil.which("pdftoppm")
    if not poppler:
        raise SystemExit("Install Poppler (pdftoppm) before extracting the atlas.")
    out = ROOT / "docs/research/images/atlas"
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"source": URL, "sha256": SHA, "pageConvention": "Physical author PDF page, 1-based",
                "rights": "Source artwork by Lu, Wang and Lin / rights holders; research excerpts, not application artwork or relicensed code.",
                "figures": []}
    with tempfile.TemporaryDirectory(prefix="enpassant-atlas-") as tmp:
        # Rotation is an intermediate reading aid, never a published PDF artifact.
        rotated = pathlib.Path(tmp) / "page-8-readable.pdf"
        writer = PdfWriter()
        writer.add_page(PdfReader(source).pages[7].rotate(90))
        writer.write(rotated)
        for number, page, box in FIGURES:
            pdf, physical = (rotated, 1) if page == 8 else (source, page)
            x0, y0, x1, y1 = box
            scale = 4  # 288 dpi; preserve small glyphs when magnifying.
            stem = out / f"figure-{number:02d}"
            subprocess.run([poppler, "-f", str(physical), "-l", str(physical), "-singlefile",
                            "-r", "288", "-x", str(round(x0 * scale)), "-y", str(round(y0 * scale)),
                            "-W", str(round((x1 - x0) * scale)), "-H", str(round((y1 - y0) * scale)),
                            "-png", str(pdf), str(stem)], check=True)
            manifest["figures"].append({"figure": number, "page": page,
                                         "rotation": 90 if page == 8 else 0, "bboxPoints": box,
                                         "image": f"figure-{number:02d}.png"})
    with pdfplumber.open(source) as doc:
        # Figure 9's gray circle has an outgoing continuation: record the source
        # object rather than interpreting it as a newly discovered chess rule.
        gray = [c for c in doc.pages[8].curves if c["fill"]
                and c.get("non_stroking_color") == (0.498, 0.498, 0.498)
                and "".join(op[0] for op in c["path"]) == "mcccch"]
        assert len(gray) == 1, "Expected the one gray circle observed in Figure 9."
        manifest["figure9GrayCircle"] = {k: gray[0][k] for k in
                                         ["x0", "top", "width", "height", "non_stroking_color", "stroking_color"]}
        page = doc.pages[8]
        groups = {}
        for c in page.curves:
            signature = "".join(op[0] for op in c["path"])
            if signature in ("mcccch", "mlllhh") and c["width"] < 12 and abs(c["width"] - c["height"]) < .01:
                key = round(c["x0"], 2), round(c["top"], 2)
                if key not in groups or c["fill"]:
                    groups[key] = c
        shapes = list(groups.values())
        centers = [(n["x0"] + n["width"] / 2, n["top"] + n["height"] / 2) for n in shapes]
        def nearest(point):
            return min(range(len(shapes)), key=lambda i: math.dist(point, centers[i]))
        nodes = [{"id": i, "x": round(centers[i][0], 3), "y": round(centers[i][1], 3),
                  "shape": "circle" if n["width"] > 8 else "square",
                  "fill": n["non_stroking_color"] if n["fill"] else None} for i, n in enumerate(shapes)]
        edges = []
        for i, c in enumerate(page.curves):
            signature = "".join(op[0] for op in c["path"])
            if signature.startswith("mc") and "h" not in signature:
                arrow = page.curves[i + 1]
                assert "".join(op[0] for op in arrow["path"]) == "mllhh"
                # Use the actual arrow tip. A spline ends before its arrowhead;
                # nearest-center matching there misidentifies the gray-04 return.
                edges.append({"source": nearest(c["path"][0][1]),
                              "target": nearest(arrow["path"][1][1]),
                              "dash": c["dash"]})
        backward = [e for e in edges if centers[e["source"]][0] > centers[e["target"]][0]]
        assert len(backward) == 5
        assert all(shapes[e["target"]]["non_stroking_color"] == (.498, .498, .498) for e in backward)
        topology = {"sourceSha256": SHA, "page": 9,
                    "note": "Artwork geometry only, no FENs. Targets matched using arrow tips. All five observed backward edges return to gray glyphs; gray circle 04 also has the forward solution continuation.",
                    "nodes": nodes, "edges": edges, "backwardEdges": backward}
        (out / "figure9-topology.json").write_text(json.dumps(topology, indent=2) + "\n")
    fixture = json.loads((ROOT / "src/fixtures/figure5.json").read_text())
    by_id = {n["id"]: n for n in fixture["nodes"]}
    compressed = [e for e in fixture["edges"] if e["dash"]]
    consecutive = [e for e in compressed if all(by_id[e[k]]["kind"] == "alternative"
                   and by_id[e[k]]["fill"] == "#ffffff" for k in ("source", "target"))]
    measurements = {"provenance": "Source-derived src/fixtures/figure5.json, not fresh chess analysis. PDF width transforms were calibrated in its extraction script. Ratios are before browser zoom.",
                    "sourceSha256": fixture["provenance"]["sha256"], "figure": 5,
                    "compressedEdges": len(compressed),
                    "compressedStrokeWidths": sorted({e["width"] for e in compressed}),
                    "compressedDashArrays": sorted({tuple(e["dash"]) for e in compressed}),
                    "circleDiameter": 3.8574, "squareSide": 1.9288,
                    "circleToSquareRatio": 3.8574 / 1.9288,
                    "compressedStrokeToSquareRatio": .6651 / 1.9288,
                    "compressedWhiteCheckToWhiteCheckEdges": len(consecutive),
                    "examples": [{"edge": e["id"], "source": e["source"], "target": e["target"]} for e in consecutive[:4]],
                    "appAtCommit": "249f7159c6cdd11ced49b980d37d9fb19cb049f9",
                    "appCircleDiameter": 13.6, "appSquareSide": 5.2,
                    "appNeutralCompressedStroke": .38, "appNeutralCompressedDash": [1.1, 1.65]}
    (out / "visual-measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Rendered {len(FIGURES)} figure excerpts and a source manifest to {out}")


if __name__ == "__main__":
    main()
