// 感想・星評価（保存先は Google スプレッドシート。reviews/apps-script.gs を参照）
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

  // 一覧ページ：カードに平均評価を出す
  var cardSpots = document.querySelectorAll("[data-rating-for]");
  if (cardSpots.length) {
    get().then(function (d) {
      if (!d.ok) return;
      Array.prototype.forEach.call(cardSpots, function (el) {
        var s = d.summary[el.dataset.ratingFor];
        if (!s) return;
        el.textContent = "★ " + s.avg.toFixed(1) + " (" + s.count + ")";
        el.setAttribute("aria-label", "平均評価 5点中" + s.avg.toFixed(1) + "、" + s.count + "件");
        el.hidden = false;
      });
    }).catch(function () {});
  }

  // 作品ページ：評価の表示と投稿
  var box = document.getElementById("reviews");
  if (!box) return;
  var slug = box.dataset.slug;
  var form = box.querySelector("form");
  var status = box.querySelector(".review-status");
  var summary = box.querySelector(".review-summary");
  var list = box.querySelector(".review-list");
  var doneKey = "reviewed:" + slug;

  function load() {
    get({ slug: slug }).then(function (d) {
      if (!d.ok) return;
      if (d.count) {
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
        summary.setAttribute("aria-label", "平均評価 5点中" + d.avg.toFixed(1) + "、" + d.count + "件");
      } else {
        summary.textContent = "まだ評価はありません。";
      }
      list.innerHTML = "";
      d.comments.forEach(function (r) {
        var li = document.createElement("li");
        var head = document.createElement("p");
        head.className = "review-head";
        var s = document.createElement("span");
        s.className = "review-stars";
        s.textContent = stars(r.rating);
        s.setAttribute("aria-label", "5点中" + r.rating + "点");
        var date = document.createElement("span");
        date.className = "mono";
        date.textContent = r.date;
        head.append(s, date);
        var body = document.createElement("p");
        body.className = "review-text";
        body.textContent = r.comment;
        li.append(head, body);
        list.appendChild(li);
      });
      list.hidden = !d.comments.length;
    }).catch(function () {
      summary.textContent = "評価を読み込めませんでした。";
    });
  }

  function markDone(msg) {
    form.hidden = true;
    status.textContent = msg;
  }

  try {
    if (localStorage.getItem(doneKey)) markDone("この作品には評価を送信済みです。ありがとうございました。");
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
        markDone(d.pending
          ? "送信しました。感想は確認後に掲載されます。ありがとうございました。"
          : "送信しました。ありがとうございました。");
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
