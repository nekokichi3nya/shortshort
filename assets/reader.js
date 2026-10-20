// 既読マーク（未読に戻すことも可）・お気に入り・次の一作・NEW・ランダムに1作・文字サイズと縦書きの切り替え（記録はこのブラウザの中だけ）
// 読み上げの連続再生でページの中身を差し替えたときも、もう一度呼べるようにしておく
window.readerInit = function () {
  var BASE = window.SITE_BASE || "";

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  var read = load("read-stories", []);
  var favs = load("fav-stories", []);

  // 二度目の結末：最後まで読んだことのある作品を開き直すと、最後の一行だけが別の一行になっている
  var rr = document.querySelector("article[data-reread]");
  if (rr) {
    var rrKey = location.pathname;
    var seen = load("reread-seen", []);
    var lastP = rr.querySelectorAll(".story-body p");
    lastP = lastP[lastP.length - 1];
    if (lastP && seen.indexOf(rrKey) >= 0) {
      var alt = rr.dataset.reread;
      lastP.textContent = (/^　/.test(lastP.textContent) && !/^[「『〈（]/.test(alt) ? "　" : "") + alt;
    }
    var rrEnd = rr.querySelector(".story-end");
    if (rrEnd && seen.indexOf(rrKey) < 0 && "IntersectionObserver" in window) {
      var rrIo = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        rrIo.disconnect();
        var s = load("reread-seen", []);
        if (s.indexOf(rrKey) < 0) { s.push(rrKey); save("reread-seen", s); }
      });
      rrIo.observe(rrEnd);
    }
  }

  // 既読：作品の最後（END）まで表示されたら読んだことにする
  var article = document.querySelector("article[data-read-slug]");
  var end = document.querySelector(".story-end");
  var toggle = document.querySelector(".read-toggle");
  var io = null;
  function setRead(slug, on) {
    read = load("read-stories", []);
    var i = read.indexOf(slug);
    if (on && i < 0) read.push(slug);
    if (!on && i >= 0) read.splice(i, 1);
    save("read-stories", read);
    markToggle();
  }
  function markToggle() {
    if (!toggle || !article) return;
    var on = read.indexOf(article.dataset.readSlug) >= 0;
    toggle.textContent = on ? "既読 ✓ ・ 未読に戻す" : "既読にする";
    toggle.setAttribute("aria-pressed", String(on));
    toggle.hidden = false;
  }
  if (article) {
    var slug = article.dataset.readSlug;
    if (end && "IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setRead(slug, true);
      });
      io.observe(end);
    }
    if (toggle) {
      // 手で切り替えたら、このページを開いている間は自動の既読付けをしない
      toggle.addEventListener("click", function () {
        if (io) io.disconnect();
        setRead(slug, read.indexOf(slug) < 0);
      });
      markToggle();
    }
  }

  // お気に入り：作品ページのボタンで付け外しする
  var favToggle = document.querySelector(".fav-toggle");
  if (article && favToggle) {
    var favSlug = article.dataset.readSlug;
    var markFav = function () {
      var on = favs.indexOf(favSlug) >= 0;
      favToggle.textContent = on ? "★ お気に入り済み" : "☆ お気に入り";
      favToggle.setAttribute("aria-pressed", String(on));
      favToggle.hidden = false;
    };
    favToggle.addEventListener("click", function () {
      favs = load("fav-stories", []);
      var i = favs.indexOf(favSlug);
      if (i >= 0) favs.splice(i, 1); else favs.push(favSlug);
      save("fav-stories", favs);
      markFav();
    });
    markFav();
  }

  // 次の一作：候補（関連が強い順）から未読を優先して3作
  var nextItems = document.querySelectorAll(".next-list li[data-slug]");
  if (nextItems.length) {
    var list = Array.prototype.slice.call(nextItems);
    var unreadNext = list.filter(function (li) { return read.indexOf(li.dataset.slug) < 0; });
    var pick = (unreadNext.length ? unreadNext : list).slice(0, 3);
    list.forEach(function (li) { li.hidden = pick.indexOf(li) < 0; });
    pick.forEach(function (li) { li.parentNode.appendChild(li); });
  }

  // 一覧：公開から7日以内の作品に NEW を付ける（新しい順に3作まで。日付は日本時間の YYYY-MM-DD）
  var today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  var newCount = 0;
  Array.prototype.forEach.call(document.querySelectorAll(".cards li[data-date]"), function (li) {
    var days = (Date.parse(today) - Date.parse(li.dataset.date)) / 86400000;
    var badge = li.querySelector(".card-new");
    if (badge && days >= 0 && days < 7 && newCount < 3) { badge.hidden = false; newCount++; }
  });

  // 一覧：お気に入りのカードに印を付ける
  Array.prototype.forEach.call(document.querySelectorAll(".cards li[data-slug]"), function (li) {
    var badge = li.querySelector(".card-fav");
    if (badge && favs.indexOf(li.dataset.slug) >= 0) badge.hidden = false;
  });

  // 一覧：読んだ作品のカードに印を付ける
  var cards = document.querySelectorAll(".cards li[data-slug]");
  var readHere = 0;
  Array.prototype.forEach.call(cards, function (li) {
    if (read.indexOf(li.dataset.slug) < 0) return;
    readHere++;
    li.classList.add("is-read");
    var badge = li.querySelector(".card-read");
    if (badge) badge.hidden = false;
  });
  var counter = document.querySelector(".read-count");
  var reset = document.querySelector(".read-reset");
  if (counter && readHere) {
    counter.textContent = "READ " + readHere + " / " + cards.length;
    counter.hidden = false;
    if (reset) reset.hidden = false;
  }
  if (reset) {
    reset.addEventListener("click", function () {
      if (!confirm("読んだ記録をすべて消して、未読に戻しますか？")) return;
      read = [];
      save("read-stories", read);
      Array.prototype.forEach.call(cards, function (li) {
        li.classList.remove("is-read");
        var badge = li.querySelector(".card-read");
        if (badge) badge.hidden = true;
      });
      counter.hidden = true;
      reset.hidden = true;
      if (window.finderRefresh) window.finderRefresh();
    });
  }

  // ランダム：まだ読んでいない作品を優先し、いま開いている作品は除く
  var buttons = document.querySelectorAll(".random-btn");
  if (buttons.length) {
    var current = article ? article.dataset.readSlug : "";
    fetch(BASE + "/search.json").then(function (r) { return r.json(); }).then(function (data) {
      var all = data.map(function (d) { return d.slug; }).filter(function (s) { return s !== current; });
      if (!all.length) return;
      // ボタンの文言で「未読から選ぶ」ことと残りの数が分かるようにする
      var left = all.filter(function (s) { return read.indexOf(s) < 0; }).length;
      Array.prototype.forEach.call(buttons, function (b) {
        b.hidden = false;
        var label = b.lastChild;
        if (label && label.nodeType === 3) label.textContent = left ? "未読からランダムに1作（残り" + left + "作）" : "ランダムに1作読む";
        b.addEventListener("click", function () {
          var done = load("read-stories", []);
          var unread = all.filter(function (s) { return done.indexOf(s) < 0; });
          var pool = unread.length ? unread : all;
          location.href = BASE + "/works/" + encodeURIComponent(pool[Math.floor(Math.random() * pool.length)]) + "/";
        });
      });
    });
  }

  // 文字サイズ（<head> で先に反映済み。ここではボタンの状態と切り替えだけ）
  var root = document.documentElement;
  var fsButtons = document.querySelectorAll(".fs-switch button[data-fs]");
  function markFs() {
    var cur = root.dataset.fs || "m";
    Array.prototype.forEach.call(fsButtons, function (b) { b.setAttribute("aria-pressed", String(b.dataset.fs === cur)); });
  }
  Array.prototype.forEach.call(fsButtons, function (b) {
    b.addEventListener("click", function () {
      root.dataset.fs = b.dataset.fs;
      try { localStorage.setItem("font-size", b.dataset.fs); } catch (e) {}
      markFs();
    });
  });
  markFs();

  // 縦書き・横書き（<head> で先に反映済み）
  var wmButtons = document.querySelectorAll(".wm-switch button[data-wm]");
  function markWm() {
    var cur = root.dataset.wm || "h";
    Array.prototype.forEach.call(wmButtons, function (b) { b.setAttribute("aria-pressed", String(b.dataset.wm === cur)); });
  }
  Array.prototype.forEach.call(wmButtons, function (b) {
    b.addEventListener("click", function () {
      root.dataset.wm = b.dataset.wm;
      try { localStorage.setItem("writing-mode", b.dataset.wm); } catch (e) {}
      markWm();
    });
  });
  markWm();
};
window.readerInit();

