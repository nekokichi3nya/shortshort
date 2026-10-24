// 隠し要素「閲覧記録」：作品を開いた時刻と読んでいた時間をこのブラウザの中だけに記録し、
// 読了が 3作・10作・全作に届いたとき、END の下にサイトからの「報告」を一度だけ打ち出す（どこにも送信しない）
(function () {
  var BASE = window.SITE_BASE || "";
  var KEY = "watch-log";
  var cur = null;    // 今開いている作品の slug
  var since = 0;     // 表示されはじめた時刻（見えていない間は 0）
  var io = null;

  function load() {
    try { var v = localStorage.getItem(KEY); if (v) return JSON.parse(v); } catch (e) {}
    return { first: 0, hours: [], dwell: {}, titles: {}, shown: [] };
  }
  function save(log) {
    try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {}
  }
  function readList() {
    try { return JSON.parse(localStorage.getItem("read-stories") || "[]"); } catch (e) { return []; }
  }

  // 見えていた時間だけを足し込む
  function flush() {
    if (!cur || !since) return;
    var log = load();
    log.dwell[cur] = (log.dwell[cur] || 0) + Math.round((Date.now() - since) / 1000);
    save(log);
    since = document.visibilityState === "visible" ? Date.now() : 0;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { flush(); since = 0; }
    else if (cur) since = Date.now();
  });
  window.addEventListener("pagehide", flush);

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hourLabel(h) {
    var part = h < 5 ? "深夜" : h < 10 ? "朝" : h < 16 ? "昼" : h < 19 ? "夕方" : "夜";
    return part + h + "時台";
  }
  function duration(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m ? m + "分" + pad(s) + "秒" : s + "秒";
  }

  function report(level, total) {
    var log = load();
    var read = readList();
    var d = new Date(log.first);
    var lines = ["閲覧記録を照合しています……", ""];
    lines.push("読了　" + read.length + "作");
    lines.push("最初の記録　" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad(d.getHours()) + ":" + pad(d.getMinutes()));
    var best = -1, bestH = 0;
    for (var h = 0; h < 24; h++) if ((log.hours[h] || 0) > best) { best = log.hours[h] || 0; bestH = h; }
    lines.push("よく読む時間帯　" + hourLabel(bestH));
    var longest = null;
    Object.keys(log.dwell).forEach(function (k) { if (log.titles[k] && (!longest || log.dwell[k] > log.dwell[longest])) longest = k; });
    if (longest) lines.push("いちばん長く留まった作品　『" + log.titles[longest] + "』　" + duration(log.dwell[longest]));
    if (level >= 10) {
      var left = Object.keys(log.titles).filter(function (k) { return read.indexOf(k) < 0; });
      if (left.length) lines.push("開いたまま、読み終えなかった作品　『" + log.titles[left[0]] + "』");
    }
    lines.push("");
    if (level === 3) {
      lines.push("あなたのことが、少しわかってきました。");
    } else if (level === 10) {
      lines.push("次にどれを開くか、もう見当はついています。");
    } else {
      lines.push("全" + total + "作品の読了を確認しました。");
      lines.push("これで、わたしがあなたについて知らないことは、あとひとつだけです。");
      lines.push("");
      lines.push("あなたの名前。");
    }
    lines.push("");
    lines.push("※この記録は、あなたの端末の中にしかありません。");
    show(lines);
  }

  function show(lines) {
    var anchor = document.querySelector(".read-toggle-wrap") || document.querySelector(".story-end");
    if (!anchor || document.querySelector(".watch-report")) return;
    var box = document.createElement("section");
    box.className = "watch-report mono";
    box.setAttribute("aria-label", "閲覧記録");
    var pre = document.createElement("p");
    pre.className = "watch-lines";
    box.appendChild(pre);
    var actions = document.createElement("p");
    actions.className = "watch-actions";
    actions.hidden = true;
    var close = document.createElement("button");
    close.type = "button";
    close.className = "read-reset mono";
    close.textContent = "見なかったことにする";
    close.addEventListener("click", function () { box.remove(); });
    var wipe = document.createElement("button");
    wipe.type = "button";
    wipe.className = "read-reset mono";
    wipe.textContent = "記録を消す";
    wipe.addEventListener("click", function () {
      var log = load();
      save({ first: Date.now(), hours: [], dwell: {}, titles: {}, shown: log.shown });
      pre.textContent = "記録を消去しました。\n\n……消去した、ということも記録しておきます。";
      actions.hidden = true;
      setTimeout(function () { box.remove(); }, 4000);
    });
    actions.appendChild(close);
    actions.appendChild(wipe);
    box.appendChild(actions);
    anchor.parentNode.insertBefore(box, anchor.nextSibling);

    var text = lines.join("\n");
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) { pre.textContent = text; actions.hidden = false; return; }
    var i = 0;
    (function type() {
      if (!box.isConnected) return;
      i++;
      pre.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(type, text[i - 1] === "\n" ? 380 : 45);
      else actions.hidden = false;
    })();
  }

  function check() {
    var read = readList();
    var log = load();
    var levels = [3, 10];
    fetch(BASE + "/search.json").then(function (r) { return r.json(); }).then(function (data) {
      var all = data.map(function (d) { return d.slug; });
      var done = all.every(function (s) { return read.indexOf(s) >= 0; });
      if (done && log.shown.indexOf("all") < 0) return fire("all", all.length);
      fallback();
    }).catch(fallback);
    function fallback() {
      for (var i = levels.length - 1; i >= 0; i--) {
        if (read.length >= levels[i]) {
          if (log.shown.indexOf(levels[i]) < 0) fire(levels[i], 0);
          return;
        }
      }
    }
    function fire(level, total) {
      flush();
      var l = load();
      l.shown.push(level);
      save(l);
      report(level, total);
    }
  }

  // 3作読み終えると、ページのいちばん下に「乗り継ぎ」端末への入口がかすかに出る
  function hint() {
    if (readList().length < 3 || document.querySelector(".transit-hint")) return;
    var wrap = document.querySelector(".random-wrap");
    if (!wrap) return;
    var p = document.createElement("p");
    p.className = "transit-hint mono";
    var a = document.createElement("a");
    a.href = BASE + "/transit/";
    a.textContent = "› 座標を一件、受信しています";
    p.appendChild(a);
    wrap.parentNode.insertBefore(p, wrap.nextSibling);
  }

  // 読み上げの連続再生で本文が差し替わったときにも呼ばれる
  window.watchInit = function () {
    flush();
    if (io) io.disconnect();
    var article = document.querySelector("article[data-read-slug]");
    cur = article ? article.dataset.readSlug : null;
    if (!cur) return;
    var log = load();
    var now = new Date();
    if (!log.first) log.first = now.getTime();
    log.hours[now.getHours()] = (log.hours[now.getHours()] || 0) + 1;
    var title = document.querySelector(".story-title");
    if (title) log.titles[cur] = title.textContent;
    save(log);
    since = document.visibilityState === "visible" ? Date.now() : 0;
    var end = document.querySelector(".story-end");
    if (!end || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      // 既読の記録（reader.js）が済んでから数える
      setTimeout(function () { check(); hint(); }, 1200);
    });
    io.observe(end);
  };
  window.watchInit();
})();
