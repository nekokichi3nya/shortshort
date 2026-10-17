// 読み上げ（ブラウザに入っている音声で読む。声・速さ・連続再生の設定はこのブラウザの中だけに記録）
(function () {
  var synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) return;
  var BASE = window.SITE_BASE || "";

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  var RATES = { slow: 0.8, normal: 1, fast: 1.3, faster: 1.6 };
  var opt = {
    voice: load("tts-voice", "f"),
    rate: RATES[load("tts-rate", "normal")] ? load("tts-rate", "normal") : "normal",
    auto: load("tts-auto", false)
  };

  // 声：日本語の音声を名前から女性・男性に振り分ける（分からないものは女性扱い。多くの端末の標準の声が女性のため）
  var FEMALE = /female|女性|kyoko|o-?ren|nanami|haruka|ayumi|sayaka|mizuki|aoi|mayu|shiori|nana/i;
  var MALE = /male|男性|otoya|hattori|ichiro|keita|daichi|naoki|masaru|takumi|eddy|reed|rocko/i;
  var voices = { f: [], m: [] };
  function sortVoices() {
    voices = { f: [], m: [] };
    synth.getVoices().forEach(function (v) {
      if (!/^ja/i.test(v.lang)) return;
      var name = v.name + " " + v.voiceURI;
      voices[FEMALE.test(name) ? "f" : MALE.test(name) ? "m" : "f"].push(v);
    });
    showNote();
  }
  // 選んだ声がこの端末にないときは、もう一方の声の高さを変えて代わりにする
  function pickVoice() {
    var own = voices[opt.voice];
    if (own.length) return { voice: own[0], pitch: 1 };
    var other = voices[opt.voice === "m" ? "f" : "m"];
    return { voice: other[0] || null, pitch: opt.voice === "m" ? 0.6 : 1.4 };
  }

  // 本文を読む単位に分ける（長い段落は句点で区切る。長い発話が途中で止まるブラウザがあるため）
  var article, panel, chunks = [], pos = 0, state = "idle", gen = 0;
  function collect() {
    chunks = [];
    var title = article.querySelector(".story-title");
    if (title) chunks.push({ text: title.textContent, el: title, wait: true });
    Array.prototype.forEach.call(article.querySelectorAll(".story-body p"), function (p) {
      var text = p.textContent.trim();
      if (!text) return;
      var parts = text.length > 120 ? text.match(/[^。！？]+[。！？」』）]*|[^。！？]+$/g) || [text] : [text];
      parts.forEach(function (t) { chunks.push({ text: t, el: p }); });
    });
  }

  function mark(el) {
    var old = document.querySelectorAll(".tts-now");
    Array.prototype.forEach.call(old, function (o) { if (o !== el) o.classList.remove("tts-now"); });
    if (!el) return;
    el.classList.add("tts-now");
    var r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 120 || r.left < 0 || r.right > window.innerWidth) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  function speakFrom(i) {
    var my = ++gen;
    synth.cancel();
    pos = i;
    if (pos >= chunks.length) return finished();
    var c = chunks[pos];
    var u = new SpeechSynthesisUtterance(c.text);
    var v = pickVoice();
    u.lang = "ja-JP";
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch;
    u.rate = RATES[opt.rate];
    u.onend = function () {
      if (my !== gen || state !== "playing") return;
      if (c.wait) setTimeout(function () { if (my === gen && state === "playing") speakFrom(pos + 1); }, 700);
      else speakFrom(pos + 1);
    };
    u.onerror = function (e) {
      if (my !== gen || e.error === "interrupted" || e.error === "canceled") return;
      setState("idle");
      note(e.error === "not-allowed" ? "▶ を押すと続きから読み上げます。" : "この端末では読み上げられませんでした。");
    };
    mark(c.el);
    synth.speak(u);
  }

  function setState(s) {
    state = s;
    document.documentElement.classList.toggle("tts-on", s !== "idle");
    var playing = s === "playing";
    document.querySelectorAll(".tts-play").forEach(function (b) {
      b.textContent = playing ? "❚❚ 一時停止" : s === "paused" ? "▶ 続きから" : "▶ 読み上げる";
      b.setAttribute("aria-pressed", String(playing));
    });
    document.querySelectorAll(".tts-stop").forEach(function (b) { b.disabled = s === "idle"; });
    if (s === "idle") mark(null);
    if (dockTitle && article) dockTitle.textContent = article.querySelector(".story-title").textContent;
  }

  function play() {
    if (state === "playing") { gen++; synth.cancel(); setState("paused"); return; }
    note("");
    var from = state === "paused" ? pos : 0;
    setState("playing");
    speakFrom(from);
  }
  function stop() {
    gen++;
    synth.cancel();
    pos = 0;
    setState("idle");
  }
  // 声や速さを変えたら、いま読んでいるところから読み直す
  function restart() {
    if (state === "playing") speakFrom(pos);
  }

  // 読み終わり：連続再生なら次の作品へ（番号順に、まだ読んでいない作品を優先）
  function finished() {
    var current = article.dataset.readSlug || "";
    var done = load("read-stories", []);
    if (current && done.indexOf(current) < 0) { done.push(current); save("read-stories", done); }
    if (!opt.auto) { pos = 0; setState("idle"); return; }
    var my = gen;
    fetch(BASE + "/search.json").then(function (r) { return r.json(); }).then(function (data) {
      if (my !== gen || state !== "playing") return;
      var slugs = data.map(function (d) { return d.slug; });
      var start = slugs.indexOf(current);
      var order = slugs.slice(start + 1).concat(slugs.slice(0, start + 1)).filter(function (s) { return s !== current; });
      var next = order.filter(function (s) { return done.indexOf(s) < 0; })[0] || order[0];
      if (!next) { pos = 0; setState("idle"); return; }
      return goTo(BASE + "/works/" + encodeURIComponent(next) + "/", my);
    }).catch(function () { pos = 0; setState("idle"); });
  }

  // ページを開き直すと読み上げが止まるブラウザが多いので、本文だけ差し替えて読み続ける
  function goTo(url, my) {
    return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      if (my !== gen || state !== "playing") return;
      var doc = new DOMParser().parseFromString(html, "text/html");
      var main = doc.querySelector("main.reader");
      var cur = document.querySelector("main.reader");
      if (!main || !cur) { location.href = url; return; }
      cur.replaceWith(document.adoptNode(main));
      document.title = doc.title;
      history.pushState({ tts: true }, "", url);
      window.scrollTo(0, 0);
      if (window.readerInit) window.readerInit();
      if (window.reviewsInit) window.reviewsInit();
      bind();
      setState("playing");
      setTimeout(function () { if (my === gen && state === "playing") speakFrom(0); }, 900);
    });
  }
  window.addEventListener("popstate", function () { location.reload(); });
  window.addEventListener("pagehide", function () { synth.cancel(); });

  // 操作パネル（作品ページ）と、読み上げ中に画面下に出す小さな操作バー
  var dock = document.createElement("div");
  dock.className = "tts-dock";
  dock.setAttribute("role", "group");
  dock.setAttribute("aria-label", "読み上げの操作");
  dock.innerHTML = '<span class="mono">VOICE</span><span class="tts-dock-title"></span>' +
    '<button type="button" class="tts-play"></button><button type="button" class="tts-stop">■ 停止</button>';
  document.body.appendChild(dock);
  var dockTitle = dock.querySelector(".tts-dock-title");
  dock.querySelector(".tts-play").addEventListener("click", play);
  dock.querySelector(".tts-stop").addEventListener("click", stop);

  function note(text) {
    var el = panel && panel.querySelector(".tts-note");
    if (el) { el.textContent = text; el.hidden = !text; }
  }
  function showNote() {
    if (!panel || state === "playing") return;
    var any = voices.f.length || voices.m.length;
    if (any && !voices[opt.voice].length) {
      note(opt.voice === "m" ? "この端末には男性の声がないため、声を低くして読みます。" : "この端末には女性の声がないため、声を高くして読みます。");
    } else note("");
  }
  function markGroup(attr, value) {
    panel.querySelectorAll("button[" + attr + "]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === String(value)));
    });
  }

  function bind() {
    article = document.querySelector("main.reader article");
    panel = document.querySelector(".tts");
    if (!article || !panel) return;
    collect();
    panel.hidden = false;
    panel.querySelector(".tts-play").addEventListener("click", play);
    panel.querySelector(".tts-stop").addEventListener("click", stop);
    panel.querySelectorAll("button[data-voice]").forEach(function (b) {
      b.addEventListener("click", function () {
        opt.voice = b.dataset.voice; save("tts-voice", opt.voice);
        markGroup("data-voice", opt.voice); showNote(); restart();
      });
    });
    panel.querySelectorAll("button[data-rate]").forEach(function (b) {
      b.addEventListener("click", function () {
        opt.rate = b.dataset.rate; save("tts-rate", opt.rate);
        markGroup("data-rate", opt.rate); restart();
      });
    });
    panel.querySelectorAll("button[data-auto]").forEach(function (b) {
      b.addEventListener("click", function () {
        opt.auto = b.dataset.auto === "on"; save("tts-auto", opt.auto);
        markGroup("data-auto", opt.auto ? "on" : "off");
      });
    });
    markGroup("data-voice", opt.voice);
    markGroup("data-rate", opt.rate);
    markGroup("data-auto", opt.auto ? "on" : "off");
    showNote();
    setState(state);
  }

  sortVoices();
  if ("onvoiceschanged" in synth) synth.addEventListener("voiceschanged", sortVoices);
  synth.cancel();
  bind();
})();
