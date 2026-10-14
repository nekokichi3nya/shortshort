// 既読マーク・ランダムに1作・文字サイズ切り替え（記録はこのブラウザの中だけ）
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
  if (article && end && "IntersectionObserver" in window) {
    var slug = article.dataset.readSlug;
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      read = load("read-stories", []);
      if (read.indexOf(slug) < 0) { read.push(slug); save("read-stories", read); }
    });
    io.observe(end);
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
  if (counter && readHere) {
    counter.textContent = "READ " + readHere + " / " + cards.length;
    counter.hidden = false;
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
