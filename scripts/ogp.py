"""作品ごとのOGP画像（SNSでURLを貼ったときに出る 1200x630 のカード画像）を作る。

文字だけのデザイン（黒地・No.・題名・あらすじ・サイト名）。
Pillow とフォント（OGP_FONTS フォルダ、既定は .fonts/）が無いときは何もせず、
build.py は共通の assets/ogp.png を使う。

フォントは GitHub Actions がビルド前に google/fonts から取ってくる（.github/workflows/pages.yml）。
"""
import os
import random
from pathlib import Path

W, H = 1200, 630
PAD = 96
FONT_DIR = Path(os.environ.get("OGP_FONTS", Path(__file__).resolve().parent.parent / ".fonts"))
FONTS = {
    "serif": "NotoSerifJP.ttf",            # 題名（可変フォント。太さ600で使う）
    "sans": "ZenKakuGothicNew-Medium.ttf",  # あらすじ・サイト名
    "mono": "ShareTechMono-Regular.ttf",    # No.
}

BG, BG2 = (5, 7, 13), (11, 16, 32)
TEXT, DIM = (223, 231, 245), (139, 152, 179)
ACCENT, ACCENT2 = (110, 231, 255), (180, 140, 255)

# 行頭に来てはいけない文字（前の行の末尾にぶら下げる）
NO_HEAD = "、。，．・：；？！ー」』）】〉》〕…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ"


def available():
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return all((FONT_DIR / f).exists() for f in FONTS.values())


def _font(kind, size):
    from PIL import ImageFont
    f = ImageFont.truetype(str(FONT_DIR / FONTS[kind]), size)
    if kind == "serif":
        try:
            f.set_variation_by_axes([600])
        except Exception:
            pass
    return f


def _wrap(draw, text, font, width, max_lines):
    """行数を変えずに最後の行が短すぎない（数文字だけ残らない）幅を探して折り返す"""
    lines = _wrap_at(draw, text, font, width, max_lines)
    for w in range(width - 20, int(width * 0.75), -20):
        if len(lines[-1]) >= 6:
            break
        alt = _wrap_at(draw, text, font, w, max_lines)
        if len(alt) == len(lines) and not alt[-1].endswith("…"):
            lines = alt
    return lines


def _wrap_at(draw, text, font, width, max_lines):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=font) <= width or not cur or ch in NO_HEAD:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        last = lines[max_lines - 1]
        while last and draw.textlength(last + "…", font=font) > width:
            last = last[:-1]
        lines = lines[:max_lines - 1] + [last.rstrip("、。") + "…"]
    return lines


def _background(seed):
    from PIL import Image, ImageDraw, ImageFilter
    img = Image.new("RGB", (W, H), BG)
    px = ImageDraw.Draw(img)
    for y in range(H):  # 上から下へ、わずかに青みを帯びる
        t = y / H
        px.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG, BG2)))
    rnd = random.Random(seed)
    for _ in range(70):  # 星（作品ごとに配置が変わる）
        x, y = rnd.randrange(W), rnd.randrange(H)
        c = rnd.randrange(60, 150)
        px.point((x, y), fill=(c, c + 10, c + 30))
    # 枠線
    px.rectangle([36, 36, W - 37, H - 37], outline=(24, 52, 66), width=1)
    # 右上の惑星（光彩つき）
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    cx, cy, r = W - 150, 136, 46
    g.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=6)
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    img = Image.blend(img, Image.composite(glow, img, glow.convert("L")), 0.6)
    px = ImageDraw.Draw(img)
    px.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=3)
    px.line([(cx - 72, cy + 28), (cx + 72, cy - 28)], fill=ACCENT2, width=3)
    return img


def _gradient_text(img, xy, text, font):
    """題名を白→水色→紫のグラデーションで描く（共通OGP画像と同じ配色）"""
    from PIL import Image, ImageDraw
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255)
    box = mask.getbbox()
    if not box:
        return
    x0, x1 = box[0], box[2]
    grad = Image.new("RGB", img.size)
    gd = ImageDraw.Draw(grad)
    stops = [(0, (240, 246, 255)), (0.5, ACCENT), (1, ACCENT2)]
    for x in range(x0, x1 + 1):
        t = (x - x0) / max(1, x1 - x0)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1:
                u = (t - t0) / (t1 - t0)
                gd.line([(x, 0), (x, img.size[1])], fill=tuple(round(a + (b - a) * u) for a, b in zip(c0, c1)))
                break
    img.paste(grad, (0, 0), mask)


def render(path, *, no, title, description, site_title, author):
    from PIL import ImageDraw
    img = _background(title)
    d = ImageDraw.Draw(img)
    width = W - PAD * 2

    label = f"// No.{no}" if no and no != "---" else "// SHORT-SHORT"
    d.text((PAD, 104), label, font=_font("mono", 34), fill=ACCENT)

    # 題名は1行に収まるまで文字を小さくする
    size = 104
    while size > 48 and d.textlength(title, font=_font("serif", size)) > width - 120:
        size -= 4
    tf = _font("serif", size)
    _gradient_text(img, (PAD - 4, 168 + (104 - size) // 2), title, tf)

    df = _font("sans", 34)
    y = 340
    for line in _wrap(d, description, df, width, 3):
        d.text((PAD, y), line, font=df, fill=TEXT)
        y += 52

    sf = _font("sans", 28)
    d.text((PAD, H - 108), site_title, font=sf, fill=DIM)
    by = f"作 {author}"
    d.text((W - PAD - d.textlength(by, font=sf), H - 108), by, font=sf, fill=DIM)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
