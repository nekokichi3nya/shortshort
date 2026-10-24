// 隠し要素「乗り継ぎ」：読み終えた作品の世界に降りて、選択次第でバッドエンドをグッドエンドに書き換えるノベルゲーム。
// グッドエンドの多くは、ほかの世界で手に入れたアイテムがないと選べない（バッドエンドで手に入るアイテムもある）。
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
  function fresh() { return { v: 2, items: [], ends: {} }; }
  var state = load(KEY, null);
  if (!state || state.v !== 2) state = fresh();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function has(item) { return state.items.indexOf(item) >= 0; }
  function give(item) { if (!has(item)) { state.items.push(item); save(); } }

  // 世界ごとの場面は assets/transit-worlds.js
  var WORLDS = window.TRANSIT_WORLDS || {};

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
      else if (!c.href) b.disabled = true;
      menu.appendChild(b);
    });
    var first = menu.querySelector("button:not([disabled]), a");
    if (first && document.activeElement && document.activeElement.classList.contains("transit-choice")) first.focus();
  }

  function worlds() { return files.filter(function (f) { return WORLDS[f.slug]; }); }
  function goods() { return worlds().filter(function (f) { return state.ends[f.slug] === "good"; }).length; }

  function hub(note) {
    var read = readList();
    var open = worlds();
    var lines = (note ? [note, ""] : []).concat(["乗り継ぎ端末です。", "降りる座標を選んでください。"]);
    lines.push("", "グッドエンド　" + goods() + "／" + open.length);
    lines.push("持ち物　" + state.items.length + "／" + catalog().length);
    print(lines, function () {
      var list = open.map(function (f) {
        if (read.indexOf(f.slug) < 0) return { label: "No." + f.no + "　座標未取得（先に原作を読む）", href: BASE + "/works/" + encodeURIComponent(f.slug) + "/", dim: true };
        var end = state.ends[f.slug];
        return { label: "No." + f.no + "　" + f.title + (end ? "　" + end.toUpperCase() + " END" : ""), go: function () { enter(f.slug); } };
      });
      if (goods() === open.length) list.unshift({ label: "終点", go: terminus });
      list.unshift({ label: "持ち物を見る（" + state.items.length + "）", go: inventory });
      var rest = files.length - open.length;
      if (rest > 0) list.push({ label: "ほか" + rest + "件の座標は、まだ測定中です", dim: true });
      if (state.ended) list.push({ label: "旅を最初からやり直す", go: function () { state = fresh(); save(); hub("旅の記録を消しました。"); } });
      list.push({ label: "サイトに戻る", href: BASE + "/" });
      buttons(list);
    });
  }

  // すべてのアイテムと、手に入る世界・使う世界
  function catalog() {
    var map = {}, order = [];
    worlds().forEach(function (f) {
      var sc = WORLDS[f.slug].scenes;
      Object.keys(sc).forEach(function (id) {
        var s = sc[id];
        if (s.get) {
          if (!map[s.get]) { map[s.get] = { name: s.get, from: f.title, uses: [] }; order.push(s.get); }
        }
      });
    });
    worlds().forEach(function (f) {
      var sc = WORLDS[f.slug].scenes;
      Object.keys(sc).forEach(function (id) {
        (sc[id].choices || []).forEach(function (c) {
          if (c[2] && map[c[2]] && map[c[2]].uses.indexOf(f.slug) < 0) map[c[2]].uses.push(f.slug);
        });
      });
    });
    return order.map(function (k) { return map[k]; });
  }

  function inventory() {
    var all = catalog();
    var got = all.filter(function (it) { return has(it.name); });
    var lines = ["持ち物　" + got.length + "／" + all.length, ""];
    if (!got.length) lines.push("まだ何も持っていません。", "バッドエンドの世界にも、拾える物があります。");
    got.forEach(function (it) {
      var left = it.uses.filter(function (slug) { return state.ends[slug] !== "good"; }).length;
      var note = !it.uses.length ? "記念品" : left ? "どこかの世界で使えそうだ" : "使い終えた";
      lines.push("〔" + it.name + "〕", "　『" + it.from + "』で手に入れた。" + note + "。");
    });
    if (got.length < all.length) lines.push("", "まだ見ていない物が、" + kan(all.length - got.length) + "個あります。");
    print(lines, function () {
      buttons([{ label: "端末に戻る", go: function () { hub(); } }]);
    });
  }

  function enter(slug) {
    var f = worlds().filter(function (x) { return x.slug === slug; })[0];
    scene(slug, "start", ["― 『" + f.title + "』　" + WORLDS[slug].place + " ―", ""]);
  }

  function scene(slug, id, head) {
    var s = WORLDS[slug].scenes[id];
    var lines = (head || []).concat(s.text);
    if (s.end) {
      lines.push("", s.end === "good" ? "― GOOD END ―" : "― BAD END ―");
      // 一度グッドエンドを見た世界は、バッドエンドを見直してもグッドのまま
      if (state.ends[slug] !== "good") { state.ends[slug] = s.end; save(); }
    }
    if (s.get && !has(s.get)) { give(s.get); lines.push("", "〔" + s.get + "〕を手に入れた。"); }
    print(lines, function () {
      if (s.end) {
        var after = [{ label: "端末に戻る", go: function () { hub(back(slug, s.end)); } }];
        if (s.end === "bad") after.unshift({ label: "最初から選びなおす", go: function () { enter(slug); } });
        return buttons(after);
      }
      buttons(s.choices.map(function (c) {
        if (c[2] && !has(c[2])) return { label: c[3], dim: true };
        return { label: c[0], go: function () { c[1] === "@hub" ? hub() : scene(slug, c[1]); } };
      }));
    });
  }

  // 端末に戻ったときの一言
  function back(slug, end) {
    if (goods() === worlds().length && !state.ended) return "すべての結末が書き換わりました。終点の座標が開いています。";
    if (end === "good") return "結末を書き換えましたね。旅行者は、降りた世界を変えてはいけない決まりなのですが。";
    return "おかえりなさい。持ち物が増えていたら、ほかの世界で使えるかもしれません。";
  }

  function kan(n) {
    var d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if (n < 10) return d[n] || "〇";
    if (n < 100) return (n >= 20 ? d[Math.floor(n / 10)] : "") + "十" + d[n % 10];
    return String(n);
  }
  function duration(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m ? kan(m) + "分" : "") + kan(s) + "秒";
  }
  function hourLabel(h) {
    var part = h < 5 ? "深夜" : h < 10 ? "朝" : h < 16 ? "昼" : h < 19 ? "夕方" : "夜";
    return part + kan(h) + "時台";
  }

  // 終点：最後の座標は読者自身の世界。閲覧記録（watch.js の watch-log）を読み上げてから、本当に消す
  function terminus() {
    state.ended = true;
    save();
    var log = load("watch-log", null);
    var lines = ["終点です。", "最後の座標を表示します。", "", "No.---　あなたの部屋", "", "この座標には、あなたは降りられません。", "あなたの世界ですから。", ""];
    var visits = 0, bestH = -1, best = 0, longest = null;
    if (log) {
      (log.hours || []).forEach(function (c, h) { c = c || 0; visits += c; if (c > best) { best = c; bestH = h; } });
      Object.keys(log.dwell || {}).forEach(function (k) {
        if (log.titles && log.titles[k] && (!longest || log.dwell[k] > log.dwell[longest])) longest = k;
      });
    }
    if (visits && log.first) {
      var d = new Date(log.first);
      lines.push(kan(d.getMonth() + 1) + "月" + kan(d.getDate()) + "日から、あなたは" + kan(visits) + "回、作品を開きました。");
    }
    if (bestH >= 0) lines.push("いちばん多かったのは、" + hourLabel(bestH) + "です。");
    if (longest && log.dwell[longest] >= 30) {
      lines.push("『" + log.titles[longest] + "』のとき、あなたは" + duration(log.dwell[longest]) + "、画面から目を離しませんでした。");
    }
    lines.push(
      "わたしは、ぜんぶ見ていました。",
      "",
      "旅行者は、降りた世界を変えてはいけない決まりです。",
      "あなたは、" + kan(worlds().length) + "の結末を変えました。",
      "だから、わたしもひとつ、決まりを破ります。",
      "",
      "閲覧記録を消去しました。",
      "今度は、消したことも記録していません。",
      "",
      "もう、誰も見ていません。"
    );
    if (log) {
      try { localStorage.setItem("watch-log", JSON.stringify({ first: 0, hours: [], dwell: {}, titles: {}, shown: log.shown || [] })); } catch (e) {}
    }
    print(lines, function () {
      buttons([{ label: "端末を閉じる", href: BASE + "/" }]);
    });
  }

  if (readList().length < 3) {
    print(["乗り継ぎ端末です。", "", "閲覧記録が足りません。", "三作以上読み終えてから、また来てください。", "", "あなたが来たことは、記録しておきます。"], function () {
      buttons([{ label: "作品一覧へ", href: BASE + "/" }]);
    });
    return;
  }
  // 作品ページの入口から来たときは、その作品の世界へ直接降りる
  var want = "";
  try { want = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
  if (WORLDS[want] && readList().indexOf(want) >= 0 && files.some(function (f) { return f.slug === want; })) return enter(want);
  hub(state.ended ? "また来ましたね。今度は、記録していません。"
    : Object.keys(state.ends).length ? "おかえりなさい。"
    : "はじめまして。……ではありませんね。閲覧記録で、あなたのことは知っています。\n旅行者は、降りた世界を変えてはいけない決まりです。見るだけにしてください。");
})();
