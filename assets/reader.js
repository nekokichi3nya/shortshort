// 既読マーク（未読に戻すことも可）・ランダムに1作・文字サイズ切り替え（記録はこのブラウザの中だけ）
(function () {
  var BASE = window.SITE_BASE || "";

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  var read = load("read-stories", []);

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
  var fsButtons = document.querySelectorAll(".fs-switch button");
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
})();
