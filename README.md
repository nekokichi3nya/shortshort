# 眠人ショートショート

眠人のショートショート作品サイトです。GitHub Pages で公開します。

公開URL（Pages 有効化後）: https://nekokichi3nya.github.io/shortshort/

## 作品の追加のしかた

1. `stories/` フォルダに Markdown ファイル（`.md`）を追加します。ファイル名がそのまま URL になるので、半角英数字とハイフンがおすすめです（例: `stories/my-story.md` → `/works/my-story/`）。
2. ファイルの先頭に次のような情報を書きます（`description` は検索結果やSNSでの紹介文になります）。

   ```markdown
   ---
   title: 作品タイトル
   date: 2026-10-12
   description: 一覧ページや検索結果に出る、短い紹介文。
   genre: SF
   tags: AI, 恋愛
   ---

   　本文の一段落目。
   　二段落目。
   ```

   `genre`（ジャンルは1つ）と `tags`（カンマか読点区切りで複数）は省略できます。トップページのジャンルボタンは、作品に書かれたジャンルから自動で作られます。

3. `main` ブランチに入ると、GitHub Actions が自動でサイトを作り直して公開します。

## イラスト

`images/` フォルダに作品と同じ名前の画像（例: `images/my-story.svg`、`.png`・`.jpg`・`.webp` も可）を置くと、一覧のカードと作品ページの上部に自動で表示されます。横長（およそ 960×420 の比率）が収まりよく、はみ出た部分は切り取られます。

別の名前の画像やネット上の画像を使いたいときは、front matter に書きます。

```markdown
image: my-story-2.png
image_alt: 夕暮れの原っぱに立つ二人
```

PNG・JPG を使うと、SNS で共有したときのサムネイルにもなります（SVG は SNS が対応していないため、共通のサムネイルになります）。画像が無い作品は、これまでどおり文字だけで表示されます。

作品番号（No.001〜）は `date` の古い順、同じ日なら追加した順に自動で振られます。

本文の書き方:

- 1行が1段落になります（行頭の全角スペースもそのまま表示されます）。
- 空行は1行分のアキになります。
- `***` や `◇` だけの行は、場面転換の飾りになります。
- GitHub の画面から「Add file → Upload files」で `stories/` にファイルを置くだけでも追加できます。

## 設定（`site.json`）

| 項目 | 内容 |
| --- | --- |
| `title` | サイト名 |
| `description` | サイトの説明（トップページの紹介文・検索結果） |
| `author` | ペンネーム |
| `url` | 公開URL（独自ドメインにした場合はここを変更） |
| `google_site_verification` | Google Search Console の確認コード |

## GitHub Pages の有効化（最初に一度だけ）

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。

## Google Search Console への登録

1. [Search Console](https://search.google.com/search-console) で「URL プレフィックス」に `https://nekokichi3nya.github.io/shortshort/` を入力します。
2. 確認方法で「HTML タグ」を選び、表示される `<meta name="google-site-verification" content="XXXX">` の `XXXX` の部分を `site.json` の `google_site_verification` に入れて `main` に反映します。
3. 公開後に Search Console で「確認」を押します。
4. 「サイトマップ」に `sitemap.xml` を送信します。

## 手元でのプレビュー

```sh
python3 scripts/build.py
mkdir -p /tmp/preview && ln -sfn "$PWD/_site" /tmp/preview/shortshort
cd /tmp/preview && python3 -m http.server
# → http://localhost:8000/shortshort/
```
