// 星評価（保存先は Google スプレッドシート。reviews/apps-script.gs を参照）
(function () {
  var API = window.REVIEWS_ENDPOINT;
  if (!API) return;

  function stars(n) {
    var full = Math.floor(n);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }
  function get(params) {
    return fetch(API + (params ? "?" + new URLSearchParams(params) : "")).then(function (r) { return r.json(); });
  }
  function label(avg, count) {
    return "平均評価 5点中" + avg.toFixed(1) + "、" + count + "件";
  }

  // 一覧ページ：カードに平均評価を出す
  var cardSpots = document.querySelectorAll("[data-rating-for]");
  if (cardSpots.length) {
    get().then(function (d) {
      if (!d.ok) return;
      Array.prototype.forEach.call(cardSpots, function (el) {
        var s = d.summary[el.dataset.ratingFor];
        if (!s) return;
        el.textContent = "★ " + s.avg.toFixed(1) + " (" + s.count + ")";
        el.setAttribute("aria-label", label(s.avg, s.count));
        el.hidden = false;
      });
    }).catch(function () {});
  }

  // 作品ページ：平均の表示と評価の送信
  var box = document.getElementById("reviews");
  if (!box) return;
  var slug = box.dataset.slug;
  var form = box.querySelector("form");
  var status = box.querySelector(".review-status");
  var summary = box.querySelector(".review-summary");
  var doneKey = "reviewed:" + slug;

  function load() {
    get({ slug: slug }).then(function (d) {
      if (!d.ok) return;
      if (!d.count) {
        summary.textContent = "まだ評価はありません。";
        return;
      }
      summary.innerHTML = "";
      var big = document.createElement("span");
      big.className = "review-avg";
      big.textContent = d.avg.toFixed(1);
      var st = document.createElement("span");
      st.className = "review-stars";
      st.textContent = stars(d.avg);
      st.setAttribute("aria-hidden", "true");
      var c = document.createElement("span");
      c.className = "mono review-count";
      c.textContent = d.count + " 件の評価";
      summary.append(big, st, c);
      summary.setAttribute("aria-label", label(d.avg, d.count));
    }).catch(function () {
      summary.textContent = "評価を読み込めませんでした。";
    });
  }

  function markDone(msg) {
    form.hidden = true;
    status.textContent = msg;
  }

  try {
    if (localStorage.getItem(doneKey)) markDone("この作品は評価済みです。ありがとうございました。");
  } catch (e) {}

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var fd = new FormData(form);
    if (!fd.get("rating")) {
      status.textContent = "星をえらんでください。";
      return;
    }
    fd.append("slug", slug);
    var btn = form.querySelector("button");
    btn.disabled = true;
    status.textContent = "送信中…";
    fetch(API, { method: "POST", body: new URLSearchParams(fd) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error);
        try { localStorage.setItem(doneKey, "1"); } catch (e) {}
        markDone("送信しました。ありがとうございました。");
        load();
      })
      .catch(function (e) {
        btn.disabled = false;
        status.textContent = e && e.message === "busy"
          ? "ただいま混み合っています。しばらくしてから送ってください。"
          : "送信できませんでした。時間をおいてもう一度お試しください。";
      });
  });

  load();
})();
