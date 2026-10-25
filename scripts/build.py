#!/usr/bin/env python3
"""stories/*.md から静的サイトを _site/ に生成する（標準ライブラリのみ。作品ごとのOGP画像だけ Pillow を使う）。

使い方: python3 scripts/build.py
"""
import datetime
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from urllib.parse import quote
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
STORIES = ROOT / "stories"
ASSETS = ROOT / "assets"


def asset(name):
    """CSS/JS の URL。中身が変わると ?v= が変わり、ブラウザの古いキャッシュを使わせない"""
    v = hashlib.sha1((ASSETS / name).read_bytes()).hexdigest()[:8]
    return f"{BASE_PATH}/assets/{name}?v={v}"

site = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
BASE = site["url"].rstrip("/")
# サブパス（/shortshort）を相対ではなく絶対パスで扱うため
BASE_PATH = re.sub(r"^https?://[^/]+", "", BASE)

esc = html.escape

sys.path.insert(0, str(ROOT / "scripts"))
import ogp  # noqa: E402  作品ごとのOGP画像（Pillow とフォントがあるときだけ作る）

OGP_DEFAULT = f"{BASE}/assets/ogp.png"

ABOUT_PATH = "/about/"


def x_url(value):
    """site.json の author_x（@名前・名前・URLのどれでもよい）を X のプロフィールURLにする。"""
    v = (value or "").strip()
    if not v:
        return ""
    if v.startswith("http"):
        return v
    return "https://x.com/" + v.lstrip("@")


AUTHOR_X = x_url(site.get("author_x"))
AUTHOR_KAKUYOMU = (site.get("author_kakuyomu") or "").strip()
AUTHOR = {"@type": "Person", "name": site["author"], "url": BASE + ABOUT_PATH,
          **({"sameAs": [AUTHOR_X]} if AUTHOR_X else {})}


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
    # 読み上げの読み方（「yomi: 千夏=ちなつ, 一日=いちにち」）。画面の文字はそのまま
    meta["yomi"] = dict(p.split("=", 1) for p in (q.strip() for q in re.split(r"[,、，]", meta.get("yomi", ""))) if "=" in p)
    # カクヨムにも載せた作品（「kakuyomu: 作品URL」。URLが無ければ「kakuyomu: yes」で作者ページへ）
    k = meta.get("kakuyomu", "").strip()
    meta["kakuyomu_url"] = k if k.startswith("http") else (AUTHOR_KAKUYOMU if k.lower() in ("yes", "true", "1") else "")
    # 時間限定の作品（「open: 2-4」で午前2時〜4時、読者の端末の時刻）。隠し作品と同じく番号・検索に含めない
    m = re.fullmatch(r"(\d{1,2})\s*-\s*(\d{1,2})", meta.get("open", "").strip())
    meta["open"] = (int(m.group(1)), int(m.group(2))) if m else None
    meta["text"] = re.sub(r"\s+", "", body)
    meta["chars"] = len(meta["text"])
    meta.setdefault("description", excerpt(body))
    meta["html"] = render_body(body)
    return meta


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


def page(*, title, description, path, body, og_type="website", jsonld=None, noindex=False, image=OGP_DEFAULT):
    url = BASE + path
    full_title = title if title == site["title"] else f"{title}｜{site['title']}"
    verify = site.get("google_site_verification", "").strip()
    verify_tag = f'\n  <meta name="google-site-verification" content="{esc(verify)}">' if verify else ""
    robots = '\n  <meta name="robots" content="noindex, nofollow">' if noindex else ""
    ld = f'\n  <script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    return f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(full_title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="author" content="{esc(site['author'])}">
  <link rel="canonical" href="{url}">{verify_tag}{robots}
  <meta property="og:site_name" content="{esc(site['title'])}">
  <meta property="og:title" content="{esc(full_title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#05070d">
  <link rel="icon" href="{BASE_PATH}/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&family=Zen+Kaku+Gothic+New:wght@500;700&family=Orbitron:wght@500;700&family=Share+Tech+Mono&display=swap">
  <link rel="stylesheet" href="{asset("style.css")}">{ld}
  <script>try {{ var f = localStorage.getItem("font-size"); if (f) document.documentElement.dataset.fs = f;
    var w = localStorage.getItem("writing-mode"); if (w) document.documentElement.dataset.wm = w; }} catch (e) {{}}</script>
  <script>window.SITE_BASE = "{BASE_PATH}";</script>
  <script src="{asset("reader.js")}" defer></script>
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
    <p>&copy; {datetime.date.today().year} <a class="footer-author" href="{BASE_PATH}{ABOUT_PATH}" rel="author">{esc(site['author'])}</a></p>
    <p class="mono footer-end">END OF TRANSMISSION</p>
  </footer>
  <script>
    // 3作読み終えると、どのページでもフッターの END OF TRANSMISSION が「分岐点」端末（トップ）への入口になる
    (function () {{
      try {{ if ((JSON.parse(localStorage.getItem("read-stories")) || []).length < 3) return; }} catch (e) {{ return; }}
      var p = document.querySelector(".footer-end"), a = document.createElement("a");
      a.href = "{BASE_PATH}/transit/"; a.className = "footer-transit"; a.textContent = p.textContent; a.title = "分岐点";
      p.textContent = ""; p.appendChild(a);
    }})();
  </script>
