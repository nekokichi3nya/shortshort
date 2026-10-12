/**
 * 感想・星評価の受け口（Google スプレッドシート + Apps Script）。
 * 設定手順は README の「感想・星評価」を参照。
 *
 * シート「感想」の各行が1件の投稿。「非表示」にチェックを入れた行はサイトに出なくなり、平均にも入らない。
 */
var SHEET_NAME = '感想';
var HEADER = ['日時', '作品', '星', '感想', '非表示'];
// true にすると新しい投稿は非表示で届き、「非表示」のチェックを外したものだけ公開される（承認制）
var REQUIRE_APPROVAL = false;
var MAX_COMMENT = 1000;
// 荒らし対策：サイト全体で10分間に受け付ける投稿の上限
var MAX_POSTS_PER_10MIN = 30;

function doGet(e) {
  var slug = (e && e.parameter && e.parameter.slug) || '';
  var rows = visibleRows_();
  if (!slug) {
    // 一覧ページ用：作品ごとの平均と件数
    var summary = {};
    rows.forEach(function (r) {
      var s = summary[r.slug] || (summary[r.slug] = { sum: 0, count: 0 });
      s.sum += r.rating;
      s.count++;
    });
    Object.keys(summary).forEach(function (k) {
      var s = summary[k];
      summary[k] = { avg: round1_(s.sum / s.count), count: s.count };
    });
    return json_({ ok: true, summary: summary });
  }
  var mine = rows.filter(function (r) { return r.slug === slug; });
  var sum = mine.reduce(function (a, r) { return a + r.rating; }, 0);
  var comments = mine.filter(function (r) { return r.comment; })
    .reverse()
    .slice(0, 50)
    .map(function (r) { return { date: r.date, rating: r.rating, comment: r.comment }; });
  return json_({
    ok: true,
    avg: mine.length ? round1_(sum / mine.length) : 0,
    count: mine.length,
    comments: comments,
  });
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  // 人には見えない入力欄に何か入っていたら機械の投稿とみなし、受け付けたふりをして捨てる
  if (p.website) return json_({ ok: true });
  var slug = String(p.slug || '');
  var rating = Number(p.rating);
  var comment = String(p.comment || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_COMMENT);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || !(rating >= 1 && rating <= 5 && rating % 1 === 0)) {
    return json_({ ok: false, error: 'invalid' });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'posts-' + Math.floor(Date.now() / 600000);
    var n = Number(cache.get(key) || 0);
    if (n >= MAX_POSTS_PER_10MIN) return json_({ ok: false, error: 'busy' });
    cache.put(key, String(n + 1), 700);

    var sh = sheet_();
    // 先頭が = + - @ の文字はスプレッドシートで数式として解釈されないよう ' を付ける
    var safe = /^[=+\-@]/.test(comment) ? "'" + comment : comment;
    sh.appendRow([new Date(), slug, rating, safe, REQUIRE_APPROVAL]);
    sh.getRange(sh.getLastRow(), 5).insertCheckboxes().setValue(REQUIRE_APPROVAL);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, pending: REQUIRE_APPROVAL });
}

function visibleRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, HEADER.length).getValues()
    .filter(function (v) { return v[4] !== true && v[1] && Number(v[2]) >= 1; })
    .map(function (v) {
      return {
        date: v[0] instanceof Date ? Utilities.formatDate(v[0], tz, 'yyyy-MM-dd') : String(v[0]),
        slug: String(v[1]),
        rating: Math.min(5, Math.max(1, Math.round(Number(v[2])))),
        comment: String(v[3] || ''),
      };
    });
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function round1_(x) {
  return Math.round(x * 10) / 10;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
