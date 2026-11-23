// 字母圈 v2.0 (fixed, 2026-11-23) — 解锁VIP及金币视频
// 原作者 chmg2025 (2025-09-13) 的 zmq.js 已失效, 本版按现站结构修复, 逻辑与原版一致, 仅改动 URL 拼装与容错。
//
// 原理: 播放页 /index.php/vod/play/id/<id>/sid/<sid>/nid/<nid>.html 的整页 HTML 经
// encodeURIComponent + base64 编码后嵌在外层 <script> 的 atob("...") 里, 浏览器 load 时解码 document.write。
// 脚本拦截响应, 解码出内层 HTML, 从中取 data-id / data-pic / data-name,
// 按封面图 URL 拼出正片 m3u8, 再把付费墙区块 (div.play_video) 替换成自带 player_aaaa 配置
// (points:0 / trysee:0 / encrypt:0) 的 dplayer 播放器, 重新编码塞回 atob("...")。
//
// 失效原因: 原版按旧版封面图 https://<host>/video/<A>/<B>/vod.jpg 拼
// https://<host>/video/<A>/<B>/index.m3u8。现站封面图已改为
// https://<host>/videos/<YYYYMM>/<DD>/<hash>/cover.jpg (或 poster2.jpg),
// 正片在 https://<host>/movie/auto/<hash>.m3u8。旧正则匹配不到, U 为 null,
// 取 U[2] 抛 TypeError, $done 没机会执行, LOON 直接放行原页面, 表现为“脚本没生效”。
// (已在真实播放页 id=220369 上复现该抛错; 新规则经 13 部影片核对,
// 覆盖 efv1/efv2/efv3 三个 CDN host、202609 与 202611 两个月份、cover.jpg 与 poster2.jpg 两种文件名。)
//
// 改动:
// 1. 新规则: 从 data-pic 取 hash 目录名, 拼 https://<host>/movie/auto/<hash>.m3u8;
//    poster 直接用原封面图 URL。
// 2. 保留旧规则兜底: 仍按 /video/<A>/<B>/index.m3u8 拼 (老视频若还用旧 CDN 布局仍可播)。
// 3. 全程 try/catch, 任何一步失败都原样放行 ($done({})), 不再抛错中断;
//    console.log 打点, 可在 LOON 脚本日志里看到构造出的 m3u8 或放行原因。
// 4. 去掉原版混淆与未使用的 H 模板, 播放器模板与原版逐字一致 (仅 url/poster 两处不同)。
//
// 注意: CDN 对 .m3u8 做了机房 IP 拦截, 本机无法验证 m3u8 是否能播 (图片 200, m3u8 一律 403)。
// 站内正常播放走的正是同一条 URL、同一套请求头, iPad 上以实际播放为准。

(function () {
  var log = (typeof console !== 'undefined' && console.log)
    ? function (m) { console.log('[ZMQ] ' + m); }
    : function () {};
  function pass(reason) { log('pass: ' + reason); $done({}); }

  try {
    var body = $response.body;
    var m = body.match(/atob\(['"]([^'"]+)['"]\)/);
    if (!m) return pass('no atob payload');

    var inner;
    try {
      inner = decodeURIComponent(atob(m[1]));
    } catch (e) {
      return pass('atob decode failed');
    }

    var idM = inner.match(/data-id="(\d+)"/);
    var picM = inner.match(/data-pic="([^"]+)"/);
    if (!idM || !picM) return pass('no data-id/data-pic');
    var nameM = inner.match(/data-name="([^"]+)"/);

    var id = idM[1];
    var pic = picM[1];
    var name = nameM ? nameM[1] : '';
    var playUrl = null;
    var poster = pic;

    // 新版 CDN 布局: /videos/<YYYYMM>/<DD>/<hash>/cover.jpg (或 poster2.jpg)
    //           -> /movie/auto/<hash>.m3u8 (同 host, 同 hash)
    var nm = pic.match(/^https?:\/\/([^/]+)\/videos\/\d+\/\d+\/([0-9a-fA-F]+)\//);
    if (nm) {
      playUrl = 'https://' + nm[1] + '/movie/auto/' + nm[2] + '.m3u8';
    } else {
      // 旧版布局兜底: /video/<A>/<B>/vod.jpg -> /video/<A>/<B>/index.m3u8
      var om = pic.match(/^https?:\/\/([^/]+)\/video\/([^/]+)\/([^/]+)/);
      if (om) {
        playUrl = 'https://' + om[1] + '/video/' + om[2] + '/' + om[3] + '/index.m3u8';
        poster = 'https://' + om[1] + '/video/' + om[2] + '/' + om[3] + '/vod.jpg';
      }
    }
    if (!playUrl) return pass('pic url pattern unknown: ' + pic);

    var block = `<div class="container">                                <div class="dplayer">                                    <script type="text/javascript">var player_aaaa = {                                        "flag": "play",                                        "encrypt": 0,                                        "trysee": 0,                                        "points": 0,                                        "link": "/index.php/vod/play/id/${id}/sid/1/nid/1.html",                                        "link_next": "",                                        "link_pre": "",                                        "vod_data": {                                            "vod_name": "${name}",                                            "vod_actor": "",                                            "vod_director": "",                                            "vod_class": ""                                        },                                        "poster": "${poster}",                                        "user_id": 0,                                        "group_id": 1,                                        "ads_status": null,                                        "ads_vip": null,                                        "ads_group": "3",                                        "logo_status": null,                                        "logo_pic": "https://madouui.com/wp-content/uploads/2023/10/96d6f2e7e1f705a.png",                                        "logo_link": "https://www.zimuquan7.com",                                        "copyr_status": null,                                        "copyr_content": "字母圈",                                        "copyr_link": "www.zimuquan7.com",                                        "art_auto": null,                                        "theme_color": "#23ade5",                                        "pre_ads_status": null,                                        "pre_ads_mode": "0",                                        "pre_ads_time": "5",                                        "pre_ads_button": null,                                        "pre_ads_auth": "2",                                        "pre_ads_group": "3",                                        "pre_pic_img": "https://api.modelym.com/play/02.png",                                        "pre_pic_link": "https://madouui.com",                                        "pre_vod_url": "https://artplayer.org/assets/sample/test1.mp4",                                        "pre_vod_link": "https://madouui.com",                                        "pause_status": null,                                        "pause_pic": "https://api.modelym.com/play/01.png",                                        "pause_link": "https://madouui.com",                                        "url": "${playUrl}",                                        "url_next": "",                                        "from": "MaDouYM",                                        "server": "",                                        "note": "",                                        "id": ${id},                                        "sid": 1,                                        "nid": 1                                    }</script>                                    <script type="text/javascript" src="/static/js/playerconfig.js?t=20250708"></script>                                    <script type="text/javascript" src="/static/js/player.js?t=a20250708"></script>                                </div>                            </div>`;

    var out;
    if (inner.indexOf('class="play_video"') !== -1) {
      inner = inner.replace('</div><div class="play_scroll">', '');
      out = inner.replace(/<div\s+class=["']play_video["'][^>]*>(?:[\s\S]*?<\/div>){3}/i, block);
    } else {
      out = inner.replace(/<div\s+class=["']container["'][^>]*>(?:[\s\S]*?<\/div>){3}/i, block);
    }
    if (out === inner) return pass('play block not matched');

    var r = btoa(encodeURIComponent(out));
    log('unlock id=' + id + ' url=' + playUrl);
    $done({ body: body.replace(/atob\(['"]([^'"]+)['"]\)/, 'atob("' + r + '")') });
  } catch (e) {
    log('error: ' + (e && e.message));
    $done({});
  }
})();