</body>
</html>
"""


def story_url(s):
    return f"/works/{s['slug']}/"


def read_minutes(s):
    """読了時間（1分＝500字）。"""
    return max(1, round(s["chars"] / 500))


def share_link(s):
    """作品をXで共有する投稿画面へのリンク。"""
    text = f"「{s['title']}」{site['author']}"
    href = ("https://x.com/intent/post?text=" + quote(text) + "&url=" + quote(BASE + story_url(s), safe="")
            + "&hashtags=" + quote("ショートショート"))
    return f"""
    <p class="share"><a class="share-x" href="{esc(href)}" target="_blank" rel="noopener">Xでシェアする</a></p>"""


READ_TOGGLE = ('\n      <p class="read-toggle-wrap"><button type="button" class="read-toggle mono" hidden></button>'
               '<button type="button" class="fav-toggle mono" hidden></button></p>')
RANDOM_BUTTON = '<button type="button" class="random-btn" hidden><span class="mono">RANDOM</span>ランダムに1作読む</button>'


def font_switch():
    btns = "".join(f'<button type="button" data-fs="{k}" aria-label="文字サイズ{v}">{v}</button>'
                   for k, v in (("s", "小"), ("m", "中"), ("l", "大")))
    wm = "".join(f'<button type="button" data-wm="{k}" aria-label="{v}書き">{v}</button>' for k, v in (("h", "横"), ("v", "縦")))
    return (f'\n        <div class="view-switch"><div class="fs-switch" role="group" aria-label="文字サイズ"><span class="mono">TEXT</span>{btns}</div>'
            f'<div class="fs-switch wm-switch" role="group" aria-label="縦書き・横書き"><span class="mono">LAYOUT</span>{wm}</div></div>')


def tts_panel():
    """読み上げの操作パネル。対応していないブラウザでは speech.js が表示しないまま。"""
    def group(label, attr, items):
        btns = "".join(f'<button type="button" {attr}="{k}" aria-pressed="false">{v}</button>' for k, v in items)
        return f'<div class="fs-switch" role="group" aria-label="{label}"><span class="mono">{label}</span>{btns}</div>'
    return f"""
        <div class="tts" hidden>
          <div class="tts-main"><span class="mono tts-label">VOICE</span><button type="button" class="tts-play">▶ 読み上げる</button><button type="button" class="tts-stop" disabled>■ 停止</button></div>
          <div class="view-switch">{group("声", "data-voice", (("f", "女性"), ("m", "男性")))}{group("速さ", "data-rate", (("slow", "ゆっくり"), ("normal", "ふつう"), ("fast", "はやめ"), ("faster", "はやい")))}{group("次の作品へ", "data-auto", (("off", "止める"), ("on", "続けて読む")))}</div>
          <p class="tts-note" hidden></p>
        </div>"""


def next_reads(s, stories):
    """読み終わりに出す「次の一作」。同じジャンル・共通のタグが多い順、同点なら新しい順。
    未読を優先して3作を選ぶのは reader.js（JS がなければ先頭の3作を出す）。"""
    def score(o):
        return (2 if s["genre"] and o["genre"] == s["genre"] else 0) + len(set(s["tags"]) & set(o["tags"]))
    others = sorted((o for o in stories if o is not s), key=lambda o: (score(o), o["date"], o["no"]), reverse=True)
    if not others:
        return ""
    items = "\n".join(f"""        <li data-slug="{esc(o['slug'])}"{" hidden" if i >= 3 else ""}>
          <a class="card card-mini" href="{BASE_PATH}{story_url(o)}">
            <span class="mono card-no">No.{o['no']}</span>
            <span class="card-title">{esc(o['title'])}</span>
            <span class="card-desc">{esc(o['description'])}</span>
            <span class="mono card-meta">約 {read_minutes(o)} 分</span>
          </a>
        </li>""" for i, o in enumerate(others))
    return f"""
    <section class="next-reads">
      <h2 class="section-label mono">NEXT FILES</h2>
      <p class="next-lead">次に読むなら</p>
      <ul class="next-list">
{items}
      </ul>
    </section>"""


def filter_url(key, value):
    return f"{BASE_PATH}/?{key}={quote(value)}"


REVIEWS_API = site.get("reviews_endpoint", "").strip()
# 評価に添えて選べる感想（reviews/apps-script.gs の REACTIONS と同じにする）
REACTIONS = ["ゾッとした", "切なかった", "オチにやられた", "考えさせられた", "ありそうで怖い", "また読みたい"]


def reviews_script():
    """星評価の読み込み。site.json の reviews_endpoint が空なら何も出さない。"""
    if not REVIEWS_API:
        return ""
    return f"""
  <script>window.REVIEWS_ENDPOINT = {json.dumps(REVIEWS_API)};</script>
  <script src="{asset("reviews.js")}" defer></script>"""


def reviews_section(s):
    if not REVIEWS_API:
        return ""
    radios = "".join(
        f'<input type="radio" id="star{n}" name="rating" value="{n}">'
        f'<label for="star{n}" title="{n}点"><span class="visually-hidden">{n}点</span></label>'
        for n in range(5, 0, -1))
    chips = "".join(
        f'<label class="reaction"><input type="checkbox" name="reactions" value="{esc(r)}"><span>{esc(r)}</span></label>'
        for r in REACTIONS)
    return f"""
    <section class="reviews" id="reviews" data-slug="{esc(s['slug'])}" aria-labelledby="reviews-title">
      <h2 class="section-label mono" id="reviews-title">REVIEWS</h2>
      <p class="review-summary">読み込み中…</p>
      <ul class="reaction-counts" hidden></ul>
      <form class="review-form">
        <fieldset class="star-input">
          <legend>この作品の評価</legend>
          <div class="star-row">{radios}</div>
        </fieldset>
        <fieldset class="reaction-input">
          <legend>ひとこと（任意・いくつでも）</legend>
          <div class="reaction-row">{chips}</div>
        </fieldset>
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit">送信する</button>
      </form>
      <p class="review-status" aria-live="polite"></p>
    </section>"""


def kakuyomu_link(s):
    """カクヨムにも掲載している作品なら、作品ページにリンクを出す。"""
    if not s["kakuyomu_url"]:
        return ""
    return f'\n        <p class="story-kakuyomu"><a href="{esc(s["kakuyomu_url"])}" rel="noopener" target="_blank">カクヨムにも掲載中</a></p>'


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
    (OUT / ".nojekyll").write_text("")

    stories = [parse_story(p) for p in sorted(STORIES.glob("*.md"))]
    # hidden: true の作品（隠し作品）はURLを知っている人だけが読める。一覧・検索・サイトマップ・番号に含めない
    hidden = [s for s in stories if s.get("hidden", "").lower() in ("true", "yes", "1") or s["open"]]
    stories = [s for s in stories if s not in hidden]
    for s in hidden:
        s["no"] = "---"
    # 掲載日（同日なら掲載順）の古い順に通し番号を振り、一覧は新しい順に並べる
    stories.sort(key=lambda s: (s["date"], s["added"], s["slug"]))
    for i, s in enumerate(stories, 1):
        s["no"] = f"{i:03d}"
    newest_first = list(reversed(stories))

    # 作品ページ
    make_ogp = ogp.available()
    if not make_ogp:
        print("note: Pillow かフォントが無いので、作品ごとのOGP画像は作らず共通画像を使います")
    pages = [(s, stories[i - 1] if i > 0 else None, stories[i + 1] if i + 1 < len(stories) else None)
             for i, s in enumerate(stories)] + [(s, None, None) for s in hidden]
    for s, prev_s, next_s in pages:
        is_hidden = s in hidden
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
        minutes = read_minutes(s)
        body = f"""  <main class="reader">
    <article{"" if is_hidden else f' data-read-slug="{esc(s["slug"])}"'}{f' data-open="{s["open"][0]}-{s["open"][1]}"' if s["open"] else ""}{f" data-yomi='{esc(json.dumps(s['yomi'], ensure_ascii=False))}'" if s["yomi"] else ""}>
      <header class="story-header">
        <p class="mono story-meta">FILE No.{s['no']} // {esc(s['date'])}</p>
        <h1 class="story-title">{esc(s['title'])}</h1>
        <p class="story-byline"><a href="{BASE_PATH}{ABOUT_PATH}" rel="author">{esc(site['author'])}</a></p>
        <p class="mono story-stats">{s['chars']:,} 字 · 約 {minutes} 分</p>{kakuyomu_link(s)}{font_switch()}{tts_panel()}{story_labels(s)}
      </header>
      <p class="night-closed mono" hidden></p>
      <div class="story-body"{" hidden" if s["open"] else ""}>
{s['html']}
      </div>
      <p class="story-end mono" aria-hidden="true">— END —</p>{"" if is_hidden else READ_TOGGLE}
    </article>{"" if is_hidden else share_link(s)}{"" if is_hidden else reviews_section(s)}{"" if is_hidden else next_reads(s, stories)}
    <nav class="story-nav" aria-label="作品間の移動">
      {''.join(nav)}
    </nav>
    <p class="random-wrap">{RANDOM_BUTTON}</p>
  </main>{"" if is_hidden else reviews_script()}
  <script src="{asset("speech.js")}" defer></script>
  <script src="{asset("watch.js")}" defer></script>"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "ShortStory",
            "headline": s["title"],
            "name": s["title"],
            "description": s["description"],
            "author": AUTHOR,
            "datePublished": s["date"],
            "inLanguage": "ja",
            **({"genre": s["genre"]} if s["genre"] else {}),
            **({"keywords": ", ".join(s["tags"])} if s["tags"] else {}),
            "url": BASE + story_url(s),
            "isPartOf": {"@type": "WebSite", "name": site["title"], "url": BASE + "/"},
        }
        image = OGP_DEFAULT
        if make_ogp:
            png = OUT / "assets" / "ogp" / f"{s['slug']}.png"
            ogp.render(png, no=s["no"], title=s["title"], description=s["description"],
                       site_title=site["title"], author=site["author"])
            # 中身が変わればURLも変わり、SNS側の古いキャッシュを使わせない
            image = f"{BASE}/assets/ogp/{quote(s['slug'])}.png?v={hashlib.sha1(png.read_bytes()).hexdigest()[:8]}"
            jsonld["image"] = image
        out = OUT / "works" / s["slug"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(title=s["title"], description=s["description"], path=story_url(s),
                            body=body, og_type="article", jsonld=None if is_hidden else jsonld,
                            noindex=is_hidden, image=image), encoding="utf-8")

    # トップページ（検索・ジャンル・既読の絞り込みは assets/search.js がクライアント側で行う）
    def card(s):
        labels = ""
        if s["genre"] or s["tags"]:
            parts = [f'<span class="label label-genre">{esc(s["genre"])}</span>'] if s["genre"] else []
            parts += [f'<span class="label">#{esc(t)}</span>' for t in s["tags"]]
            labels = f'\n          <span class="labels">{"".join(parts)}</span>'
        return f"""      <li data-slug="{esc(s['slug'])}" data-date="{esc(s['date'])}">
        <a class="card" href="{BASE_PATH}{story_url(s)}">
          <span class="mono card-no">No.{s['no']}<span class="card-new" hidden>NEW</span><span class="card-read" hidden>READ</span><span class="card-fav" hidden aria-label="お気に入り">★</span>{'<span class="card-kakuyomu">カクヨム</span>' if s["kakuyomu_url"] else ""}</span>
          <h2 class="card-title">{esc(s['title'])}</h2>
          <p class="card-desc">{esc(s['description'])}</p>{labels}
          <span class="mono card-meta">{esc(s['date'])} · {s['chars']:,} 字 · 約 {read_minutes(s)} 分<span class="card-rating" data-rating-for="{esc(s['slug'])}" hidden></span><span class="card-reaction" hidden></span></span>
        </a>
      </li>"""

    cards = "\n".join(card(s) for s in newest_first)
    # 時間限定の作品は、その時間帯だけ reader.js が一覧の先頭に出す
    night = [s for s in hidden if s["open"]]
    night_cards = "".join(f"""
    <ul class="cards cards-night" data-open="{s['open'][0]}-{s['open'][1]}" hidden>
      <li data-night-slug="{esc(s['slug'])}">
        <a class="card" href="{BASE_PATH}{story_url(s)}">
          <span class="mono card-no">No.??? // {s['open'][0]:02d}:00–{s['open'][1]:02d}:00 LIMITED</span>
          <h2 class="card-title">{esc(s['title'])}</h2>
          <p class="card-desc">{esc(s['description'])}</p>
          <span class="mono card-meta">{s['chars']:,} 字 · 約 {read_minutes(s)} 分</span>
        </a>
      </li>
    </ul>""" for s in night)
    genres = sorted({s["genre"] for s in stories if s["genre"]})
    chips = "".join(f'<button type="button" class="chip" data-genre="{esc(g)}">{esc(g)}</button>' for g in genres)
    genre_bar = f"""
      <div class="chips" role="group" aria-label="ジャンルで絞り込む">
        <button type="button" class="chip" data-genre="" aria-pressed="true">すべて</button>{chips}
      </div>""" if genres else ""
    # 既読・お気に入りでの絞り込み（記録はブラウザの localStorage にあるので search.js が判定する）
    read_bar = """
      <div class="chips chips-read" role="group" aria-label="既読・お気に入りで絞り込む">
        <span class="mono chips-label">READ</span>
        <button type="button" class="chip" data-read="" aria-pressed="true">すべて</button><button type="button" class="chip" data-read="unread">未読</button><button type="button" class="chip" data-read="read">既読</button><button type="button" class="chip" data-read="fav">★ お気に入り</button>
      </div>"""
    # 評価・感想での並べ替えと絞り込み（評価機能があるときだけ）
    rank_bar = ""
    if REVIEWS_API:
        r_opts = "".join(f'<option value="{esc(r)}">{esc(r)}</option>' for r in REACTIONS)
        rank_bar = f"""
      <div class="picks">
        <label class="pick"><span class="mono">SORT</span><select id="sort"><option value="">新着順</option><option value="avg">評価が高い順</option><option value="count">評価が多い順</option></select></label>
        <label class="pick"><span class="mono">STARS</span><select id="min"><option value="">指定なし</option><option value="4">★4以上</option><option value="3">★3以上</option></select></label>
        <label class="pick" id="pick-reaction" hidden><span class="mono">感想</span><select id="r"><option value="">指定なし</option>{r_opts}</select></label>
      </div>"""
    body = f"""  <main class="home">
    <section class="hero">
      <p class="mono hero-eyebrow">// ARCHIVE ONLINE · {len(stories)} FILES</p>
      <h1 class="hero-title">{esc(site['title'])}</h1>
      <p class="hero-desc">{esc(site['description'])}</p>
      <p class="hero-actions">{RANDOM_BUTTON}<span class="mono read-count" hidden></span><button type="button" class="read-reset mono" hidden>すべて未読に戻す</button></p>
    </section>
    <h2 class="section-label mono">STORIES</h2>
    <form class="finder" role="search" onsubmit="return false">
      <label class="search">
        <span class="mono search-label">SEARCH</span>
        <input type="search" id="q" name="q" placeholder="タイトル・本文・タグで検索" autocomplete="off">
      </label>{genre_bar}{read_bar}{rank_bar}
      <p class="mono finder-status" id="finder-status" aria-live="polite"></p>
    </form>{night_cards}
    <ul class="cards">
{cards}
    </ul>
    <p class="empty" id="empty" hidden>該当する作品は見つかりませんでした。</p>
  </main>
  <script>window.SEARCH_INDEX = "{BASE_PATH}/search.json";</script>
  <script src="{asset("search.js")}" defer></script>{reviews_script()}"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": site["title"],
        "description": site["description"],
        "url": BASE + "/",
        "inLanguage": "ja",
        "author": AUTHOR,
    }
    (OUT / "index.html").write_text(page(title=site["title"], description=site["description"],
                                         path="/", body=body, jsonld=jsonld), encoding="utf-8")

    # 作者プロフィール
    links = []
    if AUTHOR_X:
        links.append(f'<a class="profile-x" href="{esc(AUTHOR_X)}" rel="me noopener" target="_blank">X（旧Twitter）で{esc(site['author'])}をフォロー</a>')
    if AUTHOR_KAKUYOMU:
        links.append(f'<a class="profile-x" href="{esc(AUTHOR_KAKUYOMU)}" rel="me noopener" target="_blank">カクヨムでも読む</a>')
    x_link = f"""
      <p class="profile-links">{" ".join(links)}</p>""" if links else ""
    works = "\n".join(
        f'        <li><a href="{BASE_PATH}{story_url(s)}"><span class="mono">No.{s["no"]}</span><span class="profile-work-title">{esc(s["title"])}</span><span class="mono profile-work-date">{esc(s["date"])}</span></a></li>'
        for s in newest_first)
    bio = site.get("author_bio", "").strip()
    about_desc = f"{site['author']}のプロフィール。{bio}"
    body = f"""  <main class="home profile">
    <section class="hero">
      <p class="mono hero-eyebrow">// AUTHOR PROFILE</p>
      <h1 class="hero-title">{esc(site['author'])}</h1>
      <p class="hero-desc">{esc(bio)}</p>{x_link}
    </section>
    <h2 class="section-label mono">WORKS</h2>
    <ul class="profile-works">
{works}
    </ul>
  </main>"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "url": BASE + ABOUT_PATH,
        "inLanguage": "ja",
        "mainEntity": {**AUTHOR, **({"description": bio} if bio else {})},
    }
    out = OUT / "about" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page(title=f"{site['author']}のプロフィール", description=about_desc, path=ABOUT_PATH,
                        body=body, og_type="profile", jsonld=jsonld), encoding="utf-8")

    # 隠し要素「分岐点」：読み終えた作品の世界で、結末を選び直すノベルゲーム（assets/transit.js, transit-worlds.js）。一覧・サイトマップには載せない
    files = [{"slug": s["slug"], "no": s["no"], "title": s["title"]} for s in stories]
    body = f"""  <main class="home transit-page">
    <section class="hero">
      <p class="mono hero-eyebrow">// BRANCH POINT</p>
      <h1 class="hero-title">分岐点</h1>
    </section>
    <section id="transit" class="transit mono" aria-live="polite" data-files='{esc(json.dumps(files, ensure_ascii=False))}'>
      <p class="transit-lines"></p>
      <div class="transit-choices"></div>
    </section>
    <noscript><p class="hero-desc">この端末は JavaScript を使います。</p></noscript>
  </main>
  <script src="{asset("transit-worlds.js")}" defer></script>
  <script src="{asset("transit.js")}" defer></script>"""
    out = OUT / "transit" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page(title="分岐点", description=site["description"], path="/transit/",
                        body=body, noindex=True), encoding="utf-8")

    # 404
    # 評価・感想での並べ替えと絞り込み（評価機能があるときだけ）
    rank_bar = ""
    if REVIEWS_API:
        r_opts = "".join(f'<option value="{esc(r)}">{esc(r)}</option>' for r in REACTIONS)
        rank_bar = f"""
      <div class="picks">
        <label class="pick"><span class="mono">SORT</span><select id="sort"><option value="">新着順</option><option value="avg">評価が高い順</option><option value="count">評価が多い順</option></select></label>
        <label class="pick"><span class="mono">STARS</span><select id="min"><option value="">指定なし</option><option value="4">★4以上</option><option value="3">★3以上</option></select></label>
        <label class="pick" id="pick-reaction" hidden><span class="mono">感想</span><select id="r"><option value="">指定なし</option>{r_opts}</select></label>
      </div>"""
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
    urls = [(BASE + "/", latest), (BASE + ABOUT_PATH, latest)] + [(BASE + story_url(s), s["date"]) for s in stories]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{esc(u)}</loc><lastmod>{d}</lastmod></url>" for u, d in urls]
    sitemap.append("</urlset>\n")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")

    print(f"built {len(stories)} stories (+{len(hidden)} hidden) -> {OUT}")


if __name__ == "__main__":
    build()
