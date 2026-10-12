// トップページの作品検索、ジャンル・タグ・評価・感想での絞り込みと並べ替え（静的サイトなのでブラウザ側で行う）
(function () {
  var input = document.getElementById("q");
  var status = document.getElementById("finder-status");
  var empty = document.getElementById("empty");
  var items = Array.prototype.slice.call(document.querySelectorAll(".cards li[data-slug]"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-genre]"));
  if (!input || !items.length) return;

  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get("q") || "", genre: params.get("genre") || "", tag: params.get("tag") || "",
    sort: params.get("sort") || "", min: params.get("min") || "", r: params.get("r") || "",
  };
  var list = items.length ? items[0].parentNode : null;
  var picks = { sort: document.getElementById("sort"), min: document.getElementById("min"), r: document.getElementById("r") };
  var reactionPick = document.getElementById("pick-reaction");
  var index = {};

  // 全角・半角、大文字・小文字、カタカナ・ひらがなの違いを無視する
  function norm(s) {
    return (s || "").normalize("NFKC").toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/\s+/g, "");
  }

  // 評価の集計は reviews.js が読み込んで window.RATINGS に入れる
  function ratingOf(slug) {
    return (window.RATINGS || {})[slug] || null;
  }
  function reactionCount(slug) {
    var r = ratingOf(slug);
    return r && r.reactions ? r.reactions[state.r] || 0 : 0;
  }

  function apply() {
    var words = state.q.split(/[\s　]+/).map(norm).filter(Boolean);
    var shown = 0;
    var ratingsReady = !!window.RATINGS;
    items.forEach(function (li) {
      var d = index[li.dataset.slug];
      var ok = true;
      var rt = ratingOf(li.dataset.slug);
      if (ratingsReady && state.min && !(rt && rt.avg >= Number(state.min))) ok = false;
      if (ratingsReady && state.r && !reactionCount(li.dataset.slug)) ok = false;
      var badge = li.querySelector(".card-reaction");
      if (badge) {
        var n = state.r ? reactionCount(li.dataset.slug) : 0;
        badge.textContent = n ? state.r + " " + n : "";
        badge.hidden = !n;
      }
      if (d) {
        if (state.genre && d.genre !== state.genre) ok = false;
        if (state.tag && d.tags.indexOf(state.tag) < 0) ok = false;
        if (ok && words.length) {
          ok = words.every(function (w) { return d.hay.indexOf(w) >= 0; });
        }
      }
      li.hidden = !ok;
      if (ok) shown++;
    });
    // 並べ替え（評価のない作品は後ろ、同点なら新着順のまま）
    var sorted = items.slice();
    var key = null;
    if (state.sort === "avg") key = function (li) { var r = ratingOf(li.dataset.slug); return r ? r.avg * 1e6 + r.count : -1; };
    else if (state.sort === "count") key = function (li) { var r = ratingOf(li.dataset.slug); return r ? r.count : -1; };
    else if (state.r) key = function (li) { return reactionCount(li.dataset.slug); };
    if (key && ratingsReady) {
      sorted.sort(function (a, b) { return key(b) - key(a) || items.indexOf(a) - items.indexOf(b); });
    }
    sorted.forEach(function (li) { list.appendChild(li); });
    chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.genre === state.genre)); });
    var active = state.q || state.genre || state.tag || state.min || state.r;
    status.innerHTML = "";
    if (active) {
      status.appendChild(document.createTextNode(shown + " / " + items.length + " FILES"));
      if (state.tag) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip chip-tag";
        b.setAttribute("aria-label", "タグ「" + state.tag + "」の絞り込みを解除");
        b.textContent = "#" + state.tag + " ×";
        b.onclick = function () { state.tag = ""; sync(); };
        status.appendChild(b);
      }
    }
    empty.hidden = shown > 0;
  }

  function sync() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.genre) p.set("genre", state.genre);
    if (state.tag) p.set("tag", state.tag);
    if (state.sort) p.set("sort", state.sort);
    if (state.min) p.set("min", state.min);
    if (state.r) p.set("r", state.r);
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
    apply();
  }

  input.value = state.q;
  input.addEventListener("input", function () { state.q = input.value.trim(); sync(); });
  chips.forEach(function (c) {
    c.addEventListener("click", function () { state.genre = c.dataset.genre; sync(); });
  });

  Object.keys(picks).forEach(function (k) {
    var el = picks[k];
    if (!el) return;
    el.value = state[k];
    if (el.value !== state[k]) state[k] = "";
    el.addEventListener("change", function () { state[k] = el.value; sync(); });
  });
  // reviews.js が評価を読み込んだら呼ぶ
  window.finderRefresh = function () {
    var any = Object.keys(window.RATINGS || {}).some(function (k) { return window.RATINGS[k].reactions; });
    if (reactionPick) reactionPick.hidden = !any;
    apply();
  };

  fetch(window.SEARCH_INDEX).then(function (r) { return r.json(); }).then(function (data) {
    data.forEach(function (d) {
      d.hay = norm([d.title, d.description, d.genre, d.tags.join(" "), d.text].join(" "));
      index[d.slug] = d;
    });
    apply();
  });
})();
