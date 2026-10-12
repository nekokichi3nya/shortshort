#!/usr/bin/env python3
"""stories/*.md から静的サイトを _site/ に生成する（標準ライブラリのみ）。

使い方: python3 scripts/build.py
"""
import datetime
import html
import json
import re
import shutil
import subprocess
from urllib.parse import quote
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
STORIES = ROOT / "stories"
ASSETS = ROOT / "assets"
IMAGES = ROOT / "images"
IMAGE_EXTS = (".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif")

site = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
BASE = site["url"].rstrip("/")
# サブパス（/shortshort）を相対ではなく絶対パスで扱うため
BASE_PATH = re.sub(r"^https?://[^/]+", "", BASE)

esc = html.escape


def parse_story(path):
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    meta = {}
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).split("\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"')
        text = text[m.end():]
    lines = text.strip("\n").split("\n")
    # 先頭の「# タイトル」行はタイトルとして扱う
    if lines and lines[0].startswith("# "):
        meta.setdefault("title", lines[0][2:].strip())
        lines = lines[1:]
    meta.setdefault("title", path.stem)
    meta.setdefault("date", git_date(path))
    meta["added"] = git_added(path)
    meta["slug"] = meta.get("slug") or path.stem
    body = "\n".join(lines).strip("\n")
    meta["genre"] = meta.get("genre", "")
    meta["tags"] = [t.strip() for t in re.split(r"[,、，]", meta.get("tags", "")) if t.strip()]
    meta["text"] = re.sub(r"\s+", "", body)
    meta["chars"] = len(meta["text"])
    meta.setdefault("description", excerpt(body))
    meta["html"] = render_body(body)
    meta["image"] = story_image(meta)
    meta["image_alt"] = meta.get("image_alt", "")
    return meta


def story_image(meta):
    """front matter の image（images/ からの相対パスか URL）。無ければ images/<slug>.* を自動で使う。"""
    src = meta.get("image", "")
    if src:
        if re.match(r"^https?://", src):
            return src
        src = src.removeprefix("/").removeprefix("images/")
        return f"{BASE_PATH}/images/{src}"
    for ext in IMAGE_EXTS:
        if (IMAGES / f"{meta['slug']}{ext}").exists():
            return f"{BASE_PATH}/images/{meta['slug']}{ext}"
    return ""


def absolute(src):
    return src if re.match(r"^https?://", src) else BASE + src.removeprefix(BASE_PATH)


def git_date(path):
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%as", "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split()
        if out:
            return out[-1]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return datetime.date.today().isoformat()


def git_added(path):
    """リポジトリに初めて追加されたコミットの時刻（UNIX秒）。同じ掲載日の作品を掲載順に並べるのに使う。"""
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%ct", "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split()
        if out:
            return int(out[-1])
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return float("inf")  # 未コミットの新作は最後


def excerpt(body, n=90):
    flat = re.sub(r"\s+", "", body)
    return flat[:n] + ("…" if len(flat) > n else "")


def render_body(body):
    """各行を段落にする。空行は一行分のアキ、「***」「◇」だけの行は区切りの飾りになる。"""
    parts = []
    gap = False
    for line in body.split("\n"):
        t = line.strip("　 ")
        if not t:
            gap = True
            continue
        if re.fullmatch(r"(\*\s*){3}|[◇◆＊※]+", t):
            parts.append('<div class="scene-break" aria-hidden="true"><span></span></div>')
            gap = False
            continue
        cls = ["dialogue"] if t.startswith(("「", "『")) else []
        if gap and parts:
            cls.append("gap")
        gap = False
        attr = f' class="{" ".join(cls)}"' if cls else ""
        parts.append(f"<p{attr}>{esc(line)}</p>")
    return "\n".join(parts)


def page(*, title, description, path, body, og_type="website", jsonld=None, image=""):
    url = BASE + path
    full_title = title if title == site["title"] else f"{title}｜{site['title']}"
    verify = site.get("google_site_verification", "").strip()
    verify_tag = f'\n  <meta name="google-site-verification" content="{esc(verify)}">' if verify else ""
    # SNS は SVG を表示できないので、SVG のときは共通の OGP 画像を使う
    og_image = absolute(image) if image and not image.lower().endswith(".svg") else f"{BASE}/assets/ogp.png"
    ld = f'\n  <script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    return f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(full_title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="author" content="{esc(site['author'])}">
  <link rel="canonical" href="{url}">{verify_tag}
  <meta property="og:site_name" content="{esc(site['title'])}">
  <meta property="og:title" content="{esc(full_title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{esc(og_image)}">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#05070d">
  <link rel="icon" href="{BASE_PATH}/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&family=Zen+Kaku+Gothic+New:wght@500;700&family=Orbitron:wght@500;700&family=Share+Tech+Mono&display=swap">
  <link rel="stylesheet" href="{BASE_PATH}/assets/style.css">{ld}
</head>
<body>
  <div class="stars" aria-hidden="true"></div>
  <header class="site-header">
    <a class="brand" href="{BASE_PATH}/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">{esc(site['title'])}</span>
    </a>
    <span class="brand-tag">{esc(site['tagline'])}</span>
  </header>
{body}
  <footer class="site-footer">
    <p>&copy; {datetime.date.today().year} {esc(site['author'])}</p>
    <p class="mono">END OF TRANSMISSION</p>
  </footer>
</body>
</html>
"""


def story_url(s):
    return f"/works/{s['slug']}/"


def filter_url(key, value):
    return f"{BASE_PATH}/?{key}={quote(value)}"


def story_labels(s):
    """作品ページ用のジャンル・タグ（一覧の絞り込みへのリンク）。"""
    items = []
    if s["genre"]:
        items.append(f'<a class="label label-genre" href="{filter_url("genre", s["genre"])}">{esc(s["genre"])}</a>')
    items += [f'<a class="label" href="{filter_url("tag", t)}">#{esc(t)}</a>' for t in s["tags"]]
    return f'\n        <p class="labels">{"".join(items)}</p>' if items else ""


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ASSETS, OUT / "assets")
    if IMAGES.exists():
        shutil.copytree(IMAGES, OUT / "images")
    (OUT / ".nojekyll").write_text("")

    stories = [parse_story(p) for p in sorted(STORIES.glob("*.md"))]
    # 掲載日（同日なら掲載順）の古い順に通し番号を振り、一覧は新しい順に並べる
    stories.sort(key=lambda s: (s["date"], s["added"], s["slug"]))
    for i, s in enumerate(stories, 1):
        s["no"] = f"{i:03d}"
    newest_first = list(reversed(stories))

    # 作品ページ
    for i, s in enumerate(stories):
        prev_s = stories[i - 1] if i > 0 else None
        next_s = stories[i + 1] if i + 1 < len(stories) else None
        nav = []
        if prev_s:
            nav.append(f'<a class="nav-prev" href="{BASE_PATH}{story_url(prev_s)}"><span class="mono">&lt; PREV</span>{esc(prev_s["title"])}</a>')
        else:
            nav.append("<span></span>")
        nav.append(f'<a class="nav-index" href="{BASE_PATH}/"><span class="mono">INDEX</span>作品一覧</a>')
        if next_s:
            nav.append(f'<a class="nav-next" href="{BASE_PATH}{story_url(next_s)}"><span class="mono">NEXT &gt;</span>{esc(next_s["title"])}</a>')
        else:
            nav.append("<span></span>")
        minutes = max(1, round(s["chars"] / 500))
        visual = f"""
        <figure class="story-visual"><img src="{esc(s['image'])}" alt="{esc(s['image_alt'])}" width="960" height="420"></figure>""" if s["image"] else ""
        body = f"""  <main class="reader">
    <article>
      <header class="story-header">{visual}
        <p class="mono story-meta">FILE No.{s['no']} // {esc(s['date'])}</p>
        <h1 class="story-title">{esc(s['title'])}</h1>
        <p class="story-byline">{esc(site['author'])}</p>
        <p class="mono story-stats">{s['chars']:,} 字 · 約 {minutes} 分</p>{story_labels(s)}
      </header>
      <div class="story-body">
{s['html']}
      </div>
      <p class="story-end mono" aria-hidden="true">— END —</p>
    </article>
    <nav class="story-nav" aria-label="作品間の移動">
      {''.join(nav)}
    </nav>
  </main>"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "ShortStory",
            "headline": s["title"],
            "name": s["title"],
            "description": s["description"],
            "author": {"@type": "Person", "name": site["author"]},
            "datePublished": s["date"],
            "inLanguage": "ja",
            **({"genre": s["genre"]} if s["genre"] else {}),
            **({"keywords": ", ".join(s["tags"])} if s["tags"] else {}),
            **({"image": absolute(s["image"])} if s["image"] else {}),
            "url": BASE + story_url(s),
            "isPartOf": {"@type": "WebSite", "name": site["title"], "url": BASE + "/"},
        }
        out = OUT / "works" / s["slug"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(title=s["title"], description=s["description"], path=story_url(s),
                            body=body, og_type="article", jsonld=jsonld, image=s["image"]), encoding="utf-8")

    # トップページ（検索・ジャンル絞り込みは assets/search.js がクライアント側で行う）
    def card(s):
        labels = ""
        if s["genre"] or s["tags"]:
            parts = [f'<span class="label label-genre">{esc(s["genre"])}</span>'] if s["genre"] else []
            parts += [f'<span class="label">#{esc(t)}</span>' for t in s["tags"]]
            labels = f'\n          <span class="labels">{"".join(parts)}</span>'
        thumb = f"""
          <span class="card-thumb"><img src="{esc(s['image'])}" alt="" width="960" height="420" loading="lazy"></span>""" if s["image"] else ""
        return f"""      <li data-slug="{esc(s['slug'])}">
        <a class="card{' has-thumb' if s['image'] else ''}" href="{BASE_PATH}{story_url(s)}">{thumb}
          <span class="mono card-no">No.{s['no']}</span>
          <h2 class="card-title">{esc(s['title'])}</h2>
          <p class="card-desc">{esc(s['description'])}</p>{labels}
          <span class="mono card-meta">{esc(s['date'])} · {s['chars']:,} 字</span>
        </a>
      </li>"""

    cards = "\n".join(card(s) for s in newest_first)
    genres = sorted({s["genre"] for s in stories if s["genre"]})
    chips = "".join(f'<button type="button" class="chip" data-genre="{esc(g)}">{esc(g)}</button>' for g in genres)
    genre_bar = f"""
      <div class="chips" role="group" aria-label="ジャンルで絞り込む">
        <button type="button" class="chip" data-genre="" aria-pressed="true">すべて</button>{chips}
      </div>""" if genres else ""
    body = f"""  <main class="home">
    <section class="hero">
      <p class="mono hero-eyebrow">// ARCHIVE ONLINE · {len(stories)} FILES</p>
      <h1 class="hero-title">{esc(site['title'])}</h1>
      <p class="hero-desc">{esc(site['description'])}</p>
    </section>
    <h2 class="section-label mono">STORIES</h2>
    <form class="finder" role="search" onsubmit="return false">
      <label class="search">
        <span class="mono search-label">SEARCH</span>
        <input type="search" id="q" name="q" placeholder="タイトル・本文・タグで検索" autocomplete="off">
      </label>{genre_bar}
      <p class="mono finder-status" id="finder-status" aria-live="polite"></p>
    </form>
    <ul class="cards">
{cards}
    </ul>
    <p class="empty" id="empty" hidden>該当する作品は見つかりませんでした。</p>
  </main>
  <script>window.SEARCH_INDEX = "{BASE_PATH}/search.json";</script>
  <script src="{BASE_PATH}/assets/search.js" defer></script>"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": site["title"],
        "description": site["description"],
        "url": BASE + "/",
        "inLanguage": "ja",
        "author": {"@type": "Person", "name": site["author"]},
    }
    (OUT / "index.html").write_text(page(title=site["title"], description=site["description"],
                                         path="/", body=body, jsonld=jsonld), encoding="utf-8")

    # 404
    body = f"""  <main class="home">
    <section class="hero">
      <p class="mono hero-eyebrow">// ERROR 404</p>
      <h1 class="hero-title">SIGNAL LOST</h1>
      <p class="hero-desc">お探しのページは見つかりませんでした。<a href="{BASE_PATH}/">作品一覧へ戻る</a></p>
    </section>
  </main>"""
    (OUT / "404.html").write_text(page(title="ページが見つかりません", description=site["description"],
                                       path="/404.html", body=body), encoding="utf-8")

    # 検索用インデックス
    index = [{"slug": s["slug"], "title": s["title"], "description": s["description"],
              "genre": s["genre"], "tags": s["tags"], "text": s["text"]} for s in stories]
    (OUT / "search.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")

    # sitemap.xml / robots.txt
    latest = newest_first[0]["date"] if stories else datetime.date.today().isoformat()
    urls = [(BASE + "/", latest)] + [(BASE + story_url(s), s["date"]) for s in stories]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{esc(u)}</loc><lastmod>{d}</lastmod></url>" for u, d in urls]
    sitemap.append("</urlset>\n")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")

    print(f"built {len(stories)} stories -> {OUT}")


if __name__ == "__main__":
    build()
