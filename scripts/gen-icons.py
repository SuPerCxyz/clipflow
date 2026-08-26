#!/usr/bin/env python3
"""从源 Logo 图生成扩展全尺寸图标（16/32/48/128）。

源图优先级：环境变量 CLIPFLOW_LOGO > 仓库内 assets/logo.png > ~/tmp/2.png
依赖：python3 + Pillow
"""
import os

from PIL import Image

CANDIDATES = [
    os.environ.get("CLIPFLOW_LOGO"),
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "assets", "logo.png"
    ),
    os.path.expanduser("~/tmp/2.png"),
]
SRC = next((p for p in CANDIDATES if p and os.path.exists(p)), None)
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons"
)

if not SRC:
    raise SystemExit(
        "未找到 Logo 源文件（尝试: $CLIPFLOW_LOGO / assets/logo.png / ~/tmp/2.png）"
    )

os.makedirs(OUT, exist_ok=True)
img = Image.open(SRC).convert("RGBA")

# 非正方形源图：中心裁剪为正方形，避免拉伸变形
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
img = img.crop((left, top, left + side, top + side))

for size in (16, 32, 48, 128):
    resized = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, f"icon{size}.png")
    resized.save(path, optimize=True)
    print(f"✓ {os.path.normpath(path)} ({size}x{size})")
