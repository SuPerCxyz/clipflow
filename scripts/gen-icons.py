#!/usr/bin/env python3
"""从源 Logo 图生成扩展全尺寸图标（16/32/48/128）。

源图优先级：环境变量 CLIPFLOW_LOGO > 仓库内 assets/logo.png > ~/tmp/2.png
依赖：python3 + Pillow
"""
import os

import numpy as np
from PIL import Image, ImageDraw

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


def load_source(path: str) -> Image.Image:
    """读取源图；若为不透明白底图，则抠除与边缘连通的白色背景。"""
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)

    if (arr[..., 3] < 255).any():
        return img  # 已带真实透明通道，直接使用

    # 与四角/四边连通的近白像素 → 置透明（Pillow floodfill 以种子色为基准）
    ff = img.copy()
    w, h = ff.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        try:
            ImageDraw.floodfill(ff, seed, (0, 0, 0, 0), thresh=48)
        except Exception:
            pass

    arr = np.array(ff)
    transparent = arr[..., 3] == 0
    if not transparent.any():
        print("⚠ 未检测到可抠除的白底（可能非白色背景），按原图继续")

    # 抗锯齿光晕软化：紧邻透明区的近白像素给渐变透明
    t4 = transparent
    for shift in (
        (lambda a: np.roll(a, 1, 0)),
        (lambda a: np.roll(a, -1, 0)),
        (lambda a: np.roll(a, 1, 1)),
        (lambda a: np.roll(a, -1, 1)),
    ):
        t4 = t4 | shift(transparent)
    rgb_min = arr[..., :3].min(axis=2)
    halo = t4 & ~transparent & (rgb_min >= 205)
    whiteness = np.clip((rgb_min[halo] - 205) / 47.0, 0, 1)
    new_alpha = (255 * (1 - whiteness)).astype(np.uint8)
    arr[..., 3][halo] = np.minimum(arr[..., 3][halo], new_alpha)

    return Image.fromarray(arr)


def main() -> None:
    img = load_source(SRC)

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


if __name__ == "__main__":
    main()
