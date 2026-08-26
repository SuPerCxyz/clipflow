#!/usr/bin/env python3
"""从源 Logo 图生成扩展全尺寸图标（16/32/48/128）。

默认源路径 ~/tmp/2.png，可用环境变量 CLIPFLOW_LOGO 覆盖：
    CLIPFLOW_LOGO=/path/to/logo.png python3 scripts/gen-icons.py
依赖：python3 + Pillow
"""
import os

from PIL import Image

SRC = os.environ.get("CLIPFLOW_LOGO") or os.path.expanduser("~/tmp/2.png")
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons"
)

if not os.path.exists(SRC):
    raise SystemExit(f"Logo 源文件不存在: {SRC}（可用 CLIPFLOW_LOGO 指定）")

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
