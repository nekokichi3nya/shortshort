/**
 * 星評価の受け口（Google スプレッドシート + Apps Script）。
 * 設定手順は README の「星評価」を参照。
 *
 * シート「評価」の各行が1件の評価（同じブラウザから送り直すと、その行を書き換える）。「無効」にチェックを入れた行は平均にも感想の数にも入らなくなる。
 * スプレッドシートの「拡張機能 → Apps Script」から作っても、script.google.com で単独のプロジェクトとして作ってもよい。
 * 単独の場合は、最初の評価が届いたときに「眠人ショートショート 星評価」というスプレッドシートを自動で作る。
 */
var SHEET_NAME = '評価';
var HEADER = ['日時', '作品', '星', '無効', '感想', 'ID'];
// 選べる感想（サイト側の scripts/build.py の REACTIONS と同じにする）
var REACTIONS = ['ゾッとした', '切なかった', 'オチにやられた', '考えさせられた', 'ありそうで怖い', 'また読みたい'];
// 荒らし対策：サイト全体で10分間に受け付ける評価の上限
var MAX_POSTS_PER_10MIN = 30;

function doGet(e) {
  var slug = (e && e.parameter && e.parameter.slug) || '';
  var rows = validRows_();
  var summary = {};
  rows.forEach(function (r) {
    var s = summary[r.slug] || (summary[r.slug] = { sum: 0, count: 0 });
    s.sum += r.rating;
    s.count++;
  });
  Object.keys(summary).forEach(function (k) {
    var s = summary[k];
    summary[k] = { avg: Math.round(s.sum / s.count * 10) / 10, count: s.count };
  });
  if (!slug) return json_({ ok: true, summary: summary });
  var mine = summary[slug] || { avg: 0, count: 0 };
  var reactions = {};
  rows.forEach(function (r) {
    if (r.slug !== slug) return;
    r.reactions.forEach(function (x) { reactions[x] = (reactions[x] || 0) + 1; });
  });
  return json_({ ok: true, avg: mine.avg, count: mine.count, reactions: reactions });
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  // 人には見えない入力欄に何か入っていたら機械の投稿とみなし、受け付けたふりをして捨てる
  if (p.website) return json_({ ok: true });
  var slug = String(p.slug || '');
  var rating = Number(p.rating);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || !(rating >= 1 && rating <= 5 && rating % 1 === 0)) {
    return json_({ ok: false, error: 'invalid' });
  }
  var voter = /^[0-9a-f]{32}$/.test(String(p.voter || '')) ? String(p.voter) : '';
  var picked = String(p.reactions || '').split(',').filter(function (x, i, a) {
    return REACTIONS.indexOf(x) >= 0 && a.indexOf(x) === i;
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'posts-' + Math.floor(Date.now() / 600000);
    var n = Number(cache.get(key) || 0);
    if (n >= MAX_POSTS_PER_10MIN) return json_({ ok: false, error: 'busy' });
    cache.put(key, String(n + 1), 700);

    var sh = sheet_();
    var row = voter ? findRow_(sh, slug, voter) : 0;
    if (row) {
      // 前の評価を書き換える（「無効」のチェックはそのまま）
      sh.getRange(row, 1).setValue(new Date());
      sh.getRange(row, 3).setValue(rating);
      sh.getRange(row, 5).setValue(picked.join('、'));
    } else {
      sh.appendRow([new Date(), slug, rating, false, picked.join('、'), voter]);
      sh.getRange(sh.getLastRow(), 4).insertCheckboxes();
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function findRow_(sh, slug, voter) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var v = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i][1]) === slug && String(v[i][5]) === voter) return i + 2;
  }
  return 0;
}

function validRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADER.length).getValues()
    .filter(function (v) { return v[3] !== true && v[1] && Number(v[2]) >= 1; })
    .map(function (v) {
      return {
        slug: String(v[1]),
        rating: Math.min(5, Math.max(1, Math.round(Number(v[2])))),
        reactions: String(v[4] || '').split('、').filter(function (x) { return REACTIONS.indexOf(x) >= 0; }),
      };
    });
}

function spreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('眠人ショートショート 星評価');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_() {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  } else if (sh.getRange(1, HEADER.length).getValue() !== HEADER[HEADER.length - 1]) {
    // 列が少なかった頃のシートに見出しを足す
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
