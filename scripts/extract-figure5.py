#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Recover Figure 5's visual fixture, not chess analysis, from the author's PDF.

Usage: python scripts/extract-figure5.py /path/to/ChessVis14.pdf
Requires pdfplumber. Coordinates, curves and visual events come from page 7;
the PDF contains neither FENs nor the engine search that produced the graph.
"""
import hashlib
import json
import math
import pathlib
import sys

import pdfplumber

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGIN = (36, 53.14)


def point(p):
    return [round(p[0] - ORIGIN[0], 4), round(p[1] - ORIGIN[1], 4)]


def path_d(path):
    return " ".join(
        ("Z" if op[0] == "h" else op[0].upper())
        + " ".join(" ".join(str(v) for v in point(p)) for p in op[1:])
        for op in path
    )


def color(value):
    if len(value) == 4:
        c, m, y, k = value
        value = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
    return "#" + "".join(f"{round(v * 255):02x}" for v in value)


def signature(c):
    return "".join(op[0] for op in c["path"])


def main():
    pdf = pathlib.Path(sys.argv[1])
    page = pdfplumber.open(pdf).pages[6]
    curves = [c for c in page.curves if c["x0"] >= 36 and c["x1"] < 414 and 53 < c["top"] < 166]
    groups = {}
    for c in curves:
        if signature(c) in ("mcccch", "mlllhh") and c["width"] < 5 and abs(c["width"] - c["height"]) < 0.01:
            key = (round(c["x0"], 2), round(c["top"], 2))
            groups.setdefault(key, []).append(c)
    nodes = []
    for group in groups.values():
        c = group[-1]
        fills = [g for g in group if g["fill"]]
        x, y = point((c["x0"] + c["width"] / 2, c["top"] + c["height"] / 2))
        nodes.append(dict(id=f"n{len(nodes)}", kind="trunk" if signature(c) == "mcccch" else "alternative",
                          x=x, y=y, size=round(c["width"], 4),
                          border=color(c["stroking_color"]),
                          fill=color(fills[-1]["non_stroking_color"]) if fills else "none",
                          mate=False))
    trunk = sorted((n for n in nodes if n["kind"] == "trunk"), key=lambda n: n["x"])
    for i, n in enumerate(trunk):
        n.update(move=i // 2 + 1, side="white" if i % 2 == 0 else "black", ply=i + 1)
    def nearest(p):
        x, y = point(p)
        return min(nodes, key=lambda n: math.hypot(n["x"] - x, n["y"] - y))
    for img in page.images:
        if img["x0"] < 414 and 53 < img["top"] < 166:
            n = nearest(((img["x0"] + img["x1"]) / 2, (img["top"] + img["bottom"]) / 2))
            n["mate"] = True
    edges = []
    max_gap = 0
    for i, c in enumerate(curves):
        if not signature(c).startswith("mc") or "h" in signature(c):
            continue
        start, end = c["path"][0][1], c["path"][-1][-1]
        source, target = nearest(start), nearest(end)
        max_gap = max(max_gap, math.dist(point(start), (source["x"], source["y"])),
                      math.dist(point(end), (target["x"], target["y"])))
        arrow = curves[i + 1]
        assert signature(arrow) == "mllhh", "Expected an arrowhead after every edge"
        # pdfminer applies the parent CTM to linewidth but misses the nested
        # 0.1 scale here. Verified against pdftocairo's SVG transformation.
        edges.append(dict(id=f"e{len(edges)}", source=source["id"], target=target["id"],
                          d=path_d(c["path"]), arrow=path_d(arrow["path"]),
                          width=round(c["linewidth"] / 10, 4),
                          dash=[round(v * .066508, 4) for v in c["dash"][0]]))
    # Keep both original translucent envelopes. These are visual coordinates,
    # not a newly invented centipawn series or a single 'played eval' line.
    bands = [c for c in page.curves if c["x0"] < 414 and c["top"] > 166 and c["top"] < 219
             and len(c["path"]) > 40 and c["fill"]]
    chart = [dict(d=path_d(c["path"]), fill=color(c["non_stroking_color"]), opacity=.498) for c in bands]
    labels = []
    chars = [c for c in page.chars if 166 < c["top"] < 218 and c["x0"] < 380]
    # Group contiguous characters on the same baseline into a move label.
    for c in chars:
        x, y = point((c["x0"], page.height - c["y0"]))
        if labels and abs(labels[-1]["y"] - y) < .02 and abs(labels[-1]["end"] - x) < .05:
            labels[-1]["text"] += c["text"]
            labels[-1]["end"] = c["x1"] - ORIGIN[0]
        else:
            labels.append(dict(x=x, y=y, text=c["text"], size=round(c["size"], 4),
                               fill=color(c["non_stroking_color"]), end=c["x1"] - ORIGIN[0]))
    for label in labels:
        del label["end"]
    unique_labels = []
    for label in labels:
        match = next((i for i, other in enumerate(unique_labels) if other['text'] == label['text']
                      and abs(other['x'] - label['x']) < .2 and abs(other['y'] - label['y']) < .2), None)
        if match is None:
            unique_labels.append(label)
        else:
            unique_labels[match] = label
    points = {}
    for c in page.curves:
        if c['x0'] < 380 and 166 < c['top'] < 219 and signature(c) == 'mcccch' and c['width'] < 1 and c['stroke']:
            x, y = point((c['x0'] + c['width'] / 2, c['top'] + c['height'] / 2))
            points[round(x, 2), round(y, 2)] = dict(x=x, y=y, color=color(c['stroking_color']))
    assert len(trunk) == 54
    assert len(edges) == 972
    assert max_gap < 3, f"Unresolved edge endpoint: {max_gap}"
    result = dict(provenance=dict(title="Chess Evolution Visualization, Figure 5", page=7,
                  url="https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf",
                  sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),
                  note="Recovered visual geometry; no legal positions or engine evaluations."),
                  width=490.168, height=169.673, nodes=nodes, edges=edges,
                  trunk=[n["id"] for n in trunk], chart=chart, labels=unique_labels, points=list(points.values()),
                  lens=dict(x=372.833556956-36, y=86.258242336-53.14, width=40.846154232, height=56.008448548),
                  inset=dict(x=424.81108864-36, y=77.890338792-53.14, width=98.031195808, height=133.54340844))
    target = ROOT / "src/fixtures/figure5.json"
    target.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(f"Recovered {len(nodes)} nodes ({len(trunk)} trunk), {len(edges)} edges, {sum(n['mate'] for n in nodes)} mates. Maximum endpoint gap {max_gap:.3f}pt.")


if __name__ == "__main__":
    main()
