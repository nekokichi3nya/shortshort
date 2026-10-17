// 既読マーク（未読に戻すことも可）・お気に入り・次の一作・NEW・ランダムに1作・文字サイズと縦書きの切り替え（記録はこのブラウザの中だけ）
(function () {
  var BASE = window.SITE_BASE || "";

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  var read = load("read-stories", []);
  var favs = load("fav-stories", []);

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
      Array.prototype.forEach.call(buttons, function (b) {
        b.hidden = false;
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
})();
