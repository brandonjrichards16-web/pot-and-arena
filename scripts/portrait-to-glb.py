#!/usr/bin/env python3
"""
Convert painted hero portraits → real textured GLB meshes (TripoSR).

This is the ONLY approved path to "3D of OUR hero":
  portraits → TripoSR (Stability HF Space) → assets/models/from_art/{name}.glb

Usage:
  python3 scripts/portrait-to-glb.py              # all original_bg portraits
  python3 scripts/portrait-to-glb.py boy_0 girl_0 # specific

Requires: pip install gradio_client
"""
from __future__ import annotations

import os
import shutil
import sys

from gradio_client import Client, handle_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "mobile/assets/characters/original_bg")
OUT = os.path.join(ROOT, "mobile/assets/models/from_art")


def convert_one(client: Client, name: str) -> str | None:
    src = os.path.join(SRC, f"{name}.jpg")
    if not os.path.isfile(src):
        print(f"  missing {src}")
        return None
    print(f"=== {name}", flush=True)
    processed = client.predict(
        handle_file(src),
        True,  # remove background
        0.92,  # tighter crop → less empty volume / blob
        api_name="/preprocess",
    )
    print("  preprocessed", flush=True)
    result = client.predict(
        handle_file(processed),
        320,  # max marching-cubes on public TripoSR space
        api_name="/generate",
    )
    paths = result if isinstance(result, (list, tuple)) else [result]
    glb = next((str(p) for p in paths if p and str(p).lower().endswith(".glb")), None)
    if not glb:
        print("  no glb in", result)
        return None
    dest = os.path.join(OUT, f"{name}.glb")
    shutil.copy(glb, dest)
    print(f"  SAVED {dest} ({os.path.getsize(dest)} bytes)", flush=True)
    return dest


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or [
        "boy_0",
        "boy_1",
        "boy_2",
        "girl_0",
        "girl_1",
        "girl_2",
    ]
    print("Connecting stabilityai/TripoSR …", flush=True)
    client = Client("stabilityai/TripoSR")
    ok = 0
    for name in names:
        try:
            if convert_one(client, name):
                ok += 1
        except Exception as e:
            print(f"  FAIL {name}: {type(e).__name__}: {e}", flush=True)
    print(f"Done: {ok}/{len(names)} → {OUT}")


if __name__ == "__main__":
    main()
