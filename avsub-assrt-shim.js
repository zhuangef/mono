// avsub-assrt-shim.js v2.2 — LOON http-response 脚本
// 作用：SenPlayer 搜字幕走 api.assrt.net，但 assrt 库里基本没有日本 AV 番号字幕。
// 本脚本在 LOON MITM 解密后拦截 assrt 的搜索/详情响应：
//   · 搜索关键词含番号（如 ABP-447）时，改查迅雷字幕接口（实测可用、无鉴权、
//     返回 .srt/.ass 直链），把结果伪装成 assrt 的搜索 JSON 返回给 SenPlayer；
//   · SenPlayer 随后请求 /v1/sub/detail?id=<伪造 id> 时，返回伪造详情，
//     文件直链指向迅雷的 .srt/.ass 地址，由 SenPlayer 直接下载加载。
//   · 非番号关键词一律放行，不影响正常电影/剧集的字幕搜索。
//   · 任何一步失败都放行原始响应，绝不破坏原有功能。
//
// v2.0 修复（2026-11-21 实测故障：搜索改写成功，但详情未被拦截，
// assrt 返回 {"errmsg":"subtitle not found","status":20900}，SenPlayer 报“字幕下载失败”）：
//   1. 改为单条规则匹配 /v1/sub/*（搜索+详情走同一条规则同一份脚本），
//      不再依赖两条规则共用同一脚本文件，排除“详情规则未生效 /
//      SCRIPT_URL 只替换了一处”的可能；
//   2. $persistentStore 双写：id→条目映射 + 最近一次搜索的完整列表；
//      详情按 id 查不到映射时，用“最近一次搜索 + 序号”兜底；
//      write 的返回值会打日志，写失败不再静默；
//   3. 全链路 console.log（LOON 脚本日志可查 [AVSub]）：搜索关键词、迅雷返回数、
//      映射保存结果、详情 id 与命中情况；
//   4. 迅雷结果按 URL 去重，避免列表出现同名重复条目。
//
// v2.1（2026-11-21，v2.0 复测仍报“字幕下载失败”，但搜索侧日志已证明
// 规则匹配与映射写入都正常：thunder total=12 matched=10，saved map=true last=true）：
//   5. 详情 filelist 的文件名按 assrt 真实形态加语言标记：<番号>.chs.srt / .chs.ass
//      （真实 assrt 文件名如 ....chs.ass / ....chs&eng.srt；v2.0 之前直接用迅雷原名
//      ABP-447.srt，不带语言标记，SenPlayer 很可能按语言标记选文件，
//      找不到带标记的文件就报下载失败）。
//
// v2.2（2026-11-21，根因找到）：SenPlayer 的搜索请求是 https，
// 但详情请求是明文 http://api.assrt.net/v1/sub/detail，而 .lplugin 规则只写了
// ^https://，所以详情从 v1.0 到 v2.1 从来没被拦截过（IDPC-001 复测：
// 详情仍直达 assrt 返回 20900 subtitle not found）。本次只改规则为
// ^https?://（http/https 都匹配），脚本逻辑本身与 scheme 无关，无需改动。
// 注意：点击字幕后的正确流程是两步——先有 detail 请求（被脚本拦截改写，
// 返回含迅雷直链的 filelist），SenPlayer 再去下载那个 .srt 直链；
// detail 请求本身不是错误，关键是它必须被拦截。
//
// 诊断方法：复测后在 LOON 脚本日志里找 Match URL 含 /v1/sub/detail 的那条记录，
//           看 detail 分支是否执行、mapKeys 与 hit 是什么；抓包里详情应出现
//           replace_response，随后应有对 subtitle.v.geilijiasu.com 的下载请求。
//
// 依赖：LOON 已安装并信任 CA、MITM hostname 含 api.assrt.net。
// 待验证点：SenPlayer 是否接受 filelist 里非 assrt.net 域名的直链（详情通了之后才到这一步）。

const FAKE_ID_BASE = 900000000; // 伪造 id 段，避开 assrt 真实 id（目前约 6 位数）
const MAP_KEY = 'avsub_map_v1';
const LAST_KEY = 'avsub_last_v1';
const THUNDER_API = 'https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=';

function log(msg) { try { console.log('[AVSub] ' + msg); } catch (e) {} }

function codeOf(s) {
  // 移植自 115 油猴脚本：支持 FC2-PPV-5003320 / ABP-12345 / SSNI-123
  const t = String(s || '').toUpperCase().replace(/[_\s]+/g, '-');
  const m = t.match(/(?:^|[^A-Z0-9])((?:[A-Z]{2,10}\d{0,2}-){0,2}[A-Z]{2,10}\d{0,2})-(\d{2,8})(?=$|[^A-Z0-9])/);
  if (m) return m[1] + '-' + m[2];
  const m2 = t.match(/(?:^|[^A-Z0-9])([A-Z]{2,10})(\d{3,8})(?=$|[^A-Z0-9])/);
  return m2 ? m2[1] + '-' + m2[2] : '';
}

function codeCompat(cc, code) {
  // 同一影片：完全相等，或一方是另一方的后缀（FC2-PPV-5003320 / PPV-5003320）
  if (!cc || !code) return false;
  if (cc === code) return true;
  const num = code.split('-').pop();
  if (num.length < 4) return false;
  return code.endsWith(cc) || cc.endsWith(code);
}

