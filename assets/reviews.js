// 星評価（保存先は Google スプレッドシート。reviews/apps-script.gs を参照）
// 読み上げの連続再生でページの中身を差し替えたときも、もう一度呼べるようにしておく
window.reviewsInit = function () {
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

  // 一覧ページ：カードに平均評価を出し、並べ替え・絞り込み（search.js）に集計を渡す
  var cardSpots = document.querySelectorAll("[data-rating-for]");
  if (cardSpots.length) {
    get().then(function (d) {
      if (!d.ok) return;
      window.RATINGS = d.summary;
      if (window.finderRefresh) window.finderRefresh();
      // 古いスクリプトは一覧に感想の数を返さないので、作品ごとに読み足す
      var missing = Object.keys(d.summary).filter(function (k) { return !d.summary[k].reactions; });
      if (missing.length) {
        Promise.all(missing.map(function (slug) {
          return get({ slug: slug }).then(function (x) {
            if (x.ok) d.summary[slug].reactions = x.reactions || {};
          }).catch(function () {});
        })).then(function () {
          if (window.finderRefresh) window.finderRefresh();
        });
      }
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
  var counts = box.querySelector(".reaction-counts");
  var doneKey = "reviewed:" + slug;

  function load() {
    get({ slug: slug }).then(function (d) {
      if (!d.ok) return;
      showReactions(d.reactions || {});
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

  // 選ばれた感想を多い順に「ゾッとした 3」の形で並べる
  function showReactions(r) {
    var keys = Object.keys(r).sort(function (a, b) { return r[b] - r[a]; });
    counts.innerHTML = "";
    keys.forEach(function (k) {
      var li = document.createElement("li");
      li.textContent = k + " ";
      var n = document.createElement("span");
      n.className = "mono";
      n.textContent = r[k];
      li.appendChild(n);
      counts.appendChild(li);
    });
    counts.hidden = !keys.length;
  }

  // このブラウザを見分ける ID。同じ ID で送り直すと、前の評価が書き換わる
  function voterId() {
    try {
      var id = localStorage.getItem("voter-id");
      if (!id) {
        id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
        localStorage.setItem("voter-id", id);
      }
      return id;
    } catch (e) {
      return "";
    }
  }

  function savedChoice() {
    try {
      return JSON.parse(localStorage.getItem(doneKey) || "null");
    } catch (e) {
      return null;
    }
  }

  var btn = form.querySelector("button");

  // 前に送った評価をフォームに戻し、選び直せるようにする
  function showMine(c) {
    Array.prototype.forEach.call(form.querySelectorAll("input[name=rating]"), function (el) {
      el.checked = Number(el.value) === c.rating;
    });
    Array.prototype.forEach.call(form.querySelectorAll("input[name=reactions]"), function (el) {
      el.checked = (c.reactions || []).indexOf(el.value) >= 0;
    });
    btn.textContent = "評価を変更する";
  }

  var mine = savedChoice();
  if (mine && mine.rating) {
    showMine(mine);
    status.textContent = "あなたの評価です。選び直して「評価を変更する」を押すと変更できます。";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var fd = new FormData(form);
    if (!fd.get("rating")) {
      status.textContent = "星をえらんでください。";
      return;
    }
    var choice = { rating: Number(fd.get("rating")), reactions: fd.getAll("reactions") };
    var changing = !!(mine && mine.rating);
    fd.set("reactions", choice.reactions.join(","));
    fd.append("slug", slug);
    fd.append("voter", voterId());
    btn.disabled = true;
    status.textContent = "送信中…";
    fetch(API, { method: "POST", body: new URLSearchParams(fd) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error);
        mine = choice;
        try { localStorage.setItem(doneKey, JSON.stringify(choice)); } catch (e) {}
        btn.disabled = false;
        showMine(choice);
        status.textContent = changing ? "評価を変更しました。" : "送信しました。ありがとうございました。";
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
};
window.reviewsInit();