// 別のタブへ移るとタブ名が呼びかけに変わり、5秒以上たって戻ると「おかえりなさい」と迎える
(function () {
  var saved = "", left = 0, timer = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      clearTimeout(timer);
      if (!left) saved = document.title;
      left = Date.now();
      document.title = document.querySelector("article[data-read-slug]") ? "続きは、ここにあります" : "まだ読んでいない作品があります";
      return;
    }
    if (!left) return;
    var away = Date.now() - left;
    left = 0;
    if (away < 5000) { document.title = saved; return; }
    var min = Math.floor(away / 60000);
    document.title = min >= 10 ? "おかえりなさい。" + (min >= 120 ? Math.floor(min / 60) + "時間" : min + "分") + "ぶりですね" : "おかえりなさい";
    timer = setTimeout(function () { document.title = saved; }, 4000);
  });
})();

// 時間限定の作品：決められた時間帯（読者の端末の時刻）だけ一覧に出て、本文が開く
(function () {
  function inside(range) {
    var p = range.split("-"), h = new Date().getHours(), a = +p[0], b = +p[1];
    return a < b ? h >= a && h < b : h >= a || h < b;
  }
  Array.prototype.forEach.call(document.querySelectorAll(".cards-night[data-open]"), function (ul) {
    ul.hidden = !inside(ul.dataset.open);
  });
  var article = document.querySelector("article[data-open]");
  if (!article) return;
  var range = article.dataset.open, body = article.querySelector(".story-body"), note = article.querySelector(".night-closed");
  if (inside(range)) { body.hidden = false; return; }
  var p = range.split("-"), now = new Date();
  note.textContent = "このファイルは、午前" + (+p[0]) + "時から" + (+p[1]) + "時のあいだだけ開きます。\n現在 " +
    now.getHours() + ":" + ("0" + now.getMinutes()).slice(-2);
  note.hidden = false;
  var end = article.querySelector(".story-end");
  if (end) end.hidden = true;
  var tts = document.querySelector(".tts");
  if (tts) tts.remove();
})();
