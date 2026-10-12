// トップページの作品検索とジャンル・タグ絞り込み（静的サイトなのでブラウザ側で行う）
(function () {
  var input = document.getElementById("q");
  var status = document.getElementById("finder-status");
  var empty = document.getElementById("empty");
  var items = Array.prototype.slice.call(document.querySelectorAll(".cards li[data-slug]"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-genre]"));
  if (!input || !items.length) return;

  var params = new URLSearchParams(location.search);
  var state = { q: params.get("q") || "", genre: params.get("genre") || "", tag: params.get("tag") || "" };
  var index = {};

  // 全角・半角、大文字・小文字、カタカナ・ひらがなの違いを無視する
  function norm(s) {
    return (s || "").normalize("NFKC").toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/\s+/g, "");
  }

  function apply() {
    var words = state.q.split(/[\s　]+/).map(norm).filter(Boolean);
    var shown = 0;
    items.forEach(function (li) {
      var d = index[li.dataset.slug];
      var ok = true;
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
    chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.genre === state.genre)); });
    var active = state.q || state.genre || state.tag;
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
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
    apply();
  }

  input.value = state.q;
  input.addEventListener("input", function () { state.q = input.value.trim(); sync(); });
  chips.forEach(function (c) {
    c.addEventListener("click", function () { state.genre = c.dataset.genre; sync(); });
  });

  fetch(window.SEARCH_INDEX).then(function (r) { return r.json(); }).then(function (data) {
    data.forEach(function (d) {
      d.hay = norm([d.title, d.description, d.genre, d.tags.join(" "), d.text].join(" "));
      index[d.slug] = d;
    });
    apply();
  });
})();
