// 隠し要素「分岐点」：読み終えた作品の世界に降りて、選択次第でバッドエンドをグッドエンドに書き換えるノベルゲーム。
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
  var onlyBad = false;
  // どの画面からでも端末（トップ）に戻れるボタン。端末にいるあいだだけ隠す
  var top = document.createElement("button");
  top.type = "button";
  top.className = "transit-top mono";
  top.textContent = "≡ 端末に戻る";
  top.hidden = true;
  top.onclick = function () { clearTimeout(timer); hub(); };
  root.insertBefore(top, root.firstChild);

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

  // instant: 一覧の画面は打ち出しの演出をせず、すぐ出す
  function print(lines, done, instant) {
    clearTimeout(timer);
    Array.prototype.forEach.call(root.querySelectorAll(".transit-bad, .transit-items"), function (el) { el.remove(); });
    menu.innerHTML = "";
    top.hidden = false;
    var text = lines.join("\n");
    if (still || instant) { screen.onclick = null; screen.textContent = text; done(); return; }
    var i = 0;
    function type() {
      i++;
      screen.textContent = text.slice(0, i);
      if (i < text.length) timer = setTimeout(type, text[i - 1] === "\n" ? 300 : 32);
      else done();
    }
    type();
    // 打ち出し中に画面を押すと最後まで出す
    screen.onclick = function () { if (i < text.length) { clearTimeout(timer); i = text.length - 1; type(); } };
  }

  function buttons(list) {
    menu.innerHTML = "";
    list.forEach(function (c) {
      var b = c.href ? document.createElement("a") : document.createElement("button");
      if (c.href) b.href = c.href; else b.type = "button";
      b.className = "transit-choice mono" + (c.dim ? " is-dim" : "") + (c.bad ? " is-bad" : "");
      b.textContent = c.label;
      if (c.go) b.addEventListener("click", c.go);
      else if (!c.href) b.disabled = true;
      menu.appendChild(b);
    });
    var first = menu.querySelector("button:not([disabled]), a");
    if (first && document.activeElement && document.activeElement.classList.contains("transit-choice")) first.focus();
  }

  // その世界で手に入るアイテムを、全部持っているか
  function complete(slug) {
    var sc = WORLDS[slug].scenes, names = [];
    Object.keys(sc).forEach(function (id) { if (sc[id].get && names.indexOf(sc[id].get) < 0) names.push(sc[id].get); });
    return names.length > 0 && names.every(has);
  }

  function worlds() { return files.filter(function (f) { return WORLDS[f.slug]; }); }
  function goods() { return worlds().filter(function (f) { return state.ends[f.slug] === "good"; }).length; }

  function hub(note) {
    // 作品ページから #slug 付きで来ても、再読み込みで端末に戻れるようにする
    if (location.hash && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    var read = readList();
    var open = worlds();
    var lines = (note ? [note, ""] : []).concat(["分岐点の端末です。", "降りる座標を選んでください。"]);
    lines.push("", "グッドエンド　" + goods() + "／" + open.length);
    lines.push("持ち物　" + state.items.length + "／" + catalog().length);
    print(lines, function () {
      // 「バッドエンドだけ」のときは、まだバッドエンドの世界だけを並べる
      var list = open.filter(function (f) { return !onlyBad || state.ends[f.slug] === "bad"; }).map(function (f) {
        if (read.indexOf(f.slug) < 0) return { label: "No." + f.no + "　座標未取得（先に原作を読む）", href: BASE + "/works/" + encodeURIComponent(f.slug) + "/", dim: true };
        var end = state.ends[f.slug];
        return { label: "No." + f.no + "　" + f.title + (end ? "　" + end.toUpperCase() + " END" : "") + (complete(f.slug) ? "　◆全回収" : ""), bad: end === "bad", go: function () { enter(f.slug); } };
      });
      if (goods() === open.length) list.unshift({ label: "終点", go: terminus });
      var bads = open.filter(function (f) { return state.ends[f.slug] === "bad"; }).length;
      if (onlyBad) {
        if (!bads) list.push({ label: "バッドエンドの世界は、もうありません", dim: true });
        list.unshift({ label: "すべての世界を表示する", go: function () { onlyBad = false; hub(); } });
      } else if (bads) {
        list.unshift({ label: "バッドエンドだけ表示する（" + bads + "）", bad: true, go: function () { onlyBad = true; hub(); } });
      }
      list.unshift({ label: "持ち物を見る（" + state.items.length + "）", go: inventory });
      var rest = files.length - open.length;
      if (rest > 0) list.push({ label: "ほか" + rest + "件の座標は、まだ測定中です", dim: true });
      if (state.ended) list.push({ label: "旅を最初からやり直す", go: confirmReset });
      list.push({ label: "サイトに戻る", href: BASE + "/" });
      buttons(list);
    }, true);
    top.hidden = true;
  }

  // すべてのアイテムと、手に入る世界・使う世界
  // 消す前に、何が消えるかを見せて確かめる（読んだ記録は残る）
  function confirmReset() {
    print(["旅の記録を、すべて消します。", "",
      "グッドエンド　" + goods() + "／" + worlds().length + "　→　0",
      "持ち物　" + state.items.length + "／" + catalog().length + "　→　0", "",
      "消した記録は、元に戻せません。", "読んだ作品の記録は、そのまま残ります。", "",
      "本当に、最初からやり直しますか。"], function () {
      buttons([
        { label: "やめて、端末に戻る", go: function () { hub(); } },
        { label: "消して、最初からやり直す", bad: true, go: function () { state = fresh(); save(); hub("旅の記録を消しました。"); } }
      ]);
    }, true);
  }

  function catalog() {
    var map = {}, order = [];
    worlds().forEach(function (f) {
      var sc = WORLDS[f.slug].scenes;
      Object.keys(sc).forEach(function (id) {
        var s = sc[id];
        if (s.get) {
          if (!map[s.get]) { map[s.get] = { name: s.get, from: f.title, slug: f.slug, uses: [] }; order.push(s.get); }
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

  // 持ち物の図鑑。持っている物はカードで、まだの物は「？？？」で並べる
  function inventory() {
    var all = catalog();
    var info = window.TRANSIT_ITEMS || {};
    var read = readList();
    var got = all.filter(function (it) { return has(it.name); });
    var lines = ["持ち物　" + got.length + "／" + all.length];
    lines.push(got.length ? "拾った物は、ほかの世界で役に立つことがあります。" : "まだ何も持っていません。バッドエンドの世界にも、拾える物があります。");
    print(lines, function () {
      var grid = document.createElement("div");
      grid.className = "transit-items";
      // まだの物は、小さな札にして下にまとめる
      var rest = document.createElement("div");
      rest.className = "transit-items is-unknown-grid";
      // 持っている物を先に、拾った順で
      all.slice().sort(function (a, b) {
        var ia = state.items.indexOf(a.name), ib = state.items.indexOf(b.name);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      }).forEach(function (it) {
        var card = document.createElement("div");
        var name = document.createElement("p");
        var desc = document.createElement("p");
        var meta = document.createElement("p");
        name.className = "transit-item-name";
        desc.className = "transit-item-desc";
        meta.className = "transit-item-meta";
        if (has(it.name)) {
          var left = it.uses.filter(function (slug) { return state.ends[slug] !== "good"; }).length;
          var kind = !it.uses.length ? "keep" : left ? "use" : "done";
          card.className = "transit-item is-" + kind;
          name.textContent = "〔" + it.name + "〕";
          desc.textContent = info[it.name] || "";
          meta.textContent = "『" + it.from + "』　" + (kind === "keep" ? "記念品" : kind === "use" ? "どこかで使えそう" : "使い終えた");
        } else {
          card.className = "transit-item is-unknown";
          name.textContent = "？";
          meta.textContent = read.indexOf(it.slug) >= 0 ? "『" + it.from + "』" : "未読の作品";
        }
        card.appendChild(name);
        if (desc.textContent) card.appendChild(desc);
        card.appendChild(meta);
        (has(it.name) ? grid : rest).appendChild(card);
      });
      if (grid.children.length) menu.parentNode.insertBefore(grid, menu);
      if (rest.children.length) menu.parentNode.insertBefore(rest, menu);
      buttons([{ label: "端末に戻る", go: function () { hub(); } }]);
    }, true);
  }

  function enter(slug) {
    // 入ったことのある世界は、作品ページの入口を点滅させない（watch.js が見る）
    if (!state.visited) state.visited = [];
    if (state.visited.indexOf(slug) < 0) { state.visited.push(slug); save(); }
    var f = worlds().filter(function (x) { return x.slug === slug; })[0];
    scene(slug, "start", ["― 『" + f.title + "』　" + WORLDS[slug].place + " ―", ""]);
  }

  function scene(slug, id, head) {
    var s = WORLDS[slug].scenes[id];
    var lines = (head || []).concat(s.text);
    if (s.end) {
      // バッドエンドだけは、文の後に赤い帯で大きく出す
      if (s.end === "good") lines.push("", "― GOOD END ―");
      // 一度グッドエンドを見た世界は、バッドエンドを見直してもグッドのまま
      if (state.ends[slug] !== "good") { state.ends[slug] = s.end; save(); }
    }
    if (s.get && !has(s.get)) { give(s.get); lines.push("", "〔" + s.get + "〕を手に入れた。"); }
    print(lines, function () {
      if (s.end === "bad") {
        var bad = document.createElement("p");
        bad.className = "transit-bad";
        bad.textContent = "BAD END";
        menu.parentNode.insertBefore(bad, menu);
      }
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
    print(["分岐点の端末です。", "", "閲覧記録が足りません。", "三作以上読み終えてから、また来てください。", "", "あなたが来たことは、記録しておきます。"], function () {
      buttons([{ label: "作品一覧へ", href: BASE + "/" }]);
    });
    top.hidden = true;
    return;
  }
  // 作品ページの入口から来たときは、その作品の世界へ直接降りる
  var want = "";
  try { want = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
  var hello = "はじめまして。……ではありませんね。閲覧記録で、あなたのことは知っています。\n旅行者は、降りた世界を変えてはいけない決まりです。見るだけにしてください。";
  var first = !state.greeted && !Object.keys(state.ends).length && !state.ended;
  if (first) { state.greeted = true; save(); }
  if (WORLDS[want] && readList().indexOf(want) >= 0 && files.some(function (f) { return f.slug === want; })) {
    if (!first) return enter(want);
    // 初めての人は、作品ページの入口から来ても、まずあいさつを聞いてから降りる
    var title = files.filter(function (f) { return f.slug === want; })[0].title;
    print(["分岐点の端末です。", "", hello, "", "あなたが読み終えた世界のひとつに、座標が合っています。", "『" + title + "』の、結末の少し前です。"], function () {
      buttons([
        { label: "『" + title + "』に降りる", go: function () { enter(want); } },
        { label: "ほかの世界を見る", go: function () { hub(); } }
      ]);
    });
    return;
  }
  hub(state.ended ? "また来ましたね。今度は、記録していません。"
    : first ? hello : "おかえりなさい。");
})();
