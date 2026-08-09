#!/usr/bin/env python3
"""Генерация PNG-иконок для PWA без внешних зависимостей.

Рисует каплю на градиентном фоне и сохраняет набор размеров в public/assets/.
Запуск: python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "assets")

GRAD_TOP = (247, 168, 190)
GRAD_BOTTOM = (167, 139, 231)
DROP = (255, 255, 255)
SS = 4  # степень суперсэмплинга


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_square_alpha(x, y, radius):
    """x, y в диапазоне 0..1. Возвращает True, если точка внутри скруглённого квадрата."""
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9


def in_drop(x, y):
    """Классическая капля: круг снизу + конус к вершине."""
    apex_y, center_y, r = 0.235, 0.615, 0.205
    if (x - 0.5) ** 2 + (y - center_y) ** 2 <= r * r:
        return True
    if apex_y <= y <= center_y:
        t = (y - apex_y) / (center_y - apex_y)
        half = r * (t ** 1.35)
        return abs(x - 0.5) <= half
    return False


def render(size, maskable=False):
    corner = 0.0 if maskable else 0.235
    scale = 1.0 if not maskable else 0.78  # безопасная зона для maskable
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    inside_bg = True if maskable else rounded_square_alpha(x, y, corner)
                    if not inside_bg:
                        continue
                    # диагональный градиент
                    t = min(max((x * 0.35 + y * 0.75), 0.0), 1.0)
                    br = lerp(GRAD_TOP[0], GRAD_BOTTOM[0], t)
                    bg_ = lerp(GRAD_TOP[1], GRAD_BOTTOM[1], t)
                    bb = lerp(GRAD_TOP[2], GRAD_BOTTOM[2], t)

                    dx = (x - 0.5) / scale + 0.5
                    dy = (y - 0.5) / scale + 0.5
                    if in_drop(dx, dy):
                        # мягкий блик внутри капли
                        gloss = max(0.0, 1.0 - math.hypot(dx - 0.42, dy - 0.55) * 3.2) * 0.0
                        br, bg_, bb = (
                            lerp(DROP[0], br, gloss),
                            lerp(DROP[1], bg_, gloss),
                            lerp(DROP[2], bb, gloss),
                        )
                    r_acc += br
                    g_acc += bg_
                    b_acc += bb
                    a_acc += 255.0
            n = SS * SS
            a = a_acc / n
            if a <= 0.5:
                row += bytes((0, 0, 0, 0))
            else:
                cover = a / 255.0
                row += bytes(
                    (
                        int(round(r_acc / n / cover)),
                        int(round(g_acc / n / cover)),
                        int(round(b_acc / n / cover)),
                        int(round(a)),
                    )
                )
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
        ("favicon-64.png", 64, False),
    ]
    for name, size, maskable in targets:
        write_png(os.path.join(OUT_DIR, name), size, render(size, maskable))
        print(f"написан {name} ({size}px)")


if __name__ == "__main__":
    main()
