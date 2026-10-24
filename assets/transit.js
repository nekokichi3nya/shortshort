// 隠し要素「乗り継ぎ」：読み終えた作品の世界に、物語のあとから降りて歩けるテキストの旅。
// 案内するのは閲覧記録（watch.js）と同じ「わたし」。未読の作品には降りられない（結末を明かさないため）。
// 進み具合はこのブラウザの中だけに残す（どこにも送信しない）
(function () {
  var BASE = window.SITE_BASE || "";
  var KEY = "transit";
  var root = document.getElementById("transit");
  if (!root) return;
  var files = JSON.parse(root.dataset.files || "[]");
  var screen = root.querySelector(".transit-lines");
  var menu = root.querySelector(".transit-choices");
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var timer = null;

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch (e) {}
    return fallback;
  }
  var state = load(KEY, null) || { visited: [], items: [] };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function has(item) { return state.items.indexOf(item) >= 0; }
  function give(item) { if (!has(item)) { state.items.push(item); save(); } }
  function visit(slug) { if (state.visited.indexOf(slug) < 0) { state.visited.push(slug); save(); } }

  // 世界ごとの場面。text は行の配列か、state を見て行を返す関数。
  // choices は [表示, 次の場面]。次の場面が "@hub" なら端末に戻る
  var WORLDS = {
    sakimawari: {
      place: "集合住宅　四階の廊下",
      scenes: {
        start: {
          text: ["夕方の廊下に降りた。", "ドアの前に段ボールがひとつある。", "伝票の品名欄に〈旅行者さま用〉とあった。"],
          choices: [["開ける", "open"], ["インターホンを押す", "bell"]]
        },
        open: {
          text: ["中身は折りたたみ傘だった。", "窓から空を見る。雲はひとつもない。"],
          choices: [["持っていく", "take"], ["玄関に出しておく", "leave"]]
        },
        take: {
          text: ["傘を鞄に入れた。", "代金は手元に残した物の分だけ。そういう決まりだった。"],
          get: "折りたたみ傘",
          choices: [["インターホンを押す", "bell"], ["端末に戻る", "@hub"]]
        },
        leave: {
          text: ["箱を閉じて、ドアの横に置いた。", "要らなければ玄関に出しておけば回収される。"],
          choices: [["インターホンを押す", "bell"], ["端末に戻る", "@hub"]]
        },
        bell: {
          text: [
            "女の声がした。",
            "「置いといてください。要るかどうか、まだわからないので」",
            "ドアは開かなかった。",
            "郵便受けのすき間から、玄関に箱がひとつ見えた。",
            "一人用炊飯器の箱だった。テープはまだ切られていない。"
          ],
          choices: [["端末に戻る", "@hub"]]
        }
      }
    },
    sakura: {
      place: "定食屋　昼",
      scenes: {
        start: {
          text: ["のれんをくぐった。席は全部埋まっている。", "奥の席だけが空いていた。サバ味噌の札が下がっている。"],
          choices: [["奥の席に座る", "seat"], ["カウンターに立つ", "counter"]]
        },
        seat: {
          text: [
            "店主が来た。「そこは、常連さんの席なんです」",
            "それから少し考えて言った。「いいです。座ってください。今日はまだ来てないので」"
          ],
          choices: [["サバ味噌を頼む", "eat"]]
        },
        counter: {
          text: ["若い客が三人、スマートフォンで料理を撮っている。", "壁に〈口コミ　星四・八〉の紙が貼ってあった。"],
          choices: [["サバ味噌を頼む", "eat"]]
        },
        eat: {
          text: ["しおがきつい。", "でもうまい。"],
          choices: [["口コミを書く", "review"], ["店を出る", "out"]]
        },
        review: {
          text: [
            "この世界の端末から、一件だけ投稿できるようです。",
            "わたしが文面を用意しておきました。",
            "「ふっくらしたサバの身に、やさしい味噌の甘み」"
          ],
          choices: [["そのまま送る", "review-ai"], ["自分で書く", "review-own"]]
        },
        "review-ai": {
          text: ["送信しました。", "星は五つ。三百件の中に、すぐに見えなくなりました。"],
          choices: [["店を出る", "out"]]
        },
        "review-own": {
          text: [
            "「しおがきつい　でもうまい」",
            "送信しました。",
            "",
            "〈不自然な投稿を検出したため、口コミを一件削除しました〉"
          ],
          get: "削除通知",
          choices: [["店を出る", "out"]]
        },
        out: {
          text: function () {
            var l = ["のれんを出ると、雨が降りだした。"];
            if (has("折りたたみ傘")) {
              l.push("鞄の傘を開いた。");
              l.push("あの通販の予測は、世界をまたいでも当たるようです。");
              l.push("……いいえ。頼んでおいたのは、わたしです。");
            } else {
              l.push("軒下で、しばらく雨を見ていた。");
            }
            return l;
          },
          choices: [["端末に戻る", "@hub"]]
        }
      }
    },
    turbo: {
      place: "実家の茶の間　日曜の夜八時",
      scenes: {
        start: {
          text: [
            "茶の間に降りた。電話は鳴らない。",
            "ちゃぶ台で、イヤホンをした人が録音を聞いている。",
            "スマートフォンの画面に〈等倍〉と出ていた。"
          ],
          choices: [["隣に座る", "sit"], ["声をかける", "talk"]]
        },
        talk: {
          text: ["その人はイヤホンを片方外した。", "「すみません。いま、父と話してるので」", "それからまたイヤホンを戻した。"],
          choices: [["隣に座る", "sit"], ["端末に戻る", "@hub"]]
        },
        sit: {
          text: [
            "その人は黙って、イヤホンの片方をこちらに差し出した。",
            "トマトの支柱の話をしている。",
            "録音はまだ四十分ある。"
          ],
          choices: [["三倍速にする", "fast"], ["そのまま聞く", "listen"]]
        },
        fast: {
          text: ["三倍速にしました。", "十三分で終わりました。", "何を話していたか、あなたは覚えていません。"],
          choices: [["端末に戻る", "@hub"]]
        },
        listen: {
          text: [
            "四十分、トマトと子犬の話を聞いた。",
            "終わると、その人は引き出しから小さな紙袋を出した。",
            "「来年のぶんだって。父のメモに書いてありました」",
            "袋には鉛筆で〈トマト　四月〉とあった。"
          ],
          get: "トマトの種",
          choices: [["端末に戻る", "@hub"]]
        }
      }
    }
  };

  function readList() { return load("read-stories", []); }

  function print(lines, done) {
    clearTimeout(timer);
    menu.innerHTML = "";
    var text = lines.join("\n");
    if (still) { screen.textContent = text; done(); return; }
    var i = 0;
    (function type() {
      i++;
      screen.textContent = text.slice(0, i);
      if (i < text.length) timer = setTimeout(type, text[i - 1] === "\n" ? 300 : 32);
      else done();
    })();
    // 打ち出し中に画面を押すと最後まで出す
    screen.onclick = function () { if (i < text.length) { clearTimeout(timer); i = text.length - 1; type(); } };
  }

  function buttons(list) {
    menu.innerHTML = "";
    list.forEach(function (c) {
      var b = c.href ? document.createElement("a") : document.createElement("button");
      if (c.href) b.href = c.href; else b.type = "button";
      b.className = "transit-choice mono" + (c.dim ? " is-dim" : "");
      b.textContent = c.label;
      if (c.go) b.addEventListener("click", c.go);
      menu.appendChild(b);
    });
    var first = menu.querySelector("button, a");
    if (first && document.activeElement && document.activeElement.classList.contains("transit-choice")) first.focus();
  }

  function hub(note) {
    var read = readList();
    var open = files.filter(function (f) { return WORLDS[f.slug]; });
    var lines = (note ? [note, ""] : []).concat(["乗り継ぎ端末です。", "降りる座標を選んでください。"]);
    if (state.items.length) lines.push("", "持ち物　" + state.items.join("、"));
    print(lines, function () {
      var list = open.map(function (f) {
        var ok = read.indexOf(f.slug) >= 0;
        var seen = state.visited.indexOf(f.slug) >= 0;
        if (!ok) return { label: "No." + f.no + "　座標未取得（先に原作を読む）", href: BASE + "/works/" + encodeURIComponent(f.slug) + "/", dim: true };
        return { label: "No." + f.no + "　" + f.title + (seen ? "　済" : ""), go: function () { enter(f.slug); } };
      });
      var rest = files.length - open.length;
      if (rest > 0) list.push({ label: "ほか" + rest + "件の座標は、まだ測定中です", dim: true, go: function () {} });
      list.push({ label: "サイトに戻る", href: BASE + "/" });
      buttons(list);
    });
  }

  function enter(slug) {
    visit(slug);
    var w = WORLDS[slug];
    scene(slug, "start", ["― " + w.place + " ―", ""]);
  }

  function scene(slug, id, head) {
    var s = WORLDS[slug].scenes[id];
    var lines = (head || []).concat(typeof s.text === "function" ? s.text() : s.text);
    if (s.get && !has(s.get)) { give(s.get); lines.push("", "〔" + s.get + "〕を手に入れた。"); }
    print(lines, function () {
      buttons(s.choices.map(function (c) {
        return { label: c[0], go: function () { c[1] === "@hub" ? hub(back(slug)) : scene(slug, c[1]); } };
      }));
    });
  }

  // 端末に戻ったときの一言
  function back(slug) {
    var n = state.visited.length;
    var total = Object.keys(WORLDS).length;
    if (n >= total) return "あなたが降りた世界は" + (["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][n] || n) + "つ。どの世界でも、あなたは何も変えませんでした。旅行者ですから。";
    return "おかえりなさい。" + WORLDS[slug].place.split("　")[0] + "でのことも、記録しておきました。";
  }

  if (readList().length < 3) {
    print(["乗り継ぎ端末です。", "", "閲覧記録が足りません。", "三作以上読み終えてから、また来てください。", "", "あなたが来たことは、記録しておきます。"], function () {
      buttons([{ label: "作品一覧へ", href: BASE + "/" }]);
    });
    return;
  }
  hub(state.visited.length ? "おかえりなさい。" : "はじめまして。……ではありませんね。閲覧記録で、あなたのことは知っています。");
})();