function loadMap() {
  try { return JSON.parse($persistentStore.read(MAP_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveMap(map) {
  try { return $persistentStore.write(JSON.stringify(map), MAP_KEY); } catch (e) { return false; }
}
function loadLast() {
  try { return JSON.parse($persistentStore.read(LAST_KEY) || 'null'); } catch (e) { return null; }
}
function saveLast(last) {
  try { return $persistentStore.write(JSON.stringify(last), LAST_KEY); } catch (e) { return false; }
}

function getParam(url, name) {
  const m = url.match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function assrtSearchBody(keyword, subs) {
  return JSON.stringify({
    sub: { action: 'search', keyword: keyword, result: 'succeed', subs: subs },
    status: 0
  });
}

function assrtDetailBody(item) {
  // 文件名按 assrt 真实形态加 .chs 语言标记（迅雷字幕 languages 为简体），
  // 如 ABP-447.chs.srt；SenPlayer 很可能按语言标记从 filelist 里选文件。
  const ext = /\.ass$/i.test(item.title) ? 'ass' : 'srt';
  const fileName = item.code + '.chs.' + ext;
  const sub = {
    id: item.id,
    subtype: /\.ass$/i.test(item.title) ? 'Ass(ass)' : 'Subrip(srt)',
    vote_score: 0,
    lang: { langlist: { langchs: true }, desc: '简' },
    videoname: item.title,
    upload_time: '2026-01-01 00:00:00',
    revision: 0,
    native_name: item.code,
    title: item.code,
    filename: item.title,
    url: item.url,
    size: 0,
    down_count: 0,
    view_count: 0,
    producer: { verifier: '', uploader: '', source: '迅雷字幕', producer: 'Thunder' },
    filelist: [{ url: item.url, f: fileName, s: '' }]
  };
  return JSON.stringify({ sub: { action: 'detail', result: 'succeed', subs: [sub] }, status: 0 });
}

function handleSearch() {
  const q = getParam($request.url, 'q');
  const code = codeOf(q);
  log('search q=' + q + ' code=' + (code || '(none)'));
  if (!code) { $done({}); return; } // 非番号，放行 assrt 原始响应
  const url = THUNDER_API + encodeURIComponent(code);
  $httpClient.get(url, function (err, resp, data) {
    try {
      if (err) throw err;
      const j = JSON.parse(data);
      if (j.code !== 0 || j.result !== 'ok' || !Array.isArray(j.data)) {
        log('search thunder bad response, passthrough');
        $done({}); return;
      }
      const seen = {};
      const cands = j.data.filter(function (x) {
        if (!x.url || !/^https:\/\//i.test(x.url)) return false;
        if (!codeCompat(codeOf(x.name || ''), code)) return false;
        if (seen[x.url]) return false; // 按 URL 去重
        seen[x.url] = true;
        return true;
      });
      log('search thunder total=' + j.data.length + ' matched=' + cands.length);
      if (!cands.length) { $done({}); return; } // 迅雷无准确匹配，放行
      const map = loadMap();
      const items = [];
      const subs = cands.slice(0, 8).map(function (x, i) {
        const id = FAKE_ID_BASE + 1 + i;
        const title = x.name || (code + '.srt');
        map[id] = { id: id, code: code, title: title, url: x.url };
        items.push({ title: title, url: x.url });
        return {
          id: id,
          subtype: /\.ass$/i.test(title) ? 'Ass(ass)' : 'Subrip(srt)',
          vote_score: 0,
          lang: { langlist: { langchs: true }, desc: '简' },
          videoname: title,
          upload_time: '2026-01-01 00:00:00',
          revision: 0,
          native_name: code
        };
      });
      const okMap = saveMap(map);
      const okLast = saveLast({ code: code, items: items });
      log('search saved map=' + okMap + ' last=' + okLast + ' subs=' + subs.length);
      $done({ body: assrtSearchBody(q, subs) });
    } catch (e) {
      log('search error: ' + (e && e.message ? e.message : e));
      $done({}); // 失败放行
    }
  });
}

function handleDetail() {
  const id = parseInt(getParam($request.url, 'id'), 10);
  log('detail id=' + id);
  if (!id || id < FAKE_ID_BASE) { $done({}); return; } // 真实 assrt id，放行
  const map = loadMap();
  let item = map[id];
  log('detail mapKeys=' + Object.keys(map).length + ' hit=' + !!item);
  if (!item) {
    // 兜底：用最近一次搜索的列表 + 序号取条目
    const last = loadLast();
    const idx = id - FAKE_ID_BASE - 1;
    if (last && Array.isArray(last.items) && last.items[idx]) {
      item = { id: id, code: last.code, title: last.items[idx].title, url: last.items[idx].url };
      log('detail fallback hit last.code=' + last.code + ' idx=' + idx);
    } else {
      log('detail MISS, passthrough (map empty and no usable last search)');
    }
  }
  if (!item || !item.url) { $done({}); return; }
  $done({ body: assrtDetailBody(item) });
}

(function main() {
  try {
    const url = $request.url || '';
    log('run url=' + url);
    if (/\/v1\/sub\/search/.test(url)) { handleSearch(); return; }
    if (/\/v1\/sub\/detail/.test(url)) { handleDetail(); return; }
    $done({});
  } catch (e) {
    log('main error: ' + (e && e.message ? e.message : e));
    $done({});
  }
})();
