#!/usr/bin/env python3
"""从源 Logo 图生成扩展全尺寸图标（16/32/48/128）。

源图优先级：环境变量 CLIPFLOW_LOGO > 仓库内 assets/logo.png > ~/tmp/2.png
依赖：python3 + Pillow
"""
import os

import numpy as np
from PIL import Image

CANDIDATES = [
    os.environ.get("CLIPFLOW_LOGO"),
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "assets", "logo.png"
    ),
    os.path.expanduser("~/tmp/2.png"),
]
SRC = next((p for p in CANDIDATES if p and os.path.exists(p)), None)

WHITE_HARD = 246  # ≥ 此白度直接透明
WHITE_SOFT = 232  # 渐变半透明下限
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons"
)

if not SRC:
    raise SystemExit(
        "未找到 Logo 源文件（尝试: $CLIPFLOW_LOGO / assets/logo.png / ~/tmp/2.png）"
    )


def load_source(path: str) -> Image.Image:
    """
    读取源图并统一做「全局白色键控」：
    - min(R,G,B) >= WHITE_HARD → 全透明
    - WHITE_SOFT <= min(R,G,B) < WHITE_HARD → 线性渐变半透明（抗锯齿边缘）
    已带真实透明通道的区域不受影响。
    """
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)

    rgb_min = arr[..., :3].min(axis=2)

    hard = rgb_min >= WHITE_HARD
    soft = (rgb_min >= WHITE_SOFT) & ~hard

    arr[..., 3][hard] = 0
    ramp = np.clip(
        (255 * (rgb_min[soft] - WHITE_SOFT) / (WHITE_HARD - WHITE_SOFT)),
        0,
        255,
    ).astype(np.uint8)
    arr[..., 3][soft] = np.minimum(arr[..., 3][soft], ramp)

    removed = hard.mean() * 100
    print(f"✓ 白色键控: 全透明 {removed:.1f}% | 渐变 {soft.mean()*100:.1f}%")
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
