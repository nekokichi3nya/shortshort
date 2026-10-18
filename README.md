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
   読み上げで読み間違える言葉は `yomi: 千夏=ちなつ, 一日=いちにち` のように書くと、読み上げのときだけその読み方になります（画面の文字は変わりません）。

3. `main` ブランチに入ると、GitHub Actions が自動でサイトを作り直して公開します。

作品番号（No.001〜）は `date` の古い順、同じ日なら追加した順に自動で振られます。

### SNS用のカード画像（OGP画像）

作品ページのURLをXやLINEに貼ると、作品ごとのカード画像（No.・題名・`description`・サイト名を載せた 1200×630 の画像）が出ます。画像は公開のたびに GitHub Actions が `scripts/ogp.py` で自動で作るので、作品を追加するだけで用意されます。手元で作るときは Pillow と `.fonts/` のフォントが必要で、無ければ共通の `assets/ogp.png` を使います。Xのカードは X 側のキャッシュがあるため、一度貼ったURLは新しい画像に変わるまで時間がかかることがあります。

### 隠し作品

先頭の情報に `hidden: true` を書くと、その作品は一覧・検索・作者ページ・サイトマップに出ず、番号も振られません。`/works/ファイル名/` のURLを知っている人だけが読めます（検索エンジンには noindex で載せないよう伝えます）。リポジトリ自体は公開なので、GitHub上ではファイルが見えます。公開するときは `hidden: true` の行を消します。

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
| `author_bio` | プロフィールページ（`/about/`）の自己紹介文 |
| `author_x` | X（旧Twitter）のアカウント名（`@名前` でもURLでも可）。入れるとプロフィールページにXへのリンクが出ます |
| `url` | 公開URL（独自ドメインにした場合はここを変更） |
| `google_site_verification` | Google Search Console の確認コード |
| `reviews_endpoint` | 星評価の保存先（下記）。空のあいだは評価欄を出しません |

## GitHub Pages の有効化（最初に一度だけ）

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。

## Google Search Console への登録

1. [Search Console](https://search.google.com/search-console) で「URL プレフィックス」に `https://nekokichi3nya.github.io/shortshort/` を入力します。
2. 確認方法で「HTML タグ」を選び、表示される `<meta name="google-site-verification" content="XXXX">` の `XXXX` の部分を `site.json` の `google_site_verification` に入れて `main` に反映します。
3. 公開後に Search Console で「確認」を押します。
4. 「サイトマップ」に `sitemap.xml` を送信します。

## 星評価

作品ページの下に、星5段階の評価と、任意で選べる感想（「ゾッとした」など）の欄が出ます。感想の選択肢は `scripts/build.py` と `reviews/apps-script.gs` の `REACTIONS` で決めています（両方を同じにします）。トップの作品一覧では、評価順・評価数順の並べ替えと、「★4以上」や感想（例：「ゾッとした」が付いた作品を多い順に）での絞り込みが、検索やジャンルと組み合わせて使えます。読者はアカウント登録なしで送れます。評価は作者の Google スプレッドシートに保存されます（無料）。

### 最初に一度だけの設定

1. Google スプレッドシートを新しく作ります（名前は自由）。
2. メニューの「拡張機能 → Apps Script」を開きます。
3. 最初からある中身を全部消し、`reviews/apps-script.gs` の中身を貼り付けて保存します。
4. 右上の「デプロイ → 新しいデプロイ」で、種類に「ウェブアプリ」を選びます。
5. 「次のユーザーとして実行」は「自分」、「アクセスできるユーザー」は「全員」にして「デプロイ」を押します。
6. 権限の確認が出たら許可します（「このアプリは Google で確認されていません」と出たら「詳細 → （安全ではないページ）に移動」）。
7. 表示された「ウェブアプリの URL」（`https://script.google.com/macros/s/…/exec`）を `site.json` の `reviews_endpoint` に入れて `main` に反映します。

スマホなどで「拡張機能 → Apps Script」が開けないときは、[script.google.com](https://script.google.com/home/projects/create) で新しいプロジェクトを作り、手順3以降を行っても動きます。その場合、最初の評価が届いたときに「眠人ショートショート 星評価」というスプレッドシートが Google ドライブに自動で作られます。

### 評価の管理

- スプレッドシートの「評価」シートに1件ずつ行が増えます。
- 不自然な連投などは「無効」にチェックを入れると、平均にも感想の数にも入らなくなります。
- スクリプトを書き換えたときは「デプロイ → デプロイを管理」で鉛筆アイコンを押し、バージョンを「新バージョン」にして「デプロイ」します（URL は変わりません）。
- 機械的な投稿を避けるため、隠し入力欄による判定と、サイト全体で10分あたり30件までの上限があります。同じブラウザからは1作品につき1票で、送り直すと前の評価が書き換わります（シートの「ID」列でブラウザを見分けています）。

## 手元でのプレビュー

```sh
python3 scripts/build.py
mkdir -p /tmp/preview && ln -sfn "$PWD/_site" /tmp/preview/shortshort
cd /tmp/preview && python3 -m http.server
# → http://localhost:8000/shortshort/
```
