// ==UserScript==
// @name         2048-预览
// @version      1.8.45
// @namespace    https://sleazyfork.org/zh-CN/users/1461640-%E6%98%9F%E5%AE%BF%E8%80%81%E9%AD%94
// @author       星宿老魔
// @description  2048核基地·预览图片·自动签到·搜索过滤·关键词过滤·列表附件预览
// @include      *://hjd2048.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=https://bbs.djqot.com/
// @license      GPL-3.0
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @downloadURL https://update.sleazyfork.org/scripts/539571/2048-%E9%A2%84%E8%A7%88.user.js
// @updateURL https://update.sleazyfork.org/scripts/539571/2048-%E9%A2%84%E8%A7%88.meta.js
// ==/UserScript==

!function() {
    "use strict";
    class Storage {
        static get(key, defaultValue = null) {
            try {
                const value = GM_getValue(key);
                if (null == value) return defaultValue;
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            } catch (error) {
                return defaultValue;
            }
        }
        static set(key, value) {
            try {
                const jsonValue = JSON.stringify(value);
                return GM_setValue(key, jsonValue), !0;
            } catch (error) {
                return !1;
            }
        }
        static delete(key) {
            try {
                return GM_deleteValue(key), !0;
            } catch (error) {
                return !1;
            }
        }
        static listKeys() {
            try {
                return GM_listValues();
            } catch (error) {
                return [];
            }
        }
        static migrateFromLocalStorage(key, deleteAfterMigration = !0) {
            try {
                const localValue = localStorage.getItem(key);
                if (null !== localValue) {
                    try {
                        const parsed = JSON.parse(localValue);
                        this.set(key, parsed);
                    } catch {
                        GM_setValue(key, localValue);
                    }
                    return deleteAfterMigration && localStorage.removeItem(key), !0;
                }
                return !1;
            } catch (error) {
                return !1;
            }
        }
    }
    const CONFIG = {
        PREVIEW_IMAGE_HEIGHT: 300,
        PREVIEW_COUNT: 4,
        getPreviewCount() {
            return this.PREVIEW_COUNT;
        },
        getExcludedForums() {
            try {
                return Storage.get("EXCLUDED_FORUMS", []) ?? [];
            } catch (error) {
                return [];
            }
        },
        setExcludedForums(forums) {
            try {
                Storage.set("EXCLUDED_FORUMS", forums);
            } catch (error) {}
        },
        getHideThumb() {
            try {
                return Storage.get("HIDE_THUMB", !0) ?? !0;
            } catch (error) {
                return !0;
            }
        },
        setHideThumb(hide) {
            try {
                Storage.set("HIDE_THUMB", hide);
            } catch (error) {}
        },
        selectors: {
            threadRows: "tr.tr3.t_one",
            threadLinks: 'a[target="_self"], a[target="_blank"]',
            contentSelectors: [ "#read_tpc", ".tpc_content", ".f14.cc", 'div[id="read_tpc"]', ".t_f" ],
            searchLink: '#nav-pc a[href="/search.php"]',
            navSearch: "#nav-s",
            searchResultTable: ".t table",
            searchResultRows: 'tr[id^="search_"]',
            searchResultHeader: ".t table .h",
            previewRows: "tr.imagePreviewTr",
            imgSelectors: [ "#read_tpc img", ".tpc_content img", ".f14.cc img", 'div[id="read_tpc"] img' ],
            magnetTextarea: "textarea[readonly], textarea#copytext",
            magnetLink: 'a[href^="magnet:?xt=urn:btih:"]',
            ed2kLink: 'a[href^="ed2k://"]',
            btLink: 'a[href*="bt.ivcbt.com/list.php?name="], a[href*="bt.bxmho.cn/list.php?name="]'
        },
        regex: {
            threadUrl: /read\.php\?tid=/,
            searchUrl: /search\.php/,
            searchRowId: /^search_(\d+)_(\d+)$/,
            magnetHash: /([A-F0-9]{40})/i,
            thunder: /thunder:\/\/[A-Za-z0-9+\/=]+/i,
            ed2k: /ed2k:\/\/\|file\|[^|]+\|\d+\|[A-F0-9]{32}\|\//i,
            magnetLink: /magnet:\?xt=urn:btih:[a-zA-Z0-9]+/,
            copyText: /magnet:\?xt=urn:btih:/
        },
        btSites: [ {
            name: "bxmho",
            pattern: /(?:\/\/bt\.bxmho\.cn\/list\.php\?name=|userscript\.html\?name=)([0-9a-z]+)/i,
            url: "https://bt.bxmho.cn/list.php",
            method: "GET",
            getHash: match => {
                const hashMatch = match.match(/([0-9a-z]+)$/i);
                return hashMatch ? hashMatch[1] : "";
            }
        }, {
            name: "82bt",
            pattern: /\/\/www\.82bt\.com\/(?:cao\.php|dlink\.php)\?hash=([0-9a-z]+)/i,
            url: "https://www.82bt.com/downt-m.php",
            method: "POST",
            paramName: "code",
            referer: "https://www.82bt.com",
            getHash: match => {
                const hashMatch = match.match(/hash=([0-9a-z]+)/i);
                return hashMatch ? hashMatch[1] : "";
            }
        } ]
    }, Utils = {
        copyToClipboard(text, event) {
            navigator.clipboard.writeText(text).then(() => {
                this.showClickTip("已复制", event);
            }).catch(() => {
                this.fallbackCopyTextToClipboard(text, event);
            });
        },
        fallbackCopyTextToClipboard(text, event) {
            const textArea = document.createElement("textarea");
            textArea.value = text, textArea.style.position = "fixed", textArea.style.top = "-1000px", 
            textArea.style.left = "-1000px", document.body.appendChild(textArea), textArea.focus(), 
            textArea.select();
            try {
                document.execCommand("copy"), this.showClickTip("已复制", event);
            } catch (err) {
                this.showClickTip("复制失败", event);
            }
            document.body.removeChild(textArea);
        },
        showClickTip(text, event) {
            const e = event;
            let tip = document.querySelector(".click-tip");
            tip && tip.remove(), tip = document.createElement("div"), tip.className = "click-tip", 
            tip.textContent = text, document.body.appendChild(tip), tip.style.left = `${e.clientX}px`, 
            tip.style.top = `${e.clientY}px`, setTimeout(() => {
                tip.style.opacity = "1";
            }, 10), setTimeout(() => {
                tip.style.opacity = "0", setTimeout(() => {
                    tip.parentElement && tip.remove();
                }, 200);
            }, 1e3);
        },
        isContentPage: () => CONFIG.regex.threadUrl.test(window.location.href),
        isSearchPage: () => CONFIG.regex.searchUrl.test(window.location.href) && null !== document.querySelector(CONFIG.selectors.searchResultTable),
        getBaseUrl() {
            const {protocol: protocol, hostname: hostname, port: port, pathname: pathname} = window.location, portStr = port ? `:${port}` : "";
            return pathname.startsWith("/2048/") || "/2048" === pathname ? `${protocol}//${hostname}${portStr}/2048` : `${protocol}//${hostname}${portStr}`;
        },
        safeQuerySelector(selector, context = document) {
            try {
                return context.querySelector(selector);
            } catch (error) {
                return null;
            }
        },
        safeQuerySelectorAll(selector, context = document) {
            try {
                return Array.from(context.querySelectorAll(selector));
            } catch (error) {
                return [];
            }
        }
    }, _ForumData = class {
        static getForumById(id) {
            return this.FORUM_SECTIONS.find(forum => forum.id === id);
        }
        static getChildForums(parentId) {
            return this.FORUM_SECTIONS.filter(forum => forum.parent === parentId);
        }
        static getMainCategories() {
            return this.FORUM_SECTIONS.filter(forum => 2 === forum.level && "1" === forum.parent);
        }
        static getDisplayName(forum) {
            return `${"　".repeat(Math.max(0, forum.level - 2))}${forum.name}`;
        }
        static getForumTree() {
            const result = [];
            return this.getMainCategories().forEach(category => {
                result.push(category);
                this.getChildForums(category.id).forEach(subCategory => {
                    result.push(subCategory);
                    this.getChildForums(subCategory.id).forEach(subSubCategory => {
                        result.push(subSubCategory);
                        const subSubSubCategories = this.getChildForums(subSubCategory.id);
                        result.push(...subSubSubCategories);
                    });
                });
            }), result;
        }
    };
    _ForumData.FORUM_SECTIONS = [ {
        id: "all",
        name: "全部版块分类",
        level: 0
    }, {
        id: "1",
        name: "总板块",
        level: 1
    }, {
        id: "2",
        name: "新片速递",
        level: 2,
        parent: "1"
    }, {
        id: "3",
        name: "最新合集",
        level: 3,
        parent: "2"
    }, {
        id: "4",
        name: "亞洲無碼",
        level: 3,
        parent: "2"
    }, {
        id: "5",
        name: "日本騎兵",
        level: 3,
        parent: "2"
    }, {
        id: "13",
        name: "歐美新片",
        level: 3,
        parent: "2"
    }, {
        id: "15",
        name: "國內原創",
        level: 3,
        parent: "2"
    }, {
        id: "16",
        name: "中字原創",
        level: 3,
        parent: "2"
    }, {
        id: "18",
        name: "三級寫真",
        level: 3,
        parent: "2"
    }, {
        id: "343",
        name: "实时ＢＴ",
        level: 3,
        parent: "2"
    }, {
        id: "326",
        name: "本站高清影院",
        level: 3,
        parent: "2"
    }, {
        id: "7",
        name: "图片专区",
        level: 2,
        parent: "1"
    }, {
        id: "23",
        name: "網友自拍",
        level: 3,
        parent: "7"
    }, {
        id: "24",
        name: "亞洲激情",
        level: 3,
        parent: "7"
    }, {
        id: "25",
        name: "歐美激情",
        level: 3,
        parent: "7"
    }, {
        id: "26",
        name: "熟女专图",
        level: 3,
        parent: "7"
    }, {
        id: "27",
        name: "高跟絲襪",
        level: 3,
        parent: "7"
    }, {
        id: "28",
        name: "卡通漫畫",
        level: 3,
        parent: "7"
    }, {
        id: "345",
        name: "图你所图",
        level: 3,
        parent: "7"
    }, {
        id: "135",
        name: "原創达人",
        level: 3,
        parent: "7"
    }, {
        id: "273",
        name: "美图秀秀",
        level: 2,
        parent: "1"
    }, {
        id: "21",
        name: "唯美清純",
        level: 3,
        parent: "273"
    }, {
        id: "275",
        name: "亞洲正妹",
        level: 3,
        parent: "273"
    }, {
        id: "276",
        name: "素人正妹",
        level: 3,
        parent: "273"
    }, {
        id: "277",
        name: "角色扮演",
        level: 3,
        parent: "273"
    }, {
        id: "278",
        name: "A I 智能",
        level: 3,
        parent: "273"
    }, {
        id: "320",
        name: "优质图片",
        level: 3,
        parent: "273"
    }, {
        id: "333",
        name: "明星合成",
        level: 3,
        parent: "273"
    }, {
        id: "359",
        name: "A V 情報",
        level: 3,
        parent: "273"
    }, {
        id: "29",
        name: "动态图片",
        level: 3,
        parent: "273"
    }, {
        id: "92",
        name: "精品收录",
        level: 2,
        parent: "1"
    }, {
        id: "295",
        name: "原创首发",
        level: 3,
        parent: "92"
    }, {
        id: "94",
        name: "稀有首發",
        level: 3,
        parent: "92"
    }, {
        id: "329",
        name: "藏精阁 — 2017-2024",
        level: 4,
        parent: "94"
    }, {
        id: "283",
        name: "网络见闻",
        level: 3,
        parent: "92"
    }, {
        id: "111",
        name: "主播實錄",
        level: 3,
        parent: "92"
    }, {
        id: "99",
        name: "國產主播",
        level: 4,
        parent: "111"
    }, {
        id: "324",
        name: "自购主播区",
        level: 4,
        parent: "111"
    }, {
        id: "323",
        name: "国产主播2区",
        level: 4,
        parent: "111"
    }, {
        id: "322",
        name: "国产主播3区",
        level: 4,
        parent: "111"
    }, {
        id: "131",
        name: "名站同步",
        level: 3,
        parent: "92"
    }, {
        id: "314",
        name: "真实街拍",
        level: 3,
        parent: "92"
    }, {
        id: "341",
        name: "原档115",
        level: 3,
        parent: "92"
    }, {
        id: "351",
        name: "訂閱精品",
        level: 4,
        parent: "341"
    }, {
        id: "355",
        name: "綜合資源",
        level: 4,
        parent: "341"
    }, {
        id: "353",
        name: "直播精品",
        level: 4,
        parent: "341"
    }, {
        id: "213",
        name: "国产主播同步",
        level: 4,
        parent: "341"
    }, {
        id: "290",
        name: "日本4K超清",
        level: 4,
        parent: "341"
    }, {
        id: "342",
        name: "VR視頻2023-2025",
        level: 4,
        parent: "341"
    }, {
        id: "352",
        name: "MGS素人 / DMM素人",
        level: 4,
        parent: "341"
    }, {
        id: "354",
        name: "GIGA / ZEN 特攝女英雄",
        level: 4,
        parent: "341"
    }, {
        id: "304",
        name: "外掛字幕",
        level: 4,
        parent: "341"
    }, {
        id: "306",
        name: "FC2視頻",
        level: 4,
        parent: "341"
    }, {
        id: "302",
        name: "AI視界",
        level: 4,
        parent: "341"
    }, {
        id: "303",
        name: "高清有碼",
        level: 4,
        parent: "341"
    }, {
        id: "307",
        name: "S-cute / Mywife",
        level: 4,
        parent: "341"
    }, {
        id: "305",
        name: "亞洲SM",
        level: 4,
        parent: "341"
    }, {
        id: "357",
        name: "速下速播",
        level: 3,
        parent: "92"
    }, {
        id: "358",
        name: "速下速播2区",
        level: 4,
        parent: "357"
    }, {
        id: "321",
        name: "补档申请",
        level: 3,
        parent: "92"
    }, {
        id: "75",
        name: "免空網盤",
        level: 2,
        parent: "1"
    }, {
        id: "72",
        name: "网盘二区",
        level: 3,
        parent: "75"
    }, {
        id: "272",
        name: "网盘三区",
        level: 3,
        parent: "75"
    }, {
        id: "195",
        name: "优质 B T",
        level: 3,
        parent: "75"
    }, {
        id: "280",
        name: "国产精选",
        level: 3,
        parent: "75"
    }, {
        id: "76",
        name: "多挂原创",
        level: 3,
        parent: "75"
    }, {
        id: "55",
        name: "有声小说",
        level: 3,
        parent: "75"
    }, {
        id: "180",
        name: "实用漫画",
        level: 3,
        parent: "75"
    }, {
        id: "113",
        name: "原档收藏",
        level: 3,
        parent: "75"
    }, {
        id: "116",
        name: "有碼.HD",
        level: 4,
        parent: "113"
    }, {
        id: "114",
        name: "亞洲SM.HD",
        level: 4,
        parent: "113"
    }, {
        id: "96",
        name: "日韓VR/3D",
        level: 4,
        parent: "113"
    }, {
        id: "119",
        name: "S-cute / Mywife / G-area",
        level: 4,
        parent: "113"
    }, {
        id: "41",
        name: "綜合資源",
        level: 2,
        parent: "1"
    }, {
        id: "43",
        name: "E D 2 K",
        level: 3,
        parent: "41"
    }, {
        id: "315",
        name: "原档字幕",
        level: 3,
        parent: "41"
    }, {
        id: "318",
        name: "磁链迅雷",
        level: 3,
        parent: "41"
    }, {
        id: "316",
        name: "包罗万象",
        level: 3,
        parent: "41"
    }, {
        id: "372",
        name: "合集岛",
        level: 4,
        parent: "316"
    }, {
        id: "271",
        name: "聚合1区",
        level: 4,
        parent: "316"
    }, {
        id: "281",
        name: "聚合2区",
        level: 4,
        parent: "316"
    }, {
        id: "284",
        name: "聚合3区",
        level: 4,
        parent: "316"
    }, {
        id: "313",
        name: "远古资源",
        level: 4,
        parent: "316"
    }, {
        id: "319",
        name: "聚合5区",
        level: 4,
        parent: "316"
    }, {
        id: "325",
        name: "聚合6区 WK",
        level: 4,
        parent: "316"
    }, {
        id: "327",
        name: "聚合7区",
        level: 4,
        parent: "316"
    }, {
        id: "332",
        name: "司机社",
        level: 4,
        parent: "316"
    }, {
        id: "335",
        name: "套图学院",
        level: 4,
        parent: "316"
    }, {
        id: "334",
        name: "游戏下载",
        level: 4,
        parent: "316"
    }, {
        id: "340",
        name: "韩国主播",
        level: 4,
        parent: "316"
    }, {
        id: "344",
        name: "美足踩踏",
        level: 4,
        parent: "316"
    }, {
        id: "346",
        name: "套图百晓生",
        level: 4,
        parent: "316"
    }, {
        id: "364",
        name: "绳艺捆绑",
        level: 4,
        parent: "316"
    }, {
        id: "376",
        name: "热舞集合",
        level: 4,
        parent: "316"
    }, {
        id: "348",
        name: "街拍精品",
        level: 4,
        parent: "316"
    }, {
        id: "356",
        name: "调侃一下",
        level: 4,
        parent: "316"
    }, {
        id: "368",
        name: "街拍爱好者",
        level: 4,
        parent: "316"
    }, {
        id: "67",
        name: "正片大片",
        level: 3,
        parent: "41"
    }, {
        id: "66",
        name: "H-GAME",
        level: 3,
        parent: "41"
    }, {
        id: "291",
        name: "快播影院",
        level: 3,
        parent: "41"
    }, {
        id: "293",
        name: "快播1号",
        level: 4,
        parent: "291"
    }, {
        id: "294",
        name: "快播2号",
        level: 4,
        parent: "291"
    }, {
        id: "296",
        name: "快播3号",
        level: 4,
        parent: "291"
    }, {
        id: "299",
        name: "快播4号",
        level: 4,
        parent: "291"
    }, {
        id: "300",
        name: "快播5号",
        level: 4,
        parent: "291"
    }, {
        id: "301",
        name: "快播6号",
        level: 4,
        parent: "291"
    }, {
        id: "308",
        name: "快播7号",
        level: 4,
        parent: "291"
    }, {
        id: "309",
        name: "快播频道",
        level: 4,
        parent: "291"
    }, {
        id: "311",
        name: "快播10号",
        level: 4,
        parent: "291"
    }, {
        id: "312",
        name: "快播11号",
        level: 4,
        parent: "291"
    }, {
        id: "331",
        name: "本站破解资源",
        level: 3,
        parent: "41"
    }, {
        id: "102",
        name: "文学欣赏",
        level: 2,
        parent: "1"
    }, {
        id: "328",
        name: "在线速听",
        level: 3,
        parent: "102"
    }, {
        id: "48",
        name: "综合小说",
        level: 3,
        parent: "102"
    }, {
        id: "49",
        name: "激情都市",
        level: 4,
        parent: "48"
    }, {
        id: "51",
        name: "青春校园",
        level: 4,
        parent: "48"
    }, {
        id: "52",
        name: "武侠虚幻",
        level: 4,
        parent: "48"
    }, {
        id: "105",
        name: "另类其他",
        level: 4,
        parent: "48"
    }, {
        id: "103",
        name: "人妻意淫",
        level: 3,
        parent: "102"
    }, {
        id: "50",
        name: "乱伦迷情",
        level: 3,
        parent: "102"
    }, {
        id: "54",
        name: "长篇连载",
        level: 3,
        parent: "102"
    }, {
        id: "100",
        name: "文学作者",
        level: 3,
        parent: "102"
    }, {
        id: "109",
        name: "TXT小说打包",
        level: 3,
        parent: "102"
    }, {
        id: "297",
        name: "2025大集合",
        level: 4,
        parent: "109"
    }, {
        id: "110",
        name: "TXT小说綜合一区",
        level: 4,
        parent: "109"
    }, {
        id: "189",
        name: "TXT小说綜合二区",
        level: 4,
        parent: "109"
    }, {
        id: "362",
        name: "2008-2015存档",
        level: 4,
        parent: "109"
    }, {
        id: "363",
        name: "2016-2018存档",
        level: 4,
        parent: "109"
    }, {
        id: "365",
        name: "2019-2020存档",
        level: 4,
        parent: "109"
    }, {
        id: "366",
        name: "2021存档",
        level: 4,
        parent: "109"
    }, {
        id: "367",
        name: "2022存档",
        level: 4,
        parent: "109"
    }, {
        id: "369",
        name: "2023存档",
        level: 4,
        parent: "109"
    }, {
        id: "373",
        name: "网络TXT资源",
        level: 4,
        parent: "109"
    }, {
        id: "370",
        name: "好书天天看",
        level: 4,
        parent: "109"
    }, {
        id: "371",
        name: "精品电子书",
        level: 4,
        parent: "109"
    }, {
        id: "375",
        name: "综合游戏",
        level: 4,
        parent: "109"
    }, {
        id: "374",
        name: "漫画天地",
        level: 4,
        parent: "109"
    }, {
        id: "193",
        name: "同人小说",
        level: 4,
        parent: "109"
    }, {
        id: "336",
        name: "耽美小说",
        level: 4,
        parent: "109"
    }, {
        id: "192",
        name: "言情小说",
        level: 4,
        parent: "109"
    }, {
        id: "338",
        name: "常规小说",
        level: 4,
        parent: "109"
    }, {
        id: "190",
        name: "都市校园",
        level: 4,
        parent: "109"
    }, {
        id: "191",
        name: "武侠小说",
        level: 4,
        parent: "109"
    }, {
        id: "360",
        name: "有声下载",
        level: 4,
        parent: "109"
    }, {
        id: "93",
        name: "TXT小说網盤區",
        level: 4,
        parent: "109"
    }, {
        id: "56",
        name: "网友互动",
        level: 2,
        parent: "1"
    }, {
        id: "57",
        name: "聚友客栈",
        level: 3,
        parent: "56"
    }, {
        id: "61",
        name: "求片专版",
        level: 3,
        parent: "56"
    }, {
        id: "206",
        name: "重金求片区（米粒悬赏）限侠客以上",
        level: 4,
        parent: "61"
    }, {
        id: "218",
        name: "成人信息",
        level: 3,
        parent: "56"
    }, {
        id: "220",
        name: "北京性息",
        level: 4,
        parent: "218"
    }, {
        id: "221",
        name: "天津性息",
        level: 4,
        parent: "218"
    }, {
        id: "222",
        name: "石家庄性息",
        level: 4,
        parent: "218"
    }, {
        id: "227",
        name: "郑州性息",
        level: 4,
        parent: "218"
    }, {
        id: "228",
        name: "青岛性息",
        level: 4,
        parent: "218"
    }, {
        id: "229",
        name: "济南性息",
        level: 4,
        parent: "218"
    }, {
        id: "230",
        name: "哈尔滨性息",
        level: 4,
        parent: "218"
    }, {
        id: "231",
        name: "沈阳性息",
        level: 4,
        parent: "218"
    }, {
        id: "232",
        name: "大连性息",
        level: 4,
        parent: "218"
    }, {
        id: "233",
        name: "长春性息",
        level: 4,
        parent: "218"
    }, {
        id: "234",
        name: "兰州性息",
        level: 4,
        parent: "218"
    }, {
        id: "237",
        name: "上海性息",
        level: 4,
        parent: "218"
    }, {
        id: "238",
        name: "广州性息",
        level: 4,
        parent: "218"
    }, {
        id: "239",
        name: "深圳性息",
        level: 4,
        parent: "218"
    }, {
        id: "240",
        name: "杭州性息",
        level: 4,
        parent: "218"
    }, {
        id: "241",
        name: "南京性息",
        level: 4,
        parent: "218"
    }, {
        id: "242",
        name: "合肥性息",
        level: 4,
        parent: "218"
    }, {
        id: "243",
        name: "武汉性息",
        level: 4,
        parent: "218"
    }, {
        id: "245",
        name: "长沙性息",
        level: 4,
        parent: "218"
    }, {
        id: "246",
        name: "宁波性息",
        level: 4,
        parent: "218"
    }, {
        id: "247",
        name: "厦门性息",
        level: 4,
        parent: "218"
    }, {
        id: "248",
        name: "苏州性息",
        level: 4,
        parent: "218"
    }, {
        id: "251",
        name: "重庆性息",
        level: 4,
        parent: "218"
    }, {
        id: "252",
        name: "成都性息",
        level: 4,
        parent: "218"
    }, {
        id: "253",
        name: "贵阳性息",
        level: 4,
        parent: "218"
    }, {
        id: "254",
        name: "昆明性息",
        level: 4,
        parent: "218"
    }, {
        id: "256",
        name: "东北三省",
        level: 4,
        parent: "218"
    }, {
        id: "257",
        name: "河北-河南",
        level: 4,
        parent: "218"
    }, {
        id: "258",
        name: "山东-山西",
        level: 4,
        parent: "218"
    }, {
        id: "259",
        name: "内蒙古",
        level: 4,
        parent: "218"
    }, {
        id: "260",
        name: "广东-广西",
        level: 4,
        parent: "218"
    }, {
        id: "261",
        name: "浙江",
        level: 4,
        parent: "218"
    }, {
        id: "263",
        name: "湖南-湖北",
        level: 4,
        parent: "218"
    }, {
        id: "264",
        name: "江苏-安徽",
        level: 4,
        parent: "218"
    }, {
        id: "265",
        name: "川渝",
        level: 4,
        parent: "218"
    }, {
        id: "266",
        name: "陕甘宁",
        level: 4,
        parent: "218"
    }, {
        id: "267",
        name: "云南-贵州",
        level: 4,
        parent: "218"
    }, {
        id: "268",
        name: "新疆-青海-西藏",
        level: 4,
        parent: "218"
    }, {
        id: "269",
        name: "海南-港澳台-海外",
        level: 4,
        parent: "218"
    }, {
        id: "287",
        name: "赚米专区",
        level: 3,
        parent: "56"
    }, {
        id: "136",
        name: "坛友自售",
        level: 3,
        parent: "56"
    }, {
        id: "289",
        name: "破解软件",
        level: 3,
        parent: "56"
    }, {
        id: "339",
        name: "包养情报",
        level: 3,
        parent: "56"
    }, {
        id: "128",
        name: "问题建议/举报申诉",
        level: 3,
        parent: "56"
    }, {
        id: "292",
        name: "解禁忏悔区/丢失找回",
        level: 4,
        parent: "128"
    } ];
    let ForumData = _ForumData;
    const _ModernSettingsPanel = class {
        static init() {
            this.initialized || (this.addSimpleButtons(), this.initialized = !0);
        }
        static addSimpleButtons() {
            const filterPanel = this.createSearchFilterPanel(), advancedLink = document.querySelector(".advanced-link");
            if (advancedLink && advancedLink.parentNode) {
                const filterBtn = document.createElement("a");
                return filterBtn.href = "javascript:;", filterBtn.innerHTML = '<span style="margin-right:4px;">⚙</span>搜索过滤', 
                filterBtn.style.cssText = "\n        display: inline-flex;\n        align-items: center;\n        margin-left: 12px;\n        padding: 0 16px;\n        height: 32px;\n        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);\n        color: #ffffff;\n        border: none;\n        border-radius: 6px;\n        cursor: pointer;\n        text-decoration: none;\n        font-size: 14px;\n        font-weight: 600;\n        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);\n        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n      ", 
                filterBtn.addEventListener("mouseenter", () => {
                    filterBtn.style.transform = "translateY(-1px)", filterBtn.style.boxShadow = "0 4px 6px rgba(59, 130, 246, 0.4)", 
                    filterBtn.style.background = "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)";
                }), filterBtn.addEventListener("mouseleave", () => {
                    filterBtn.style.transform = "translateY(0)", filterBtn.style.boxShadow = "0 2px 4px rgba(59, 130, 246, 0.3)", 
                    filterBtn.style.background = "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
                }), filterBtn.addEventListener("mousedown", () => {
                    filterBtn.style.transform = "translateY(1px)", filterBtn.style.boxShadow = "none";
                }), filterBtn.addEventListener("click", e => {
                    e.preventDefault(), filterPanel.show();
                }), void advancedLink.parentNode.insertBefore(filterBtn, advancedLink.nextSibling);
            }
            const navPc = document.getElementById("nav-pc");
            if (navPc) {
                const filterLi = document.createElement("li"), filterBtn = document.createElement("a");
                filterBtn.href = "javascript:;", filterBtn.innerHTML = '<span style="margin-right:4px;">⚙</span>搜索过滤', 
                filterBtn.style.cssText = "\n        display: inline-flex;\n        align-items: center;\n        padding: 0 12px;\n        margin-top: 4px;\n        height: 28px;\n        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);\n        color: #ffffff;\n        border-radius: 6px;\n        font-weight: 600;\n        text-decoration: none;\n        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);\n        transition: all 0.2s;\n      ", 
                filterBtn.addEventListener("mouseenter", () => {
                    filterBtn.style.background = "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)";
                }), filterBtn.addEventListener("mouseleave", () => {
                    filterBtn.style.background = "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
                }), filterLi.appendChild(filterBtn), navPc.appendChild(filterLi), filterBtn.addEventListener("click", e => {
                    e.preventDefault(), filterPanel.show();
                });
            }
        }
        static createSearchFilterPanel() {
            document.body.insertAdjacentHTML("beforeend", '\n      <dialog id="search-filter-panel" class="clean-search-panel script-container">\n        <header>\n          <span>搜索过滤设置</span>\n          <button id="search-close-settings-btn" class="close-x">×</button>\n        </header>\n        <main id="search-forum-list" class="clean-forum-tree"></main>\n        <footer>\n          <div class="filter-controls">\n            <button id="search-clear-all-filters" class="secondary">清除全部</button>\n            <button id="search-select-all-forums" class="secondary">全选</button>\n          </div>\n          <button id="search-save-settings-btn">保存设置</button>\n        </footer>\n      </dialog>\n      <div id="search-filter-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000;"></div>\n    ');
            const panel = document.getElementById("search-filter-panel"), overlay = document.getElementById("search-filter-overlay");
            return this.generateCleanSearchForumList(), this.loadSearchFilterSettings(), setTimeout(() => {
                overlay && this.setupSearchFilterEventListeners(panel, overlay);
            }, 50), {
                show: () => {
                    this.refreshSearchFilterSettings(), panel.style.display = "block", overlay.style.display = "block";
                }
            };
        }
        static generateCleanSearchForumList() {
            const container = document.getElementById("search-forum-list");
            if (!container) return;
            const forums = ForumData.getForumTree();
            forums.filter(f => 2 === f.level).forEach(mainForum => {
                const groupCard = document.createElement("div");
                groupCard.className = "clean-forum-card";
                const headerDiv = document.createElement("div");
                headerDiv.className = "clean-card-header";
                const mainCheckbox = document.createElement("input");
                mainCheckbox.type = "checkbox", mainCheckbox.id = `search-forum-${mainForum.id}`, 
                mainCheckbox.value = mainForum.id, mainCheckbox.className = "main-forum-checkbox";
                const titleSpan = document.createElement("span");
                titleSpan.className = "main-forum-title", titleSpan.textContent = mainForum.name, 
                headerDiv.appendChild(mainCheckbox), headerDiv.appendChild(titleSpan), groupCard.appendChild(headerDiv);
                const contentDiv = document.createElement("div");
                contentDiv.className = "clean-card-content", this.addCleanSubForums(forums, mainForum.id, contentDiv, mainForum.id), 
                groupCard.appendChild(contentDiv), container.appendChild(groupCard), mainCheckbox.addEventListener("change", () => {
                    this.handleSearchFilterParentToggle(mainForum.id, mainCheckbox.checked);
                });
            });
        }
        static addCleanSubForums(forums, parentId, container, rootParentId) {
            const subForums = forums.filter(f => f.parent === parentId && 3 === f.level);
            if (0 === subForums.length) return;
            if (subForums.some(subForum => forums.some(f => 4 === f.level && f.parent === subForum.id))) subForums.forEach(subForum => {
                const subSection = document.createElement("div");
                subSection.className = "clean-sub-section";
                const subHeader = document.createElement("div");
                subHeader.className = "clean-sub-header";
                const subCheckbox = document.createElement("input");
                subCheckbox.type = "checkbox", subCheckbox.id = `search-forum-${subForum.id}`, subCheckbox.value = subForum.id, 
                subCheckbox.className = "sub-forum-checkbox", subCheckbox.dataset.parent = rootParentId;
                const subTitle = document.createElement("span");
                subTitle.className = "sub-forum-title", subTitle.textContent = subForum.name, subHeader.appendChild(subCheckbox), 
                subHeader.appendChild(subTitle), subSection.appendChild(subHeader), subCheckbox.addEventListener("change", () => {
                    this.handleLevel3Toggle(subForum.id, subCheckbox.checked);
                });
                const level4Forums = forums.filter(f => 4 === f.level && f.parent === subForum.id);
                if (level4Forums.length > 0) {
                    const level4Grid = document.createElement("div");
                    level4Grid.className = "clean-level4-grid", level4Forums.forEach(level4Forum => {
                        const level4Item = document.createElement("label");
                        level4Item.className = "clean-level4-item";
                        const level4Checkbox = document.createElement("input");
                        level4Checkbox.type = "checkbox", level4Checkbox.id = `search-forum-${level4Forum.id}`, 
                        level4Checkbox.value = level4Forum.id, level4Checkbox.className = "level4-forum-checkbox", 
                        level4Checkbox.dataset.parent = rootParentId, level4Checkbox.dataset.level3Parent = subForum.id;
                        const level4Span = document.createElement("span");
                        level4Span.textContent = level4Forum.name, level4Item.appendChild(level4Checkbox), 
                        level4Item.appendChild(level4Span), level4Grid.appendChild(level4Item);
                    }), subSection.appendChild(level4Grid);
                }
                container.appendChild(subSection);
            }); else {
                const compactGrid = document.createElement("div");
                compactGrid.className = "clean-compact-grid", subForums.forEach(subForum => {
                    const compactItem = document.createElement("label");
                    compactItem.className = "clean-compact-item";
                    const compactCheckbox = document.createElement("input");
                    compactCheckbox.type = "checkbox", compactCheckbox.id = `search-forum-${subForum.id}`, 
                    compactCheckbox.value = subForum.id, compactCheckbox.className = "compact-forum-checkbox", 
                    compactCheckbox.dataset.parent = rootParentId;
                    const compactSpan = document.createElement("span");
                    compactSpan.textContent = subForum.name, compactItem.appendChild(compactCheckbox), 
                    compactItem.appendChild(compactSpan), compactGrid.appendChild(compactItem);
                }), container.appendChild(compactGrid);
            }
        }
        static loadSearchFilterSettings() {
            CONFIG.getExcludedForums().forEach(forumId => {
                const checkbox = document.getElementById(`search-forum-${forumId}`);
                checkbox && (checkbox.checked = !0);
            });
        }
        static refreshSearchFilterSettings() {
            document.querySelectorAll('.clean-search-panel input[type="checkbox"]').forEach(cb => cb.checked = !1), 
            this.loadSearchFilterSettings();
        }
        static setupSearchFilterEventListeners(panel, overlay) {
            const saveBtn = document.getElementById("search-save-settings-btn");
            saveBtn && saveBtn.addEventListener("click", () => this.saveSearchFilterSettings());
            const closePanel = () => {
                panel.style.display = "none", overlay.style.display = "none";
            }, closeBtn = document.getElementById("search-close-settings-btn");
            closeBtn && closeBtn.addEventListener("click", closePanel), overlay.addEventListener("click", closePanel);
            const clearBtn = document.getElementById("search-clear-all-filters"), selectBtn = document.getElementById("search-select-all-forums");
            clearBtn && clearBtn.addEventListener("click", () => this.clearAllSearchFilters()), 
            selectBtn && selectBtn.addEventListener("click", () => this.selectAllSearchForums());
        }
        static saveSearchFilterSettings() {
            const checkboxes = document.querySelectorAll('.clean-search-panel input[type="checkbox"]:checked'), excludedForums = Array.from(checkboxes).map(cb => cb.value);
            CONFIG.setExcludedForums(excludedForums), window.location.reload();
        }
        static handleSearchFilterParentToggle(parentId, checked) {
            document.querySelectorAll(`[data-parent="${parentId}"]`).forEach(checkbox => {
                checkbox.checked = checked;
            });
        }
        static handleLevel3Toggle(parentId, checked) {
            document.querySelectorAll(`[data-level3-parent="${parentId}"]`).forEach(checkbox => {
                checkbox.checked = checked;
            });
        }
        static clearAllSearchFilters() {
            document.querySelectorAll('.clean-search-panel input[type="checkbox"]').forEach(cb => cb.checked = !1);
        }
        static selectAllSearchForums() {
            document.querySelectorAll('.clean-search-panel input[type="checkbox"]').forEach(cb => cb.checked = !0);
        }
    };
    _ModernSettingsPanel.initialized = !1;
    let ModernSettingsPanel = _ModernSettingsPanel;
    const _UltraMinimalStyleManager = class {
        static injectStyles() {
            const existingStyle = document.getElementById(this.styleElementId);
            existingStyle && existingStyle.remove();
            const style = document.createElement("style");
            style.id = this.styleElementId, style.textContent = '.click-tip{position:fixed;background:rgba(0,0,0,0.8);color:#fff;padding:6px 12px;border-radius:4px;font-size:13px;z-index:10000}.thread-title-highlighted{background:#e8f4fd!important;border-radius:4px 4px 0 0}.preview-container{margin:0 0 10px 0;border:1px solid #dee2e6;border-top:none;border-radius:0 0 4px 4px;padding:16px;background:#f8f9fa}.preview-images{display:flex;gap:12px;margin-bottom:16px}.preview-image-wrapper{height:300px;flex:0 0 auto;border-radius:4px;cursor:pointer;overflow:hidden}.preview-image{width:100%;height:100%;object-fit:cover}.preview-magnet{font-size:13px;word-break:break-all;cursor:pointer;padding:10px 12px;background:#f0f9ff;border:1px solid #e0f2fe;border-radius:4px;margin-bottom:10px}.content-magnet-block{margin:12px 0 18px;padding:12px 16px;background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;box-shadow:0 1px 2px rgba(15,23,42,0.06)}.content-magnet-title{font-size:14px;font-weight:600;color:#1d4ed8;margin-bottom:6px}.content-magnet-text{font-size:13px;color:#0f172a;word-break:break-all;background:#fff;border:1px dashed #bfdbfe;border-radius:6px;padding:10px 12px;cursor:pointer;transition:background 0.2s}.content-magnet-text:hover{background:#dbeafe}.lightbox{position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;visibility:hidden}.lightbox.active{opacity:1;visibility:visible}.lightbox-image{border-radius:8px;display:block;object-fit:contain}.lightbox-prev,.lightbox-next,.lightbox-close{position:absolute;color:#fff;cursor:pointer;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center}.lightbox-prev,.lightbox-next{top:50%;transform:translateY(-50%);font-size:36px;width:60px;height:60px}.lightbox-close{top:20px;right:20px;font-size:24px;width:40px;height:40px}.lightbox-prev{left:20px}.lightbox-next{right:20px}.simple-toggle-btn{color:#007bff;text-decoration:none;font-size:13px;cursor:pointer}.simple-toggle-btn:hover{color:#0056b3;text-decoration:underline}.clean-search-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;background:#fff;border:1px solid #ddd;border-radius:8px;font-family:system-ui,sans-serif;width:750px;max-height:80vh;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.2)}.clean-search-panel header{position:relative;padding:16px 20px;border-bottom:1px solid #e5e7eb;background:#f8f9fa;border-radius:8px 8px 0 0;font-size:15px;font-weight:600;color:#374151}.clean-forum-tree{padding:20px;max-height:500px;overflow-y:auto}.clean-forum-card{margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff}.clean-forum-card:last-child{margin-bottom:0}.clean-card-header{padding:12px 16px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px}.main-forum-title{font-weight:600;font-size:14px;color:#1f2937;cursor:pointer}.main-forum-checkbox{margin:0;transform:scale(1.1)}.clean-card-content{padding:16px}.clean-sub-section{margin-bottom:16px;border-left:3px solid #e5e7eb;padding-left:12px}.clean-sub-section:last-child{margin-bottom:0}.clean-sub-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}.sub-forum-title{font-weight:500;font-size:13px;color:#4b5563;cursor:pointer}.sub-forum-checkbox{margin:0}.clean-level4-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-left:20px}.clean-level4-item{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#f9fafb;border:1px solid #f3f4f6;border-radius:6px;cursor:pointer;font-size:12px;color:#6b7280}.clean-level4-item:hover{background:#f3f4f6}.level4-forum-checkbox{margin:0;transform:scale(0.9)}.clean-compact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:12px}.clean-compact-item{display:flex;align-items:center;gap:6px;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-size:13px;color:#4b5563}.clean-compact-item:hover{background:#f9fafb}.compact-forum-checkbox{margin:0;transform:scale(1.05)}.filter-controls{display:flex;gap:10px}.clean-search-panel footer{padding:16px 20px;background:#f8f9fa;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;display:flex;justify-content:space-between;align-items:center}.clean-search-panel button{padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font-size:13px;font-weight:500}.clean-search-panel button.secondary{background:#f9fafb}.clean-search-panel #search-save-settings-btn{background:#3b82f6;border-color:#3b82f6;color:#fff}.flex{display:flex}.items-center{align-items:center}.justify-center{justify-content:center}.gap-2{gap:0.5rem}.mb-3{margin-bottom:0.75rem}.p-3{padding:0.75rem}.text-center{text-align:center}.cursor-pointer{cursor:pointer}.close-x{position:absolute;top:12px;right:16px;width:24px;height:24px;border:none;background:none;color:#999;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}.close-x:hover{color:#666}.search-img-group,.search-thumb-toggle .form-label-tip{display:none!important}/* Fixed Pagination Bar */.pages.fixed-top-pages{position:fixed!important;top:0;left:0;right:0;z-index:9997;background:#fff;border-bottom:1px solid #ddd;box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:8px 15px;width:100%;box-sizing:border-box}/* Placeholder for fixed pagination */.pages-placeholder{height:35px}/* Infinite Scroll Loader */.infinite-scroll-loader{text-align:center;padding:20px;color:#666;font-size:14px;clear:both;background:#f9f9f9;border-top:1px solid #eee;margin-top:10px}.loader-spinner{display:inline-block;width:20px;height:20px;border:2px solid #ddd;border-top:2px solid #0066cc;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:8px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}} /* Fix native search page pagination input */ .pagesone { display: inline-flex !important; align-items: center !important; vertical-align: middle !important; } .pagesone input { width: 40px !important; min-width: 40px !important; max-width: 40px !important; height: 22px !important; box-sizing: content-box !important; padding: 0 4px !important; margin: 0 4px !important; text-align: center !important; border: 1px solid #ccc !important; } .pagesone button { height: 26px !important; cursor: pointer !important; }/* TXT Preview Modal */.txt-preview-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:10000;display:none;justify-content:center;align-items:center;backdrop-filter:blur(2px);opacity:0;transition:opacity .2s}.txt-preview-overlay.active{opacity:1}.txt-preview-container{background:#fff;width:80%;max-width:800px;height:80%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;animation:txt-pop-in .2s ease-out}@keyframes txt-pop-in{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}.txt-preview-header{padding:12px 16px;background:#f5f5f5;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}.txt-preview-title{font-weight:700;color:#333;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.txt-preview-close{cursor:pointer;font-size:18px;color:#666;padding:0 8px}.txt-preview-close:hover{color:#d32f2f}.txt-preview-content{flex:1;overflow-y:auto;padding:16px;margin:0;background:#fff;font-family:Consolas,Monaco,"Courier New",monospace;font-size:13px;line-height:1.6;color:#333;white-space:pre-wrap;word-break:break-all}.txt-preview-line{padding:6px 8px;border-bottom:1px solid #f1f5f9;transition:background .2s}.txt-preview-line:hover{background:#f8fafc}.txt-preview-line:last-child{border-bottom:none}.txt-preview-link{color:#2563eb;text-decoration:none;font-weight:500;padding:4px 8px;border-radius:6px;background:#eff6ff;display:inline-block;margin:2px 0;border:1px solid #dbeafe;font-family:inherit}.txt-preview-link:hover{background:#dbeafe;text-decoration:underline;color:#1d4ed8}.txt-preview-link.ed2k{border-left:4px solid #2563eb}.txt-preview-link.magnet{color:#dc2626;border-left:4px solid #dc2626;background:#fef2f2;border-color:#fee2e2}.txt-preview-link.magnet:hover{background:#fee2e2;color:#b91c1c}.txt-preview-footer{padding:12px 16px;background:#f8f9fa;border-top:1px solid #e5e7eb;text-align:right;display:flex;justify-content:flex-end;gap:12px}.txt-preview-btn{padding:6px 16px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;transition:background .2s}.txt-preview-btn:hover{background:#1565c0}/* Attachment Preview Enhancement */.attach-previewable{border-left:3px solid #2196F3!important;transition:border-color .2s}.attach-previewable:hover{border-left-color:#1565c0!important}.attach-previewable .attach-name-link{cursor:pointer;color:#1976d2!important}.attach-preview-badge{display:inline-block;margin-left:8px;padding:1px 6px;background:#e3f2fd;color:#1976d2;border-radius:3px;font-size:11px;vertical-align:middle}', 
            document.head.appendChild(style);
        }
        static setImageGridWidth(container, count) {
            let imageWidth;
            if (1 === count) imageWidth = "50%"; else {
                imageWidth = `calc((100% - ${12 * (count - 1)}px) / ${count})`;
            }
            Array.from(container.children).forEach(child => {
                child.style.width = imageWidth, child.style.flex = "0 0 auto";
            });
        }
    };
    _UltraMinimalStyleManager.styleElementId = "ultra-minimal-styles";
    let UltraMinimalStyleManager = _UltraMinimalStyleManager;
    class AdRemover {
        static removeAds() {
            this.removeStickyPosts(), this.removeAdButtons(), this.removeNavGridAds();
        }
        static removeGlobalAds() {
            this.removeAdButtons(), this.removeSponsorAds(), this.removeNavGridAds();
        }
        static removeStickyPosts() {
            document.querySelectorAll(CONFIG.selectors.threadRows).forEach(tr => {
                const tdContent = tr.querySelector("td.tal");
                tdContent && tdContent.innerHTML.includes("headtopic_3.gif") && tr.remove();
            });
        }
        static removeAdButtons() {
            [ "td_ID144", "td_ID86", "td_ID139" ].forEach(id => {
                const adButton = document.getElementById(id);
                if (adButton) {
                    const parentLi = adButton.closest("li");
                    parentLi ? parentLi.remove() : adButton.remove();
                }
            });
        }
        static removeSponsorAds() {
            document.querySelectorAll(".recs-wrapper").forEach(ad => ad.remove());
        }
        static removeNavGridAds() {
            const adLinks = document.querySelectorAll('a[name="temp_ad_adcontrol"]'), adContainers = new Set;
            adLinks.forEach(link => {
                const navContainer = link.closest(".nav-container");
                navContainer && adContainers.add(navContainer);
                const navGrid = link.closest(".nav-grid");
                navGrid && adContainers.add(navGrid);
                const navItem = link.closest(".nav-item");
                navItem && adContainers.add(navItem);
            }), adContainers.forEach(container => {
                const textContent = container.textContent || "";
                (textContent.includes("赞助") || textContent.includes("广告") || container.querySelector('a[name="temp_ad_adcontrol"]')) && container.remove();
            }), adLinks.forEach(link => {
                document.contains(link) && link.remove();
            });
            document.querySelectorAll("style").forEach(styleTag => {
                const content = styleTag.textContent || "";
                content.includes(".nav-container") && content.includes("temp_ad_adcontrol") && styleTag.remove();
            });
        }
    }
    class DataExtractor {
        static extractImages(doc) {
            const MAX_PREVIEW_IMAGES = CONFIG.getPreviewCount();
            let imgElements = [];
            for (const selector of CONFIG.selectors.imgSelectors) if (imgElements = Array.from(doc.querySelectorAll(selector)), 
            imgElements.length > 0) break;
            let imgSrcsWithPriority = imgElements.filter(img => {
                const imgStyle = img.getAttribute("style") || "";
                return !imgStyle.includes("display: none") && !imgStyle.includes("display:none");
            }).map(img => ({
                src: img.getAttribute("data-original") || img.getAttribute("src") || "",
                img: img
            })).filter(item => !(!item.src || item.src.length < 4));
            imgSrcsWithPriority.sort((a, b) => {
                const aIsMain = /\.(jpg|jpeg|png)$/i.test(a.src), bIsMain = /\.(jpg|jpeg|png)$/i.test(b.src);
                return aIsMain && !bIsMain ? -1 : !aIsMain && bIsMain ? 1 : 0;
            });
            return imgSrcsWithPriority.map(item => item.src).slice(0, MAX_PREVIEW_IMAGES);
        }
        static isPaidContent(doc) {
            if (doc.querySelector('input[value*="购买"], a[href*="buythread"], a[href*="action=buy"]')) return !0;
            const pageText = doc.body.textContent || "";
            return !!(pageText.includes("本帖隐藏的内容需要付费") || pageText.includes("需付费购买后才可查看") || pageText.includes("购买精华帖"));
        }
        static extractMagnet(doc) {
            let magnetText = doc.querySelector(CONFIG.selectors.magnetTextarea);
            if (magnetText) {
                const val = magnetText.value.trim();
                if (val.startsWith("magnet:?xt=urn:btih:")) return val;
                const hashMatch = val.match(CONFIG.regex.magnetHash);
                if (hashMatch && hashMatch[1]) return `magnet:?xt=urn:btih:${hashMatch[1]}`;
            }
            let magnetA = doc.querySelector(CONFIG.selectors.magnetLink);
            if (magnetA) {
                const magnet = magnetA.getAttribute("href") || "";
                if (magnet) return magnet;
            }
            if (this.isPaidContent(doc)) return "";
            for (const selector of CONFIG.selectors.contentSelectors) {
                const contentEl = doc.querySelector(selector);
                if (contentEl) {
                    const hashMatch = contentEl.innerHTML.match(CONFIG.regex.magnetHash);
                    if (hashMatch && hashMatch[1]) return `magnet:?xt=urn:btih:${hashMatch[1]}`;
                }
            }
            return "";
        }
        static extractEd2k(doc) {
            let ed2k = "";
            const ed2kLink = doc.querySelector(CONFIG.selectors.ed2kLink);
            if (ed2kLink && (ed2k = ed2kLink.getAttribute("href") || "", ed2k)) return ed2k;
            if (this.isPaidContent(doc)) return "";
            for (const selector of CONFIG.selectors.contentSelectors) {
                const contentEl = doc.querySelector(selector);
                if (contentEl) {
                    const ed2kMatch = contentEl.innerHTML.match(CONFIG.regex.ed2k);
                    if (ed2kMatch && ed2kMatch[0]) return ed2kMatch[0];
                }
            }
            return ed2k;
        }
        static extractThunder(doc) {
            if (this.isPaidContent(doc)) return "";
            for (const selector of CONFIG.selectors.contentSelectors) {
                const contentEl = doc.querySelector(selector);
                if (contentEl) {
                    const thunderMatch = contentEl.innerHTML.match(CONFIG.regex.thunder);
                    if (thunderMatch && thunderMatch[0]) return thunderMatch[0];
                }
            }
            return "";
        }
        static extractAttachments(doc) {
            const attachments = [];
            doc.querySelectorAll('.attach-card, div[id^="att_"]').forEach(card => {
                const link = card.querySelector('a.attach-name-link, a[href*="job.php?action=download"]');
                if (!link) return;
                const nameSpan = link.querySelector("span"), filename = nameSpan?.textContent?.trim() || link.textContent?.trim() || "";
                if (!filename || !filename.toLowerCase().endsWith(".txt")) return;
                const href = link.getAttribute("href") || "";
                if (!href) return;
                const metaText = card.querySelector(".attach-meta")?.textContent || "";
                let price = "";
                const priceMatch = metaText.match(/(?:所需|售价)[：:]?\s*(\d+)\s*(米粒|金币|原创币)/);
                priceMatch && (price = `${priceMatch[1]} ${priceMatch[2]}`);
                const sizeMatch = metaText.match(/大小[：:]?\s*([^\s]+)/), size = sizeMatch ? sizeMatch[1] : "", aidMatch = href.match(/aid=(\d+)/), aid = aidMatch ? aidMatch[1] : "", hasCheckpan = !!card.querySelector('.checkpan-box, blockquote[id^="checkpan_"]');
                attachments.push({
                    name: filename,
                    url: href,
                    size: size,
                    price: price,
                    aid: aid,
                    hasCheckpan: hasCheckpan
                });
            });
            doc.querySelectorAll('ignore_js_op[id^="att_"]').forEach(op => {
                const link = op.querySelector('a[href*="job.php?action=download"]');
                if (!link) return;
                const filename = link.textContent?.trim() || "";
                if (!filename || !filename.toLowerCase().endsWith(".txt")) return;
                const href = link.getAttribute("href") || "";
                if (!href) return;
                const fullText = op.textContent || "";
                let price = "";
                const priceMatch = fullText.match(/(?:所需|售价)[：:]?\s*(\d+)\s*(米粒|金币|原创币)/);
                priceMatch && (price = `${priceMatch[1]} ${priceMatch[2]}`);
                const sizeMatch = fullText.match(/\(([^)]*K)\)/i), size = sizeMatch ? sizeMatch[1] : "", aidMatch = href.match(/aid=(\d+)/), aid = aidMatch ? aidMatch[1] : "", hasCheckpan = !!op.querySelector('.checkpan-box, blockquote[id^="checkpan_"]');
                attachments.push({
                    name: filename,
                    url: href,
                    size: size,
                    price: price,
                    aid: aid,
                    hasCheckpan: hasCheckpan
                });
            });
            doc.querySelectorAll(".sell_content").forEach(op => {
                const link = op.querySelector(".pay_button_a, .pay_button a");
                if (!link) return;
                const href = link.getAttribute("href") || "";
                if (!href) return;
                const priceTag = op.querySelector(".coin .label"), price = priceTag && priceTag.textContent?.trim() || "", tidMatch = href.match(/tid=(\d+)/), aid = tidMatch ? `topic_${tidMatch[1]}` : "";
                attachments.push({
                    name: "本帖隐藏资源 (需向作者购买)",
                    url: href,
                    size: "",
                    price: price,
                    aid: aid,
                    hasCheckpan: !1
                });
            });
            return doc.querySelectorAll("blockquote.blockquote").forEach((bq, index) => {
                if (bq.id && bq.id.startsWith("checkpan_")) return;
                const text = bq.textContent || "", containsKeywords = text.includes("提取码") || text.includes("密码") || text.includes("网盘分享") || text.includes("下载速度"), containsLink = null !== bq.querySelector("a");
                if ((containsKeywords || containsLink) && text.length < 800) {
                    const clone = bq.cloneNode(!0);
                    clone.querySelectorAll("a").forEach(a => {
                        a.textContent = ` ${a.textContent}(${a.href}) `;
                    }), clone.innerHTML = clone.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
                    const pureText = clone.textContent?.replace(/\n\s*\n/g, "\n").trim() || "";
                    if (!pureText) return;
                    const filename = "隐藏网盘资源(已解锁).txt", aid = `bq_${index}_${Date.now()}`, blob = new Blob([ pureText ], {
                        type: "text/plain;charset=utf-8"
                    }), href = URL.createObjectURL(blob);
                    attachments.push({
                        name: filename,
                        url: href,
                        size: "文本",
                        price: "",
                        aid: aid,
                        hasCheckpan: !1
                    });
                }
            }), attachments;
        }
    }
    class ExternalMagnetExtractor {
        static async extractFromPage(pageContent) {
            try {
                for (const site of CONFIG.btSites) {
                    const btMatch = pageContent.match(site.pattern);
                    if (btMatch) {
                        const hash = site.getHash(btMatch[0]), externalMagnet = await this.fetchFromBtSite(site, hash);
                        if (externalMagnet) {
                            return this.cleanMagnetLink(externalMagnet);
                        }
                    }
                }
                return null;
            } catch (error) {
                return null;
            }
        }
        static cleanMagnetLink(magnetLink) {
            const match = magnetLink.match(/magnet:\?xt=urn:btih:([a-f0-9]{40})/i);
            return match ? `magnet:?xt=urn:btih:${match[1]}` : magnetLink;
        }
        static async fetchFromBtSite(site, hash) {
            try {
                return new Promise(resolve => {
                    const requestConfig = {
                        method: site.method,
                        url: "GET" === site.method ? `${site.url}?name=${hash}` : site.url,
                        headers: {
                            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                            DNT: "1",
                            Connection: "keep-alive",
                            "Upgrade-Insecure-Requests": "1"
                        },
                        onload: response => {
                            if (response.status >= 200 && response.status < 300) try {
                                const doc = (new DOMParser).parseFromString(response.responseText, "text/html"), magnetInput = doc.querySelector("#magnetInput");
                                if (magnetInput) {
                                    const value = magnetInput.value || magnetInput.getAttribute("value");
                                    if (value) {
                                        const magnet = value.replace(/&amp;/g, "&");
                                        return void resolve(magnet);
                                    }
                                }
                                const magnetBox = doc.querySelector(".magnet-box input");
                                if (magnetBox) {
                                    const value = magnetBox.getAttribute("value") || magnetBox.value;
                                    if (value) {
                                        const magnet = value.replace(/&amp;/g, "&");
                                        return void resolve(magnet);
                                    }
                                }
                                const magnetMatch = response.responseText.match(/magnet:\?xt=urn:btih:[a-f0-9]{40}[^"'\s]*/i);
                                if (magnetMatch) {
                                    const magnet = magnetMatch[0].replace(/&amp;/g, "&");
                                    return void resolve(magnet);
                                }
                                resolve(null);
                            } catch (parseError) {
                                resolve(null);
                            } else resolve(null);
                        },
                        onerror: () => resolve(null),
                        ontimeout: () => resolve(null)
                    };
                    if ("POST" === site.method) {
                        requestConfig.headers["Content-Type"] = "application/x-www-form-urlencoded", requestConfig.headers.Referer = site.referer, 
                        requestConfig.headers.Origin = site.referer;
                        const paramData = {};
                        paramData[site.paramName] = hash, requestConfig.data = new URLSearchParams(paramData).toString();
                    }
                    GM_xmlhttpRequest(requestConfig);
                });
            } catch (e) {
                return null;
            }
        }
    }
    const _Lightbox = class {
        static init() {
            this.overlay || (this.overlay = document.createElement("div"), this.overlay.style.cssText = "\n      position: fixed;\n      top: 0;\n      left: 0;\n      width: 100%;\n      height: 100%;\n      background: rgba(0, 0, 0, 0.95);\n      z-index: 999999;\n      display: none;\n      align-items: center;\n      justify-content: center;\n    ", 
            this.img = document.createElement("img"), this.img.style.cssText = "\n      max-width: 70vw;\n      max-height: 90vh;\n      object-fit: contain;\n      border-radius: 4px;\n    ", 
            this.counter = document.createElement("div"), this.counter.style.cssText = "\n      position: absolute;\n      top: 20px;\n      left: 50%;\n      transform: translateX(-50%);\n      color: white;\n      background: rgba(0, 0, 0, 0.6);\n      padding: 8px 16px;\n      border-radius: 20px;\n      font-size: 14px;\n    ", 
            this.prevBtn = this.createNavButton("‹", "left"), this.nextBtn = this.createNavButton("›", "right"), 
            this.closeBtn = this.createCloseButton(), this.overlay.appendChild(this.img), this.overlay.appendChild(this.counter), 
            this.overlay.appendChild(this.prevBtn), this.overlay.appendChild(this.nextBtn), 
            this.overlay.appendChild(this.closeBtn), document.body.appendChild(this.overlay), 
            this.setupEvents());
        }
        static createNavButton(content, position) {
            const btn = document.createElement("button");
            return btn.innerHTML = "‹" === content ? '<svg viewBox="0 0 24 24" fill="white" width="40" height="40"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>' : '<svg viewBox="0 0 24 24" fill="white" width="40" height="40"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>', 
            btn.style.cssText = `\n      position: fixed;\n      ${position}: 20px;\n      top: 50%;\n      transform: translateY(-50%);\n      width: 60px;\n      height: 100px;\n      background: rgba(255, 255, 255, 0.1);\n      border: none;\n      border-radius: 8px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      cursor: pointer;\n      user-select: none;\n      z-index: 10002;\n    `, 
            btn.onmouseover = () => {
                btn.style.background = "rgba(255, 255, 255, 0.2)";
            }, btn.onmouseout = () => {
                btn.style.background = "rgba(255, 255, 255, 0.1)";
            }, btn;
        }
        static createCloseButton() {
            const btn = document.createElement("button");
            return btn.innerHTML = '<svg viewBox="0 0 24 24" fill="white" width="30" height="30"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>', 
            btn.style.cssText = "\n      position: fixed;\n      right: 20px;\n      top: 20px;\n      width: 50px;\n      height: 50px;\n      background: rgba(255, 255, 255, 0.1);\n      border: none;\n      border-radius: 8px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      cursor: pointer;\n      user-select: none;\n      z-index: 10002;\n    ", 
            btn.onmouseover = () => {
                btn.style.background = "rgba(255, 255, 255, 0.2)";
            }, btn.onmouseout = () => {
                btn.style.background = "rgba(255, 255, 255, 0.1)";
            }, btn;
        }
        static setupEvents() {
            this.overlay.onclick = e => {
                e.target === this.overlay && this.close();
            }, this.img.onclick = e => {
                e.stopPropagation(), this.close();
            }, this.prevBtn.onclick = e => {
                e.stopPropagation(), this.prev();
            }, this.nextBtn.onclick = e => {
                e.stopPropagation(), this.next();
            }, this.closeBtn.onclick = e => {
                e.stopPropagation(), this.close();
            }, document.addEventListener("keydown", e => {
                "flex" === this.overlay?.style.display && ("Escape" === e.key ? this.close() : "ArrowLeft" === e.key ? this.prev() : "ArrowRight" === e.key && this.next());
            }), this.overlay.addEventListener("wheel", e => {
                if ("flex" !== this.overlay?.style.display) return;
                if (e.preventDefault(), this.images.length <= 1) return;
                const now = Date.now();
                if (now - this.lastWheelAt < 180) return;
                this.lastWheelAt = now;
                const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                delta < 0 ? this.prev() : delta > 0 && this.next();
            }, {
                passive: !1
            });
        }
        static show(images, index = 0) {
            this.init(), this.images = images, this.currentIndex = index, this.updateImage(), 
            this.overlay.style.display = "flex";
        }
        static close() {
            this.overlay && (this.overlay.style.display = "none");
        }
        static prev() {
            this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length, 
            this.updateImage();
        }
        static next() {
            this.currentIndex = (this.currentIndex + 1) % this.images.length, this.updateImage();
        }
        static updateImage() {
            const url = this.images[this.currentIndex];
            this.img.style.display = "none", this.img.src = "", this.counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`, 
            this.images.length <= 1 ? (this.prevBtn.style.display = "none", this.nextBtn.style.display = "none", 
            this.counter.style.display = "none") : (this.prevBtn.style.display = "flex", this.nextBtn.style.display = "flex", 
            this.counter.style.display = "block"), this.img.onload = () => {
                this.img.style.display = "block";
            }, this.img.onerror = () => {
                this.img.alt = "图片加载失败";
            }, this.img.src = url;
        }
    };
    _Lightbox.overlay = null, _Lightbox.img = null, _Lightbox.counter = null, _Lightbox.prevBtn = null, 
    _Lightbox.nextBtn = null, _Lightbox.closeBtn = null, _Lightbox.images = [], _Lightbox.currentIndex = 0, 
    _Lightbox.lastWheelAt = 0;
    let Lightbox = _Lightbox;
    const _TextPreview = class {
        static async preview(url, filename) {
            this.showLoading(filename);
            try {
                let buffer;
                try {
                    buffer = await this.request(url);
                } catch (networkError) {
                    throw new Error(`网络请求失败: ${networkError.message}`);
                }
                let text = this.decode(buffer);
                if (text.trim().startsWith("<!DOCTYPE html>") || text.includes("<html")) {
                    const doc = (new DOMParser).parseFromString(text, "text/html");
                    let redirectUrl = "";
                    const linkNode = doc.getElementById("succeedmessage_href");
                    if (linkNode && (redirectUrl = linkNode.getAttribute("href") || linkNode.href), 
                    !redirectUrl) {
                        const scriptMatch = text.match(/(?:window\.|^)\s*location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/);
                        scriptMatch && (redirectUrl = scriptMatch[1]);
                    }
                    if (!redirectUrl) {
                        const metaMatch = text.match(/meta\s+http-equiv=["']?refresh["']?\s+content=["']?\d+;\s*url=([^"']+)["']?/i);
                        metaMatch && (redirectUrl = metaMatch[1]);
                    }
                    if (redirectUrl) {
                        try {
                            redirectUrl = new URL(redirectUrl, window.location.href).href;
                        } catch {
                            redirectUrl.startsWith("http") || (redirectUrl = window.location.origin + "/" + redirectUrl.replace(/^\//, ""));
                        }
                        this.showLoading("检测到跳转页面，正在请求真实地址..."), await new Promise(resolve => setTimeout(resolve, 1500)), 
                        buffer = await this.request(redirectUrl), text = this.decode(buffer), (text.trim().startsWith("<!DOCTYPE html>") || text.includes("<html")) && this.handleHtmlError(text);
                    } else this.handleHtmlError(text);
                }
                return this.show(text, filename), !0;
            } catch (error) {
                const msg = error.message, displayMsg = "论坛提示: " === msg ? "无法获取内容，请检查权限。" : msg;
                return this.showError(filename, `预览失败: ${displayMsg}\n\n建议直接点击链接下载查看。`), !1;
            }
        }
        static request(url) {
            return url.startsWith("blob:") || url.startsWith("data:") ? fetch(url).then(res => res.arrayBuffer()) : new Promise((resolve, reject) => {
                "undefined" != typeof GM_xmlhttpRequest ? GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: "arraybuffer",
                    headers: {
                        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Cache-Control": "no-cache",
                        "Upgrade-Insecure-Requests": "1",
                        Referer: window.location.href
                    },
                    onload: response => {
                        response.status >= 200 && response.status < 300 ? resolve(response.response) : reject(new Error(`HTTP error ${response.status}`));
                    },
                    onerror: () => {
                        reject(new Error("网络请求错误 (GM_xmlhttpRequest)"));
                    },
                    ontimeout: () => {
                        reject(new Error("请求超时"));
                    }
                }) : fetch(url, {
                    headers: {
                        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Cache-Control": "no-cache"
                    },
                    credentials: "include"
                }).then(response => {
                    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                    return response.arrayBuffer();
                }).then(resolve).catch(reject);
            });
        }
        static handleHtmlError(htmlContent) {
            const doc = (new DOMParser).parseFromString(htmlContent, "text/html");
            let errorMsg = "";
            const messageText = doc.querySelector("#messagetext p, .guide .message");
            if (messageText && messageText.textContent && (errorMsg = messageText.textContent.trim()), 
            !errorMsg) {
                const alerts = doc.querySelectorAll(".alert_info p, .alert_error p");
                for (const p of Array.from(alerts)) {
                    const text = p.textContent?.trim() || "";
                    if (text && !text.includes("自动跳转") && !text.includes("点击此链接")) {
                        errorMsg = text;
                        break;
                    }
                }
            }
            if (!errorMsg) {
                const title = doc.querySelector("title")?.textContent?.split("-")[0]?.trim();
                title && "提示信息" !== title && (errorMsg = title);
            }
            throw errorMsg ? new Error(`论坛提示: ${errorMsg}`) : new Error("下载链接返回了网页而非文件，可能是权限不足或需要登录。");
        }
        static decode(buffer) {
            const decoderUtf8 = new TextDecoder("utf-8", {
                fatal: !0
            });
            try {
                return decoderUtf8.decode(buffer);
            } catch {
                return new TextDecoder("gbk", {
                    fatal: !1
                }).decode(buffer);
            }
        }
        static createUI() {
            if (this.overlay) return;
            this.overlay = document.createElement("div"), this.overlay.className = "txt-preview-overlay";
            const container = document.createElement("div");
            container.className = "txt-preview-container";
            const header = document.createElement("div");
            header.className = "txt-preview-header", this.titleBox = document.createElement("span"), 
            this.titleBox.className = "txt-preview-title";
            const closeBtn = document.createElement("span");
            closeBtn.className = "txt-preview-close", closeBtn.textContent = "✕", closeBtn.onclick = e => {
                e.stopPropagation(), this.hide();
            }, header.appendChild(this.titleBox), header.appendChild(closeBtn), this.contentBox = document.createElement("div"), 
            this.contentBox.className = "txt-preview-content";
            const footer = document.createElement("div");
            footer.className = "txt-preview-footer";
            const copyLinksBtn = document.createElement("button");
            copyLinksBtn.className = "txt-preview-btn", copyLinksBtn.style.backgroundColor = "#2e7d32", 
            copyLinksBtn.textContent = "提取并复制链接", copyLinksBtn.onclick = e => {
                e.stopPropagation(), this.copyAllLinks(copyLinksBtn);
            };
            const copyBtn = document.createElement("button");
            copyBtn.className = "txt-preview-btn", copyBtn.textContent = "复制全文", copyBtn.onclick = e => {
                e.stopPropagation(), this.copyContent(copyBtn);
            }, footer.appendChild(copyLinksBtn), footer.appendChild(copyBtn), container.appendChild(header), 
            container.appendChild(this.contentBox), container.appendChild(footer), this.overlay.appendChild(container), 
            this.overlay.addEventListener("click", e => {
                e.target === this.overlay && this.hide();
            }), document.body.appendChild(this.overlay);
        }
        static show(content, filename) {
            this.createUI(), this.titleBox && (this.titleBox.textContent = filename), this.contentBox && (this.renderContent(content), 
            this.contentBox.scrollTop = 0), this.overlay && (this.overlay.style.display = "flex", 
            requestAnimationFrame(() => {
                this.overlay?.classList.add("active");
            })), document.body.style.overflow = "hidden";
        }
        static showLoading(filename) {
            this.show("正在下载并解析文件内容，请稍候...", filename);
        }
        static showError(filename, msg) {
            this.show(msg, filename);
        }
        static hide() {
            this.overlay && (this.overlay.classList.remove("active"), setTimeout(() => {
                this.overlay && (this.overlay.style.display = "none");
            }, 200)), document.body.style.overflow = "";
        }
        static renderContent(content) {
            if (!this.contentBox) return;
            this.contentBox.innerHTML = "";
            const combinedRegex = new RegExp(`(${/ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|(?:[\/|]*)?/gi.source}|${/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}(?:&[^"'\s<>]+)?/gi.source})`, "gi");
            const lines = content.replace(/<br\s*\/?>/gi, "\n").replace(/<li>/gi, "\n").replace(/<div[^>]*>/gi, "\n").replace(/<\/div>|<\/li>|<\/ol>|<ol[^>]*>/gi, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/<[^>]+>/g, "").split(/\r?\n/), frag = document.createDocumentFragment();
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                const linksFound = trimmed.match(combinedRegex);
                if (linksFound && linksFound.length > 0) {
                    let remainingText = trimmed;
                    linksFound.forEach(linkUrl => {
                        remainingText = remainingText.replace(linkUrl, " ");
                    });
                    const cleanRemaining = remainingText.replace(/\s+/g, " ").trim();
                    if (cleanRemaining) {
                        const textLine = document.createElement("div");
                        textLine.className = "txt-preview-line", textLine.textContent = cleanRemaining, 
                        frag.appendChild(textLine);
                    }
                    linksFound.forEach(linkUrl => {
                        const linkLine = document.createElement("div");
                        linkLine.className = "txt-preview-line";
                        const a = document.createElement("a");
                        a.href = linkUrl, a.className = "txt-preview-link " + (linkUrl.toLowerCase().startsWith("ed2k") ? "ed2k" : "magnet"), 
                        a.textContent = linkUrl, a.target = "_blank", linkLine.appendChild(a), frag.appendChild(linkLine);
                    });
                } else {
                    const lineEl = document.createElement("div");
                    lineEl.className = "txt-preview-line", lineEl.textContent = trimmed, frag.appendChild(lineEl);
                }
            }), this.contentBox.appendChild(frag);
        }
        static copyAllLinks(btn) {
            if (!this.contentBox) return;
            const links = Array.from(this.contentBox.querySelectorAll("a.txt-preview-link")).map(a => a.href);
            if (0 === links.length) {
                const originalText = btn.textContent;
                return btn.textContent = "未发现链接", void setTimeout(() => btn.textContent = originalText, 1500);
            }
            const text = links.join("\n");
            this.doCopy(text, btn, "链接已复制");
        }
        static copyContent(btn) {
            if (!this.contentBox) return;
            const text = Array.from(this.contentBox.querySelectorAll(".txt-preview-line")).map(el => el.textContent).join("\n");
            this.doCopy(text, btn, "全文已复制");
        }
        static doCopy(text, btn, successMsg) {
            navigator.clipboard.writeText(text).then(() => {
                const originalText = btn.textContent, originalBg = btn.style.backgroundColor;
                btn.textContent = `✅ ${successMsg}`, btn.style.backgroundColor = "#4CAF50", setTimeout(() => {
                    btn.textContent = originalText, btn.style.backgroundColor = originalBg;
                }, 1500);
            }).catch(err => {
                btn.textContent = "❌ 复制失败", setTimeout(() => btn.textContent = "复制内容", 1500);
            });
        }
    };
    _TextPreview.overlay = null, _TextPreview.contentBox = null, _TextPreview.titleBox = null;
    let TextPreview = _TextPreview;
    class UIComponents {
        static buildPreviewUI(tr, previewData) {
            const {imgSrcs: imgSrcs, magnet: magnet, ed2k: ed2k, thunder: thunder, attachments: attachments} = previewData;
            if (tr.nextElementSibling && tr.nextElementSibling.classList.contains("imagePreviewTr")) return;
            tr.classList.add("thread-title-highlighted");
            const newTr = document.createElement("tr");
            newTr.className = "imagePreviewTr", "none" === tr.style.display && (newTr.style.display = "none");
            const newTd = document.createElement("td");
            newTd.colSpan = tr.children.length, newTd.style.cssText = "padding: 15px 20px; background: #fafafa;", 
            imgSrcs.length && newTd.appendChild(this.createImageSection(imgSrcs)), magnet && newTd.appendChild(this.createInfoSection(magnet)), 
            ed2k && newTd.appendChild(this.createEd2kSection(ed2k)), thunder && newTd.appendChild(this.createThunderSection(thunder)), 
            attachments && attachments.length > 0 && newTd.appendChild(this.createAttachmentSection(attachments)), 
            newTr.appendChild(newTd), tr.parentNode.insertBefore(newTr, tr.nextSibling);
        }
        static createImageSection(imgSrcs) {
            const validImgSrcs = imgSrcs.filter(src => src && src.startsWith("http"));
            if (0 === validImgSrcs.length) return document.createElement("div");
            const imgContainer = document.createElement("div");
            return imgContainer.style.cssText = "\n      display: flex !important;\n      gap: 12px !important;\n      width: 100% !important;\n      margin-bottom: 16px !important;\n    ", 
            validImgSrcs.forEach((src, index) => {
                const wrapper = document.createElement("div");
                wrapper.style.cssText = "\n        flex: 1 !important;\n        min-width: 0 !important;\n        height: 200px !important;\n        background: #f5f5f5 !important;\n        border-radius: 4px !important;\n        overflow: hidden !important;\n        cursor: pointer !important;\n        display: flex !important;\n        align-items: center !important;\n        justify-content: center !important;\n      ";
                const img = document.createElement("img");
                img.src = src, img.loading = "lazy", img.style.cssText = "\n        max-width: 100% !important;\n        max-height: 100% !important;\n        width: auto !important;\n        height: auto !important;\n        object-fit: contain !important;\n        display: block !important;\n      ", 
                wrapper.onclick = e => {
                    e.preventDefault(), e.stopPropagation(), Lightbox.show(validImgSrcs, index);
                }, wrapper.appendChild(img), imgContainer.appendChild(wrapper);
            }), imgContainer;
        }
        static createInfoSection(magnet) {
            const linkDiv = document.createElement("div");
            return linkDiv.style.cssText = "\n      font-size: 13px;\n      word-break: break-all;\n      cursor: pointer;\n      padding: 10px 12px;\n      background: #f0f9ff;\n      border: 1px solid #e0f2fe;\n      border-radius: 4px;\n      margin-bottom: 10px;\n    ", 
            linkDiv.textContent = magnet, linkDiv.title = "点击链接可复制", linkDiv.onclick = function(e) {
                Utils.copyToClipboard(magnet, e);
            }, linkDiv;
        }
        static createEd2kSection(ed2k) {
            const linkDiv = document.createElement("div");
            return linkDiv.style.cssText = "\n      font-size: 13px;\n      word-break: break-all;\n      cursor: pointer;\n      padding: 10px 12px;\n      background: #f0f9ff;\n      border: 1px solid #e0f2fe;\n      border-radius: 4px;\n      margin-bottom: 10px;\n    ", 
            linkDiv.textContent = ed2k, linkDiv.title = "点击ed2k链接可复制", linkDiv.onclick = function(e) {
                Utils.copyToClipboard(ed2k, e);
            }, linkDiv;
        }
        static createThunderSection(thunder) {
            const linkDiv = document.createElement("div");
            return linkDiv.style.cssText = "\n      font-size: 13px;\n      word-break: break-all;\n      cursor: pointer;\n      padding: 10px 12px;\n      background: #f0f9ff;\n      border: 1px solid #e0f2fe;\n      border-radius: 4px;\n      margin-bottom: 10px;\n    ", 
            linkDiv.textContent = thunder, linkDiv.title = "点击迅雷链接可复制", linkDiv.onclick = function(e) {
                Utils.copyToClipboard(thunder, e);
            }, linkDiv;
        }
        static createAttachmentSection(attachments) {
            const container = document.createElement("div");
            container.style.cssText = "\n      margin-top: 8px;\n      padding: 8px 12px;\n      background: #faf8f5;\n      border: 1px solid #ebe6df;\n      border-radius: 4px;\n    ";
            const purchasedAids = Storage.get("PURCHASED_AIDS", []) || [];
            return attachments.forEach(att => {
                let isPaid = !!att.price;
                const aidMatch = att.url.match(/aid=(\d+)/), aid = att.aid || (aidMatch ? aidMatch[1] : "");
                let isPurchased = !1;
                isPaid && aid && purchasedAids.includes(aid) && (isPaid = !1, isPurchased = !0);
                const item = document.createElement("div");
                item.style.cssText = `\n        display: flex;\n        align-items: center;\n        gap: 6px;\n        padding: 6px 8px;\n        margin-bottom: 4px;\n        background: ${isPaid ? "#fff8f0" : isPurchased ? "#f1f8e9" : "#f7f5f2"};\n        border: 1px solid ${isPaid ? "#ffe0b2" : isPurchased ? "#c8e6c9" : "#e5e0d8"};\n        border-left: 3px solid ${isPaid ? "#ff9800" : isPurchased ? "#4caf50" : "#2196F3"};\n        border-radius: 4px;\n        cursor: pointer;\n        transition: background 0.2s;\n        font-size: 13px;\n        color: ${isPaid ? "#e65100" : isPurchased ? "#2e7d32" : "#1976d2"};\n      `, 
                item.onmouseenter = () => {
                    item.style.background = isPaid ? "#ffe0b2" : isPurchased ? "#e8f5e9" : "#e3f2fd";
                }, item.onmouseleave = () => {
                    item.style.background = isPaid ? "#fff8f0" : isPurchased ? "#f1f8e9" : "#f7f5f2";
                };
                const icon = document.createElement("span");
                icon.textContent = isPaid ? "🔒" : isPurchased ? "🔓" : "📄";
                const tag = document.createElement("span");
                isPaid ? (tag.textContent = `💰 ${att.price}`, tag.style.cssText = "padding:2px 8px;background:#ff9800;color:#fff;border-radius:3px;font-size:11px;font-weight:bold;white-space:nowrap;") : isPurchased ? (tag.textContent = "✅ 已购买", 
                tag.style.cssText = "padding:1px 6px;background:#4caf50;color:#fff;border-radius:3px;font-size:11px;white-space:nowrap;") : (tag.textContent = "👁 预览", 
                tag.style.cssText = "padding:1px 6px;background:#e3f2fd;color:#1976d2;border-radius:3px;font-size:11px;white-space:nowrap;");
                const name = document.createElement("span");
                if (name.textContent = att.name, name.style.cssText = "word-break: break-all;", 
                item.appendChild(icon), item.appendChild(tag), item.appendChild(name), att.size) {
                    const size = document.createElement("span");
                    size.textContent = `(${att.size})`, size.style.cssText = "color:#aaa;font-size:11px;white-space:nowrap;", 
                    item.appendChild(size);
                }
                if (att.hasCheckpan) {
                    const checkBtn = document.createElement("span");
                    checkBtn.textContent = "🔍检测资源", checkBtn.style.cssText = "font-size:11px;padding:1px 6px;background:#fff3e0;color:#ef6c00;border:1px solid #ffe0b2;border-radius:3px;margin-left:auto;white-space:nowrap;cursor:pointer; transition:all 0.2s;", 
                    checkBtn.onclick = async ev => {
                        if (ev.preventDefault(), ev.stopPropagation(), "1" === checkBtn.getAttribute("data-loading")) return;
                        checkBtn.setAttribute("data-loading", "1"), checkBtn.textContent = "检测中...";
                        const currentAid = aid || att.aid, doCheck = async (depth = 0) => {
                            if (depth > 2) return checkBtn.textContent = "检测失败：重定向次数过多", void checkBtn.removeAttribute("data-loading");
                            try {
                                const text = await new Promise((resolve, reject) => {
                                    GM_xmlhttpRequest({
                                        method: "GET",
                                        url: `checkpan.php?aid=${currentAid}`,
                                        headers: {
                                            "X-Requested-With": "XMLHttpRequest"
                                        },
                                        onload: res => resolve(res.responseText),
                                        onerror: err => reject(err)
                                    });
                                }), doc = (new DOMParser).parseFromString(text, "text/html"), agreeLink = Array.from(doc.querySelectorAll("a")).find(a => a.textContent?.includes("已过 18") || a.textContent?.includes("警告"));
                                if (agreeLink) {
                                    const href = agreeLink.getAttribute("href");
                                    if (href) return await new Promise((resolve, reject) => {
                                        GM_xmlhttpRequest({
                                            method: "GET",
                                            url: href,
                                            headers: {
                                                "X-Requested-With": "XMLHttpRequest"
                                            },
                                            onload: () => resolve(),
                                            onerror: reject
                                        });
                                    }), await doCheck(depth + 1);
                                }
                                doc.querySelectorAll("script, style, meta, iframe").forEach(el => el.remove());
                                const resultText = doc.body.textContent?.replace(/\s+/g, " ").trim() || "获取结果失败";
                                checkBtn.textContent = `检查结果：${resultText}`, checkBtn.title = resultText, resultText.includes("已过 18") || resultText.includes("警告") ? (checkBtn.style.background = "#ffebee", 
                                checkBtn.style.color = "#c62828", checkBtn.style.border = "1px solid #ffcdd2", checkBtn.textContent = "检测失败：由于网站限制无法免进入直检") : (checkBtn.style.background = "#e8f5e9", 
                                checkBtn.style.color = "#2e7d32", checkBtn.style.border = "1px solid #c8e6c9"), 
                                checkBtn.removeAttribute("data-loading"), checkBtn.onclick = e => {
                                    e.preventDefault(), e.stopPropagation();
                                };
                            } catch (err) {
                                checkBtn.textContent = "检测失败", checkBtn.removeAttribute("data-loading");
                            }
                        };
                        await doCheck();
                    }, item.appendChild(checkBtn);
                }
                item.onclick = async e => {
                    if (e.preventDefault(), e.stopPropagation(), att.url.includes("action=buytopic") || att.url.includes("action=buy")) {
                        if (window.confirm(`此资源需要 ${att.price}购买隐藏内容。\n点击确认将打开新窗口前往帖子页面进行购买。`)) {
                            const tidMatch = att.url.match(/tid=(\d+)/) || att.aid?.match(/topic_(\d+)/);
                            tidMatch ? window.open(`/read.php?tid=${tidMatch[1]}`, "_blank") : window.open(att.url, "_blank");
                        }
                        return;
                    }
                    if (isPaid) {
                        if (!window.confirm(`此附件需要 ${att.price}，是否确认付费并预览？\n注：首次点击会触发购买处理，成功后将缓存购买记录。`)) return;
                    }
                    if (await TextPreview.preview(att.url, att.name) && isPaid && aid) {
                        const currentAids = Storage.get("PURCHASED_AIDS", []) || [];
                        currentAids.includes(aid) || (currentAids.push(aid), Storage.set("PURCHASED_AIDS", currentAids)), 
                        isPaid = !1, isPurchased = !0, item.style.background = "#f1f8e9", item.style.border = "1px solid #c8e6c9", 
                        item.style.borderLeft = "3px solid #4caf50", item.style.color = "#2e7d32", icon.textContent = "🔓", 
                        tag.textContent = "✅ 已购买", tag.style.cssText = "padding:1px 6px;background:#4caf50;color:#fff;border-radius:3px;font-size:11px;white-space:nowrap;", 
                        item.title = "已缓存购买记录，点击直接预览";
                    }
                }, item.title = isPaid ? `点击花费 ${att.price} 预览 TXT` : isPurchased ? "已缓存购买记录，点击直接预览" : "点击预览 TXT 内容", 
                container.appendChild(item);
            }), container;
        }
    }
    const _SearchFilter = class {
        static init() {
            this.initialized || this.isSearchResultPage() && (this.filterSearchResults(), this.removeNativePreviews(), 
            this.updateResultStats(), this.addQuickFilterButtons(), this.initialized = !0);
        }
        static isSearchResultPage() {
            if (!window.location.href.includes("search.php")) return !1;
            const searchTable = document.querySelector(".t table"), searchRows = document.querySelectorAll('tr[id^="search_"]');
            return !!(searchTable && searchRows.length > 0);
        }
        static extractForumId(row) {
            const id = row.getAttribute("id");
            if (id && id.startsWith("search_")) {
                const parts = id.split("_");
                if (parts.length >= 2) return parts[1];
            }
            return null;
        }
        static getExcludedForums() {
            return CONFIG.getExcludedForums();
        }
        static removeNativePreviews() {
            const nativeCheckbox = document.querySelector('input[name="hide_thumb"]');
            nativeCheckbox && !nativeCheckbox.checked && (nativeCheckbox.checked = !0);
            const nativePreviews = document.querySelectorAll(".search-img-group");
            nativePreviews.length > 0 && nativePreviews.forEach(el => el.remove());
        }
        static filterSearchResults() {
            const excludedForums = this.getExcludedForums();
            if (0 === excludedForums.length) return;
            const searchRows = document.querySelectorAll('tr[id^="search_"]');
            this.totalCount = searchRows.length;
            let hiddenCount = 0;
            searchRows.forEach(row => {
                const forumId = this.extractForumId(row);
                if (forumId && excludedForums.includes(forumId)) {
                    row.style.display = "none";
                    const nextRow = row.nextElementSibling;
                    nextRow && nextRow.classList.contains("imagePreviewTr") && (nextRow.style.display = "none"), 
                    hiddenCount++;
                }
            }), this.filteredCount = hiddenCount;
        }
        static updateResultStats() {
            if (0 === this.filteredCount) return;
            const headerCell = document.querySelector(".t table .h");
            if (headerCell) {
                const originalText = headerCell.textContent || "主题列表", visibleCount = this.totalCount - this.filteredCount;
                headerCell.textContent = `${originalText} (显示 ${visibleCount}/${this.totalCount} 条结果，已过滤 ${this.filteredCount} 条)`, 
                headerCell.setAttribute("title", `已根据设置隐藏${this.filteredCount}条不相关结果`);
            }
        }
        static reapplyFilter() {
            if (!this.isSearchResultPage()) return;
            document.querySelectorAll('tr[id^="search_"], tr.imagePreviewTr').forEach(row => {
                row.style.display = "";
            }), this.filteredCount = 0, this.filterSearchResults(), this.updateResultStats();
        }
        static getFilterStats() {
            return {
                total: this.totalCount,
                filtered: this.filteredCount,
                visible: this.totalCount - this.filteredCount
            };
        }
        static clearAllFilters() {
            CONFIG.setExcludedForums([]), this.reapplyFilter();
        }
        static addExcludedForum(forumId) {
            const currentExcluded = this.getExcludedForums();
            currentExcluded.includes(forumId) || (currentExcluded.push(forumId), CONFIG.setExcludedForums(currentExcluded), 
            this.reapplyFilter());
        }
        static removeExcludedForum(forumId) {
            const newExcluded = this.getExcludedForums().filter(id => id !== forumId);
            CONFIG.setExcludedForums(newExcluded), this.reapplyFilter();
        }
        static toggleForumExclusion(forumId) {
            this.getExcludedForums().includes(forumId) ? this.removeExcludedForum(forumId) : this.addExcludedForum(forumId);
        }
        static shouldFilterRow(row) {
            const forumId = this.extractForumId(row), excludedForums = this.getExcludedForums();
            return !!forumId && excludedForums.includes(forumId);
        }
        static addQuickFilterButtons(container) {
            (container || document).querySelectorAll('tr[id^="search_"]').forEach(row => {
                if (row.querySelector(".quick-filter-btn")) return;
                const forumId = this.extractForumId(row);
                if (!forumId) return;
                const forumLink = row.querySelector(`a[href*="fid=${forumId}"]`);
                if (forumLink && forumLink.parentElement) {
                    const btn = document.createElement("span");
                    btn.className = "quick-filter-btn", btn.textContent = " [屏蔽]", btn.title = '点击屏蔽此板块，可在顶部菜单"搜索过滤"中恢复', 
                    btn.style.cursor = "pointer", btn.style.color = "#999", btn.style.fontSize = "12px", 
                    btn.style.marginLeft = "4px", btn.onmouseover = () => {
                        btn.style.color = "red", btn.style.textDecoration = "underline";
                    }, btn.onmouseout = () => {
                        btn.style.color = "#999", btn.style.textDecoration = "none";
                    }, btn.onclick = e => {
                        if (e.preventDefault(), e.stopPropagation(), confirm(`确定要屏蔽板块【${forumLink.textContent}】吗？\n\n屏蔽后此板块的搜索结果将不再显示。\n如需恢复，请点击顶部菜单的"搜索过滤"按钮。`)) {
                            this.addExcludedForum(forumId), this.reapplyFilter();
                            document.querySelectorAll(`tr[id^="search_${forumId}_"]`).length;
                        }
                    }, forumLink.parentElement.appendChild(btn);
                }
            });
        }
    };
    _SearchFilter.initialized = !1, _SearchFilter.filteredCount = 0, _SearchFilter.totalCount = 0;
    let SearchFilter = _SearchFilter;
    class PreviewProcessor {
        static async processThreadLink(link) {
            const threadURL = link.href;
            if (!threadURL || !CONFIG.regex.threadUrl.test(threadURL)) return;
            const tr = link.closest("tr");
            if (tr && !tr.querySelector('img[src*="headtopic"]') && !SearchFilter.shouldFilterRow(tr) && "none" !== tr.style.display) try {
                const response = await fetch(threadURL), pageContent = await response.text(), doc = (new DOMParser).parseFromString(pageContent, "text/html"), isPaid = DataExtractor.isPaidContent(doc);
                let magnet = DataExtractor.extractMagnet(doc);
                if (!magnet && !isPaid) {
                    magnet = await ExternalMagnetExtractor.extractFromPage(pageContent) || "";
                }
                const previewData = {
                    imgSrcs: DataExtractor.extractImages(doc),
                    magnet: magnet || "",
                    ed2k: DataExtractor.extractEd2k(doc),
                    thunder: DataExtractor.extractThunder(doc),
                    attachments: DataExtractor.extractAttachments(doc).map(att => ({
                        ...att,
                        url: new URL(att.url, threadURL).href
                    }))
                };
                if (!(previewData.imgSrcs.length || previewData.magnet || previewData.ed2k || previewData.thunder || previewData.attachments.length)) return;
                UIComponents.buildPreviewUI(tr, previewData);
            } catch (e) {}
        }
        static async processBatch(links, concurrency = 5) {
            if (!links.length) return;
            const executing = [];
            for (const link of links) {
                const promise = this.processThreadLink(link).then(() => {
                    executing.splice(executing.indexOf(promise), 1);
                });
                executing.push(promise), executing.length >= concurrency && await Promise.race(executing);
            }
            await Promise.all(executing);
        }
    }
    class KeywordFilter {
        static init() {
            if (!this.isListPage()) return;
            this.addFilterUI();
            const savedKeyword = sessionStorage.getItem("2048_keyword_filter") || "";
            savedKeyword && this.filterThreads(savedKeyword);
        }
        static isListPage() {
            const href = window.location.href;
            return href.includes("thread.php") || href.includes("search.php");
        }
        static addFilterUI() {
            const targets = [];
            if (window.location.href.includes("search.php")) {
                const headerTd = Array.from(document.querySelectorAll("td.h")).find(td => td.textContent?.includes("主题列表") || td.textContent?.includes("结果"));
                if (headerTd) {
                    const tableWrapper = headerTd.closest(".t") || headerTd.closest("table");
                    tableWrapper && targets.push({
                        el: tableWrapper,
                        method: "search_top_right"
                    });
                }
            } else {
                const t3s = document.querySelectorAll(".t3");
                t3s.length > 0 && targets.push({
                    el: t3s[0],
                    method: "t3_absolute_center"
                });
            }
            0 !== targets.length && targets.forEach(({el: targetEl, method: method}) => {
                if (targetEl._hasKeywordFilter) return;
                targetEl._hasKeywordFilter = !0;
                const container = document.createElement("span");
                container.className = "keyword-filter-container", container.style.cssText = "\n                display: inline-flex;\n                align-items: center;\n                background: #ffffff;\n                border: 1px solid #e2e8f0;\n                border-radius: 8px;\n                box-shadow: 0 2px 8px rgba(0,0,0,0.04);\n                padding: 3px 4px;\n                transition: all 0.3s ease;\n            ";
                const input = document.createElement("input");
                input.type = "text", input.placeholder = "当前列表屏蔽过滤...", input.style.cssText = "\n                width: 130px;\n                height: 26px;\n                padding: 0 6px 0 8px;\n                border: none;\n                background: transparent;\n                font-size: 13px;\n                outline: none;\n                color: #334155;\n            ", 
                input.addEventListener("focus", () => {
                    container.style.borderColor = "#3b82f6", container.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.15)";
                }), input.addEventListener("blur", () => {
                    container.style.borderColor = "#e2e8f0", container.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                });
                const filterBtn = document.createElement("button");
                filterBtn.innerHTML = '<span style="margin-right:2px;">⚡</span>屏蔽', filterBtn.style.cssText = "\n                height: 26px;\n                cursor: pointer;\n                border: none;\n                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);\n                color: #ffffff;\n                border-radius: 5px;\n                font-size: 12px;\n                font-weight: 600;\n                padding: 0 12px;\n                margin-left: 2px;\n                box-shadow: 0 1px 2px rgba(239, 68, 68, 0.2);\n                transition: all 0.2s ease;\n                display: inline-flex;\n                align-items: center;\n                justify-content: center;\n            ", 
                filterBtn.addEventListener("mouseenter", () => {
                    filterBtn.style.transform = "translateY(-1px)", filterBtn.style.boxShadow = "0 3px 5px rgba(239, 68, 68, 0.3)", 
                    filterBtn.style.background = "linear-gradient(135deg, #f87171 0%, #ef4444 100%)";
                }), filterBtn.addEventListener("mouseleave", () => {
                    filterBtn.style.transform = "translateY(0)", filterBtn.style.boxShadow = "0 1px 2px rgba(239, 68, 68, 0.2)", 
                    filterBtn.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
                }), filterBtn.addEventListener("mousedown", () => {
                    filterBtn.style.transform = "translateY(1px)", filterBtn.style.boxShadow = "none";
                });
                const doFilter = () => {
                    const keyword = input.value.trim().toLowerCase();
                    keyword ? sessionStorage.setItem("2048_keyword_filter", keyword) : sessionStorage.removeItem("2048_keyword_filter"), 
                    this.filterThreads(keyword), document.querySelectorAll(".keyword-filter-container input").forEach(el => {
                        el !== input && (el.value = keyword);
                    });
                }, savedKeyword = sessionStorage.getItem("2048_keyword_filter") || "";
                savedKeyword && (input.value = savedKeyword), filterBtn.addEventListener("click", e => {
                    e.preventDefault(), doFilter();
                }), input.addEventListener("keydown", e => {
                    "Enter" === e.key && (e.preventDefault(), doFilter());
                });
                const resetBtn = document.createElement("button");
                if (resetBtn.innerHTML = "↺ 清空", resetBtn.style.cssText = "\n                height: 26px;\n                cursor: pointer;\n                border: none;\n                background: #f1f5f9;\n                color: #64748b;\n                border-radius: 5px;\n                font-size: 12px;\n                font-weight: 500;\n                padding: 0 10px;\n                margin-left: 6px;\n                transition: all 0.2s ease;\n                display: inline-flex;\n                align-items: center;\n                justify-content: center;\n            ", 
                resetBtn.addEventListener("mouseenter", () => {
                    resetBtn.style.background = "#e2e8f0", resetBtn.style.color = "#334155";
                }), resetBtn.addEventListener("mouseleave", () => {
                    resetBtn.style.background = "#f1f5f9", resetBtn.style.color = "#64748b";
                }), resetBtn.addEventListener("mousedown", () => {
                    resetBtn.style.transform = "translateY(1px)";
                }), resetBtn.addEventListener("mouseup", () => {
                    resetBtn.style.transform = "translateY(0)";
                }), resetBtn.addEventListener("click", e => {
                    e.preventDefault(), input.value = "", doFilter();
                }), container.appendChild(input), container.appendChild(filterBtn), container.appendChild(resetBtn), 
                container.style.pointerEvents = "auto", "search_top_right" === method) {
                    const wrapper = document.createElement("div");
                    wrapper.style.display = "flex", wrapper.style.justifyContent = "flex-end", wrapper.style.marginBottom = "8px", 
                    wrapper.style.width = "100%", wrapper.appendChild(container), targetEl.parentNode?.insertBefore(wrapper, targetEl);
                } else if ("t3_absolute_center" === method) {
                    "static" === getComputedStyle(targetEl).position && (targetEl.style.position = "relative");
                    const wrapper = document.createElement("div");
                    wrapper.style.position = "absolute", wrapper.style.left = "0", wrapper.style.right = "0", 
                    wrapper.style.top = "0", wrapper.style.bottom = "0", wrapper.style.display = "flex", 
                    wrapper.style.justifyContent = "center", wrapper.style.alignItems = "center", wrapper.style.pointerEvents = "none", 
                    wrapper.appendChild(container), targetEl.appendChild(wrapper);
                }
            });
        }
        static filterThreads(keyword) {
            const isSearchPage = window.location.href.includes("search.php"), rowsQuery = isSearchPage ? CONFIG.selectors.searchResultRows : CONFIG.selectors.threadRows, rows = document.querySelectorAll(rowsQuery);
            rows.forEach(row => {
                let titleLink = null;
                titleLink = isSearchPage ? row.querySelector('a[href*="read.php?tid="]') || row.querySelector("a") : row.querySelector('.subject a, a[id^="a_ajax_"]') || row.querySelector("a");
                const titleText = titleLink?.textContent?.toLowerCase() || "", rowText = row.textContent?.toLowerCase() || "", keywords = keyword.split(/\s+/).filter(k => k), isMatch = keywords.some(k => titleText.includes(k) || rowText.includes(k));
                if (keywords.length > 0 && isMatch) {
                    row.style.display = "none";
                    const nextRow = row.nextElementSibling;
                    nextRow && nextRow.classList.contains("imagePreviewTr") && (nextRow.style.display = "none");
                } else {
                    row.style.display = "";
                    const nextRow = row.nextElementSibling;
                    nextRow && nextRow.classList.contains("imagePreviewTr") && (nextRow.style.display = "");
                }
            });
        }
    }
    const _Toast = class {
        static initContainer() {
            return this.container || (this.container = document.createElement("div"), this.container.id = "toast-container", 
            Object.assign(this.container.style, {
                position: "fixed",
                top: "20px",
                right: "20px",
                zIndex: "99999",
                pointerEvents: "none"
            }), document.body.appendChild(this.container)), this.container;
        }
        static show(message, type = "info", duration = 4e3) {
            const container = this.initContainer(), toast = document.createElement("div");
            toast.textContent = message, Object.assign(toast.style, {
                padding: "12px 20px",
                marginBottom: "10px",
                borderRadius: "6px",
                color: "white",
                boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                opacity: "0",
                transform: "translateX(100%)",
                transition: "all 0.3s ease-out",
                fontSize: "14px",
                fontWeight: "400",
                maxWidth: "300px",
                wordWrap: "break-word",
                pointerEvents: "auto",
                cursor: "pointer"
            });
            return toast.style.backgroundColor = {
                success: "#10B981",
                error: "#EF4444",
                warning: "#F59E0B",
                info: "#3B82F6"
            }[type], toast.addEventListener("click", () => {
                this.removeToast(toast);
            }), container.appendChild(toast), setTimeout(() => {
                toast.style.opacity = "1", toast.style.transform = "translateX(0)";
            }, 10), duration > 0 && setTimeout(() => {
                this.removeToast(toast);
            }, duration), toast;
        }
        static removeToast(toast) {
            toast.style.opacity = "0", toast.style.transform = "translateX(100%)", setTimeout(() => {
                toast.parentNode && toast.remove();
            }, 300);
        }
        static success(message, duration = 4e3) {
            return this.show(message, "success", duration);
        }
        static error(message, duration = 5e3) {
            return this.show(message, "error", duration);
        }
        static warning(message, duration = 4e3) {
            return this.show(message, "warning", duration);
        }
        static info(message, duration = 3e3) {
            return this.show(message, "info", duration);
        }
    };
    _Toast.container = null;
    let Toast = _Toast;
    function getTodayDate() {
        const now = new Date;
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    function setStatusCache(signed, lastSignDate = "") {
        try {
            const cache = {
                date: getTodayDate(),
                signed: signed,
                lastSignDate: lastSignDate,
                timestamp: Date.now()
            };
            Storage.set("CHECK_IN_STATUS_V3", cache);
        } catch (error) {}
    }
    function setReplyStatus(replied) {
        try {
            const cache = {
                date: getTodayDate(),
                replied: replied,
                timestamp: Date.now()
            };
            Storage.set("DAILY_REPLY_STATUS_V3", cache);
        } catch (error) {}
    }
    const REPLY_POOL = [ "楼主辛苦了，内容很棒！", "感谢分享，内容很有价值！", "楼主辛苦了，非常感谢分享！", "内容不错，感谢楼主分享！", "感谢楼主的分享！", "楼主辛苦了，收藏了！", "感谢分享，非常有用！", "楼主辛苦了，谢谢分享！", "内容很棒，感谢楼主！", "感谢分享，收藏了！", "非常感谢楼主的分享！", "内容不错，谢谢分享！" ], BLOCKED_TITLE_KEYWORDS = [ "测试脚本", "測試腳本", "脚本检测", "腳本檢測", "脚本广告检测", "本帖禁止一切回复", "本帖禁止一切回復", "回复者永久禁言", "回復者永久禁言", "回复此贴者一律禁言", "回復此貼者一律禁言", "此贴请勿回复", "此貼請勿回復", "回复必然禁言", "回復必然禁言", "禁言", "杀无赦", "殺無赦" ];
    function isBlockedThreadTitle(title) {
        const normalizedTitle = title.replace(/\s+/g, "").toLowerCase();
        return BLOCKED_TITLE_KEYWORDS.some(keyword => normalizedTitle.includes(keyword.replace(/\s+/g, "").toLowerCase()));
    }
    function saveRepliedThread(tid) {
        try {
            const stored = Storage.get("REPLIED_THREADS_TIME", []) || [];
            stored.push({
                tid: tid,
                time: Date.now()
            }), Storage.set("REPLIED_THREADS_TIME", stored);
        } catch (error) {}
    }
    function isWithinTwoDays(dateText, twoDaysAgo) {
        if (dateText.includes("小时前") || dateText.includes("分钟前") || dateText.includes("今天") || "昨天" === dateText) return !0;
        if (dateText.match(/(\d{4})-(\d{2})-(\d{2})/)) {
            return new Date(dateText) >= twoDaysAgo;
        }
        return !1;
    }
    async function getRecentThreads() {
        try {
            const response = await fetch(`${Utils.getBaseUrl()}/thread.php?fid=136`, {
                credentials: "include"
            }), html = await response.text(), doc = (new DOMParser).parseFromString(html, "text/html"), threads = [], twoDaysAgo = new Date((new Date).getTime() - 1728e5), rows = doc.querySelectorAll("tr.tr3.t_one");
            for (const row of Array.from(rows)) {
                if (row.querySelector('img[src*="headtopic"]')) continue;
                const allLinks = row.querySelectorAll('a[href*="read.php?tid="]');
                let link = null;
                for (const l of Array.from(allLinks)) {
                    if ((l.textContent?.trim() || "").length > 3) {
                        link = l;
                        break;
                    }
                }
                if (!link) continue;
                const title = link.textContent?.trim() || "";
                if (!title || "⊙" === title) continue;
                const url = link.href, tidMatch = url.match(/tid=(\d+)/);
                if (!tidMatch) continue;
                const tid = tidMatch[1], dateText = row.querySelector("td:last-child")?.textContent?.trim() || "";
                isWithinTwoDays(dateText, twoDaysAgo) && threads.push({
                    tid: tid,
                    title: title,
                    url: url,
                    date: dateText
                });
            }
            return threads;
        } catch (error) {
            return [];
        }
    }
    function getSafeCandidateThreads(threads) {
        const repliedTids = function() {
            try {
                const sevenDaysAgo = Date.now() - 6048e5, recent = (Storage.get("REPLIED_THREADS_TIME", []) || []).filter(item => item.time > sevenDaysAgo);
                return Storage.set("REPLIED_THREADS_TIME", recent), recent.map(item => item.tid);
            } catch {
                return [];
            }
        }(), safeThreads = [];
        for (const thread of threads) isBlockedThreadTitle(thread.title) || repliedTids.includes(thread.tid) || safeThreads.push(thread);
        return safeThreads;
    }
    function confirmReplyThread(thread, currentIndex, total) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.style.cssText = "\n            position: fixed;\n            inset: 0;\n            background: rgba(0, 0, 0, 0.45);\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            z-index: 999999;\n            padding: 16px;\n        ";
            const modal = document.createElement("div");
            modal.style.cssText = '\n            width: min(520px, 100%);\n            background: #fff;\n            border-radius: 12px;\n            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);\n            padding: 20px;\n            color: #222;\n            font-family: "Microsoft YaHei", sans-serif;\n        ';
            const title = document.createElement("div");
            title.textContent = "回帖确认", title.style.cssText = "font-size: 18px; font-weight: 700; margin-bottom: 12px;";
            const desc = document.createElement("div");
            desc.textContent = `即将自动回帖并继续签到，当前候选 ${currentIndex + 1} / ${total}`, desc.style.cssText = "font-size: 13px; color: #666; margin-bottom: 16px;";
            const info = document.createElement("div");
            info.style.cssText = "\n            background: #f7f8fa;\n            border: 1px solid #e5e7eb;\n            border-radius: 10px;\n            padding: 14px;\n            margin-bottom: 16px;\n            line-height: 1.7;\n            word-break: break-all;\n        ", 
            info.innerHTML = `\n            <div><strong>帖子标题：</strong>${thread.title}</div>\n            <div><strong>发帖时间：</strong>${thread.date || "未知"}</div>\n        `;
            const tip = document.createElement("div");
            tip.textContent = "如果看起来像测试帖/检测帖，可点击“换下一帖”。", tip.style.cssText = "font-size: 13px; color: #b45309; margin-bottom: 18px;";
            const actions = document.createElement("div");
            actions.style.cssText = "display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;";
            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "取消流程", cancelBtn.style.cssText = "padding: 8px 14px; border: 1px solid #d1d5db; background: #fff; border-radius: 8px; cursor: pointer;";
            const nextBtn = document.createElement("button");
            nextBtn.textContent = "换下一帖", nextBtn.style.cssText = "padding: 8px 14px; border: none; background: #f59e0b; color: #fff; border-radius: 8px; cursor: pointer;";
            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = "确认回帖", confirmBtn.style.cssText = "padding: 8px 14px; border: none; background: #2563eb; color: #fff; border-radius: 8px; cursor: pointer;";
            const cleanup = decision => {
                overlay.remove(), resolve(decision);
            };
            cancelBtn.onclick = () => cleanup("cancel"), nextBtn.onclick = () => cleanup("next"), 
            confirmBtn.onclick = () => cleanup("confirm"), overlay.onclick = event => {
                event.target === overlay && cleanup("cancel");
            }, actions.appendChild(cancelBtn), actions.appendChild(nextBtn), actions.appendChild(confirmBtn), 
            modal.appendChild(title), modal.appendChild(desc), modal.appendChild(info), modal.appendChild(tip), 
            modal.appendChild(actions), overlay.appendChild(modal), document.body.appendChild(overlay);
        });
    }
    const REPLY_FAIL_KEYWORDS = [ "无权", "权限不足", "请输入验证码", "操作太快", "灌水", "不允许", "禁止发言", "请先登录", "发表失败", "回复失败" ], REPLY_SUCCESS_KEYWORDS = [ "read.php?tid=", "发表成功", "回复成功", "发帖成功", "操作成功", "成功" ];
    async function replyThread(thread) {
        try {
            const response = await fetch(thread.url, {
                credentials: "include"
            }), html = await response.text(), parser = new DOMParser, form = parser.parseFromString(html, "text/html").querySelector('form[name="FORM"]');
            if (!form) throw new Error("未找到回复表单");
            const replyContent = REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)], formData = new FormData;
            formData.append("step", "2"), formData.append("tid", thread.tid), formData.append("atc_content", replyContent), 
            formData.append("atc_title", "RE: " + thread.title.substring(0, 50));
            form.querySelectorAll('input[type="hidden"]').forEach(input => {
                const name = input.name, value = input.value;
                name && value && formData.append(name, value);
            });
            const replyResponse = await fetch(`${Utils.getBaseUrl()}/post.php?`, {
                method: "POST",
                credentials: "include",
                body: formData
            }), replyResult = await replyResponse.text();
            if (!replyResponse.ok) throw new Error(`回复请求失败（HTTP ${replyResponse.status}）`);
            const hasSuccessSign = REPLY_SUCCESS_KEYWORDS.some(kw => replyResult.includes(kw)), hasRedirect = replyResponse.redirected || replyResult.includes("location.href") || replyResult.includes("window.location") || /http-equiv=["']refresh["']/i.test(replyResult) || /url=.*read\.php/i.test(replyResult);
            if (hasSuccessSign || hasRedirect) return void saveRepliedThread(thread.tid);
            const failKeyword = REPLY_FAIL_KEYWORDS.find(kw => replyResult.includes(kw));
            if (failKeyword) throw new Error(`回复失败（${failKeyword}）`);
            saveRepliedThread(thread.tid);
        } catch (error) {
            throw error;
        }
    }
    async function prepareReplyCandidate() {
        const threads = await getRecentThreads();
        if (0 === threads.length) return null;
        const candidates = getSafeCandidateThreads(threads);
        return 0 === candidates.length ? null : candidates[0];
    }
    const _AutoCheckIn = class {
        static get CHECK_IN_URL() {
            return `${Utils.getBaseUrl()}/hack.php?H_name=qiandao`;
        }
        static syncStatusFromCache(buttonElement) {
            try {
                const cache = function() {
                    try {
                        return Storage.get("CHECK_IN_STATUS_V3", null);
                    } catch {
                        return null;
                    }
                }(), today = getTodayDate();
                cache && cache.date === today && cache.signed ? this.updateButtonStatus(buttonElement, !0) : buttonElement && (buttonElement.textContent = "自动签到", 
                buttonElement.title = "点击自动签到");
            } catch (error) {
                buttonElement && (buttonElement.textContent = "自动签到", buttonElement.title = "点击自动签到");
            }
        }
        static async initStatusCheck(buttonElement) {
            try {
                const stats = await this.getCheckInStats();
                if (!stats) return void this.updateButtonStatus(buttonElement, !1);
                const signed = stats.signedToday;
                setStatusCache(signed, stats.lastSignTime), this.updateButtonStatus(buttonElement, signed);
            } catch (error) {}
        }
        static async execute(buttonElement) {
            try {
                Toast.show("正在检查签到状态...", "info", 2e3);
                const stats = await this.getCheckInStats();
                let alreadySigned = !1;
                if (stats) {
                    if (alreadySigned = stats.signedToday, alreadySigned) return Toast.show("✅ 今天已经签到过了", "success", 2e3), 
                    setStatusCache(!0, stats.lastSignTime), void this.updateButtonStatus(buttonElement, !0);
                } else ;
                const moods = [ "kx", "fd", "yl" ], selectedMood = moods[Math.floor(Math.random() * moods.length)], replyState = await this.getTodayReplyState();
                if ("not_logged_in" === replyState) return void Toast.show("请先登录论坛后再签到", "error", 2500);
                if (!replyState.replied) {
                    if (this.prefetchedReplyThread || (this.prefetchedReplyThread = await prepareReplyCandidate()), 
                    !this.prefetchedReplyThread) return void Toast.show("未获取到可回帖帖子，请稍后刷新重试", "error", 3e3);
                    Toast.show("今日未回帖，正在自动回帖...", "info", 2500);
                    if (!(await this.doAutoReplyWithVerify(this.prefetchedReplyThread))) return void setReplyStatus(!1);
                }
                Toast.show("正在打开签到窗口...", "info", 2e3), this.openCheckInPopup(buttonElement, selectedMood);
            } catch (error) {
                Toast.show("自动签到失败: " + error.message, "error", 3e3);
            }
        }
        static async checkNeedsReplyFromServer() {
            try {
                const response = await fetch(this.CHECK_IN_URL, {
                    credentials: "include",
                    cache: "no-cache"
                }), html = await response.text();
                return html.includes("回复任何帖子") || html.includes("回复任意帖子") || html.includes("回复一个帖子") || html.includes("先回复") || html.includes("回帖") && html.includes("无法签到") || html.includes("回复") && html.includes("才能签到");
            } catch (error) {
                return !1;
            }
        }
        static async doAutoReplyWithVerify(thread) {
            try {
                await async function(preselectedThread) {
                    if (preselectedThread) return void (await replyThread(preselectedThread));
                    const threads = await getRecentThreads();
                    if (0 === threads.length) throw new Error("未找到可回复的帖子（两天内无新帖）");
                    const candidates = getSafeCandidateThreads(threads);
                    if (0 === candidates.length) throw new Error("未找到安全可回复的帖子（测试帖已过滤，且不重复回近7天帖子）");
                    let selectedThread = null;
                    for (let i = 0; i < candidates.length; i += 1) {
                        const candidate = candidates[i], decision = await confirmReplyThread(candidate, i, candidates.length);
                        if ("confirm" === decision) {
                            selectedThread = candidate;
                            break;
                        }
                        if ("cancel" === decision) throw new Error("已取消回帖，签到流程已中止");
                    }
                    if (!selectedThread) throw new Error("没有确认任何候选帖子，签到流程已中止");
                    await replyThread(selectedThread);
                }(thread || void 0), Toast.show("回帖已提交，验证中...", "info", 2e3), await this.sleep(2e3);
                if (await this.checkNeedsReplyFromServer()) return Toast.show("❌ 回帖未被服务端确认，签到中止", "error", 3e3), 
                !1;
                if (thread) {
                    const now = new Date, hour = String(now.getHours()).padStart(2, "0"), minute = String(now.getMinutes()).padStart(2, "0");
                    this.repliedThreadInCurrentSession = {
                        ...thread,
                        forumName: thread.forumName || "坛友自售",
                        replyTime: thread.replyTime || `${getTodayDate()} ${hour}:${minute}`
                    };
                }
                return this.prefetchedReplyThread = null, setReplyStatus(!0), Toast.show("✅ 回帖成功！", "success", 2e3), 
                !0;
            } catch (error) {
                return Toast.show("回帖失败: " + error.message, "error", 3e3), !1;
            }
        }
        static async getCheckInStats() {
            try {
                const response = await fetch(this.CHECK_IN_URL, {
                    credentials: "include",
                    cache: "no-cache"
                }), html = await response.text(), signedToday = this.isSignedTodayHtml(html), doc = (new DOMParser).parseFromString(html, "text/html"), tacStats = this.parseCheckInStatsFromTac(doc, html, signedToday);
                if (tacStats) return tacStats;
                if (html.includes("slider_captcha") || html.includes("sliderbox") || html.includes("verify_token") || html.includes("验证码") || html.includes("captcha") || html.includes("verifycode")) {
                    const selectors = [ ".stats", ".signarea .stats", ".qiandao_text", ".sign-info", '[id*="qiandao"] .stats', '[class*="qiandao"] .stats', '[id*="qiandao"]', '[class*="qiandao"]' ];
                    let statsDiv = null;
                    for (const selector of selectors) if (statsDiv = doc.querySelector(selector), statsDiv) {
                        const text = (statsDiv.textContent || "").replace(/\s+/g, " ").trim();
                        if (/累计签到|本月|上次签到|您累计已签到|您本月已累计签到|您上次签到时间/.test(text)) break;
                        statsDiv = null;
                    }
                    if (!statsDiv) {
                        const totalMatch2 = html.match(/累计签到[：:]\s*(\d+)\s*天/), monthMatch2 = html.match(/本月[：:]\s*(\d+)\s*天/), timeMatch2 = html.match(/上次签到[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                        if (totalMatch2 || monthMatch2 || timeMatch2) {
                            return {
                                totalDays: totalMatch2 ? parseInt(totalMatch2[1]) : 0,
                                monthDays: monthMatch2 ? parseInt(monthMatch2[1]) : 0,
                                lastSignTime: timeMatch2 ? timeMatch2[1] : "",
                                signedToday: signedToday
                            };
                        }
                        return null;
                    }
                    const statsText = (statsDiv.textContent || "").replace(/\s+/g, " ").trim(), totalMatch = statsText.match(/累计签到[：:]\s*(\d+)\s*天/), totalDays = totalMatch ? parseInt(totalMatch[1]) : 0, monthMatch = statsText.match(/本月[：:]\s*(\d+)\s*天/), monthDays = monthMatch ? parseInt(monthMatch[1]) : 0, timeMatch = statsText.match(/上次签到[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/), lastSignTime = timeMatch ? timeMatch[1] : "";
                    return {
                        totalDays: totalDays,
                        monthDays: monthDays,
                        lastSignTime: lastSignTime,
                        signedToday: signedToday
                    };
                }
                {
                    const tacTd = doc.querySelector("td.tac") || doc.querySelector('td[class*="tac"]');
                    if (!tacTd) {
                        const totalMatch2 = html.match(/您累计已签到[：:]\s*<b>(\d+)<\/b>\s*天/), monthMatch2 = html.match(/您本月已累计签到[：:]\s*<b>(\d+)<\/b>\s*天/), timeMatch2 = html.match(/您上次签到时间[：:]\s*<font[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})<\/font>/);
                        if (totalMatch2 || monthMatch2 || timeMatch2) {
                            return {
                                totalDays: totalMatch2 ? parseInt(totalMatch2[1]) : 0,
                                monthDays: monthMatch2 ? parseInt(monthMatch2[1]) : 0,
                                lastSignTime: timeMatch2 ? timeMatch2[1] : "",
                                signedToday: signedToday
                            };
                        }
                        return null;
                    }
                    const tacText = tacTd.textContent || "", tacHtml = tacTd.innerHTML || "", totalMatch = tacHtml.match(/您累计已签到[：:]\s*<b>(\d+)<\/b>\s*天/) || tacText.match(/您累计已签到[：:]\s*(\d+)\s*天/), totalDays = totalMatch ? parseInt(totalMatch[1]) : 0, monthMatch = tacHtml.match(/您本月已累计签到[：:]\s*<b>(\d+)<\/b>\s*天/) || tacText.match(/您本月已累计签到[：:]\s*(\d+)\s*天/), monthDays = monthMatch ? parseInt(monthMatch[1]) : 0, timeMatch = tacHtml.match(/您上次签到时间[：:]\s*<font[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})<\/font>/) || tacText.match(/您上次签到时间[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/), lastSignTime = timeMatch ? timeMatch[1] : "";
                    return {
                        totalDays: totalDays,
                        monthDays: monthDays,
                        lastSignTime: lastSignTime,
                        signedToday: signedToday
                    };
                }
            } catch (error) {
                return null;
            }
        }
        static async openCheckInPopup(buttonElement, selectedMood) {
            Toast.show("正在拉起验证码，请在当前页弹窗内完成验证", "info", 3e3);
            try {
                const existing = document.querySelector("#checkin-slider-modal");
                existing && existing.remove();
                const modal = document.createElement("div");
                modal.id = "checkin-slider-modal", modal.style.cssText = "\n        position: fixed;\n        top: 120px;\n        right: 20px;\n        background: #fff;\n        border-radius: 16px;\n        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);\n        padding: 16px;\n        z-index: 99999;\n        width: 420px;\n      ";
                const header = document.createElement("div");
                header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;";
                const title = document.createElement("div");
                title.textContent = "签到验证", title.style.cssText = "font-size:16px;font-weight:600;color:#333;";
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "✕", closeBtn.style.cssText = "width:28px;height:28px;border:none;border-radius:50%;background:#f0f0f0;color:#666;font-size:18px;cursor:pointer;";
                const tip = document.createElement("div");
                tip.textContent = "请在下方完成验证码；验证成功后脚本会自动继续签到。", tip.style.cssText = "margin-bottom:12px;font-size:12px;line-height:1.6;color:#666;";
                const iframeContainer = document.createElement("div");
                iframeContainer.style.cssText = "position:relative;width:388px;height:388px;overflow:hidden;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb;";
                const iframe = document.createElement("iframe");
                iframe.style.cssText = "width:1400px;height:2200px;border:none;position:absolute;top:0;left:0;", 
                header.appendChild(title), header.appendChild(closeBtn), iframeContainer.appendChild(iframe), 
                modal.appendChild(header), modal.appendChild(tip), modal.appendChild(iframeContainer), 
                document.body.appendChild(modal);
                let handled = !1, submitting = !1, focusedCaptcha = !1, startTriggered = !1;
                closeBtn.onclick = () => {
                    handled = !0, modal.remove();
                };
                const focusVisibleCaptcha = () => {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!iframeDoc) return;
                    const candidates = Array.from(iframeDoc.querySelectorAll("#tcaptcha_transform_dy, .tcaptcha-transform"));
                    for (const candidate of candidates) {
                        const computed = iframe.contentWindow?.getComputedStyle(candidate), rect = candidate.getBoundingClientRect(), top = parseFloat(candidate.style.top || computed?.top || "") || rect.top || 0, left = parseFloat(candidate.style.left || computed?.left || "") || rect.left || 0, width = parseFloat(candidate.style.width || computed?.width || "") || rect.width || 0, height = parseFloat(candidate.style.height || computed?.height || "") || rect.height || 0;
                        if ("none" !== computed?.display && "hidden" !== computed?.visibility && width >= 280 && height >= 280 && top > -1e3) return iframeContainer.style.width = `${Math.ceil(width)}px`, 
                        iframeContainer.style.height = `${Math.ceil(height)}px`, modal.style.width = `${Math.ceil(width) + 32}px`, 
                        iframe.style.left = `-${Math.max(0, left)}px`, iframe.style.top = `-${Math.max(0, top)}px`, 
                        void (focusedCaptcha || (focusedCaptcha = !0, Toast.show("验证码已加载，请在当前页弹窗内完成验证", "success", 2e3)));
                    }
                };
                iframe.src = this.CHECK_IN_URL, iframe.onload = () => {
                    try {
                        const iframeWindow = iframe.contentWindow, iframeDoc = iframe.contentDocument || iframeWindow?.document;
                        if (!iframeWindow || !iframeDoc) return;
                        if (startTriggered) return;
                        const moodRadio = iframeDoc.querySelector(`input[name="qdxq"][value="${selectedMood}"]`), fallbackMoodRadio = iframeDoc.querySelector('input[name="qdxq"]'), targetMoodRadio = moodRadio || fallbackMoodRadio;
                        targetMoodRadio && (targetMoodRadio.checked = !0, targetMoodRadio.dispatchEvent(new Event("click", {
                            bubbles: !0
                        })), targetMoodRadio.dispatchEvent(new Event("change", {
                            bubbles: !0
                        })));
                        const trigger = iframeDoc.querySelector('[onclick*="qdCaptchaStart"], input[onclick*="qdCaptchaStart"], button[onclick*="qdCaptchaStart"]');
                        if (trigger) return startTriggered = !0, void trigger.click();
                        "function" == typeof iframeWindow.qdCaptchaStart && (startTriggered = !0, iframeWindow.qdCaptchaStart());
                    } catch (error) {}
                };
                const checkInterval = window.setInterval(() => {
                    try {
                        if (handled) return;
                        const popupDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (!popupDoc) return;
                        focusVisibleCaptcha();
                        const frameHtml = popupDoc.documentElement?.outerHTML || "";
                        if (!frameHtml) return;
                        const hycodeInput = popupDoc.querySelector('#input_bbb, input[name="hycode"]'), hyrandstrInput = popupDoc.querySelector('#randstr_bbb, input[name="hyrandstr"]'), hycode = hycodeInput?.value?.trim() || "", hyrandstr = hyrandstrInput?.value?.trim() || "";
                        if (!submitting && (hycode || hyrandstr)) {
                            const form = popupDoc.querySelector("form");
                            form && Array.from(form.querySelectorAll('input[type="hidden"]'));
                            return submitting = !0, handled = !0, window.clearInterval(checkInterval), modal.remove(), 
                            void this.finishCheckInAfterVerifyReload(buttonElement);
                        }
                        const tokenInput = popupDoc.querySelector("#verify_token");
                        if (tokenInput?.value) {
                            handled = !0, window.clearInterval(checkInterval), modal.remove();
                            tokenInput.value;
                            return void this.finishCheckInAfterVerifyReload(buttonElement);
                        }
                        if (this.isCheckInSuccessPageHtml(frameHtml)) return handled = !0, window.clearInterval(checkInterval), 
                        modal.remove(), void this.finishCheckInSuccess(buttonElement);
                        this.isNeedReplyHtml(frameHtml) && (handled = !0, window.clearInterval(checkInterval), 
                        modal.remove(), Toast.show("验证通过，但服务端要求先回帖，正在处理...", "info", 3e3), this.doAutoReplyWithVerify(this.prefetchedReplyThread).then(replyOk => {
                            replyOk && (Toast.show("回帖成功，请重新完成一次签到验证", "success", 3e3), this.openCheckInPopup(buttonElement, selectedMood));
                        }));
                    } catch (error) {}
                }, 500);
                window.setTimeout(() => {
                    window.clearInterval(checkInterval);
                }, 18e4);
            } catch (error) {
                Toast.show("❌ 加载失败: " + error.message, "error", 3e3);
            }
        }
        static isSignedTodayHtml(html) {
            const doc = (new DOMParser).parseFromString(html, "text/html"), tacTd = doc.querySelector("td.tac") || doc.querySelector('td[class*="tac"]'), tacText = tacTd?.textContent?.replace(/\s+/g, " ").trim() || "";
            return !tacText.includes("今天未签到") && !tacText.includes("今日未签到") && (!(!tacText.includes("今天已签到") && !tacText.includes("今日已签到")) || !html.includes("今天未签到") && !html.includes("今日未签到") && (html.includes("今天已签到") || html.includes("今日已签到")));
        }
        static parseCheckInStatsFromTac(doc, html, signedToday) {
            const tacTd = doc.querySelector("td.tac") || doc.querySelector('td[class*="tac"]'), tacHtml = tacTd?.innerHTML || "", tacText = tacTd?.textContent || "", totalMatch = tacHtml.match(/您累计已签到[：:]\s*<b>(\d+)<\/b>\s*天/) || tacText.match(/您累计已签到[：:]\s*(\d+)\s*天/) || html.match(/您累计已签到[：:]\s*<b>(\d+)<\/b>\s*天/), monthMatch = tacHtml.match(/您本月已累计签到[：:]\s*<b>(\d+)<\/b>\s*天/) || tacText.match(/您本月已累计签到[：:]\s*(\d+)\s*天/) || html.match(/您本月已累计签到[：:]\s*<b>(\d+)<\/b>\s*天/), timeMatch = tacHtml.match(/上次签到[：:]\s*<font[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})<\/font>/) || tacText.match(/上次签到[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/) || html.match(/上次签到[：:]\s*<font[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})<\/font>/);
            return totalMatch || monthMatch || timeMatch || signedToday ? {
                totalDays: totalMatch ? parseInt(totalMatch[1]) : 0,
                monthDays: monthMatch ? parseInt(monthMatch[1]) : 0,
                lastSignTime: timeMatch ? timeMatch[1] : "",
                signedToday: signedToday
            } : null;
        }
        static async getReplyStateForPanel() {
            const state = await this.getTodayReplyState();
            return "not_logged_in" === state ? "unknown" : state.replied ? "replied" : "not_replied";
        }
        static async preloadReplyCandidate(replyState) {
            if ("not_replied" !== replyState) return this.prefetchedReplyThread = null, null;
            try {
                const candidate = await prepareReplyCandidate();
                return this.prefetchedReplyThread = candidate, candidate;
            } catch (error) {
                return this.prefetchedReplyThread = null, null;
            }
        }
        static async getLatestTodayReplyThreadForPanel() {
            try {
                if (this.repliedThreadInCurrentSession) return this.repliedThreadInCurrentSession;
                const url = this.getCurrentReplyPageUrl();
                if (!url) return null;
                const response = await fetch(url, {
                    credentials: "include",
                    cache: "no-cache"
                });
                if (!response.ok) return null;
                const html = await response.text(), doc = (new DOMParser).parseFromString(html, "text/html"), today = getTodayDate(), todayMonthDay = today.slice(5), rows = Array.from(doc.querySelectorAll("tr"));
                let firstThreadInPage = null;
                for (const row of rows) {
                    const link = this.pickThreadLinkFromReplyRow(row);
                    if (!link) continue;
                    const href = link.getAttribute("href") || link.href || "", fullUrl = new URL(href, `${Utils.getBaseUrl()}/`).toString(), tidMatch = fullUrl.match(/[?&]tid=(\d+)/), pidMatch = fullUrl.match(/[?&]pid=(\d+)/);
                    if (!tidMatch) continue;
                    const title = link.textContent?.trim() || "";
                    if (!title || "⊙" === title) continue;
                    const currentThread = {
                        tid: tidMatch[1],
                        title: title,
                        url: pidMatch ? `${Utils.getBaseUrl()}/read.php?tid=${tidMatch[1]}&pid=${pidMatch[1]}#${pidMatch[1]}` : fullUrl,
                        date: ""
                    };
                    firstThreadInPage || (firstThreadInPage = currentThread);
                    const rowText = row.textContent?.replace(/\s+/g, " ").trim() || "", fullDateMatch = rowText.match(/(\d{4}-\d{2}-\d{2})/), shortDateMatch = rowText.match(/(\d{2}-\d{2})\s+\d{2}:\d{2}/);
                    let isTodayRow = !1;
                    if (fullDateMatch ? (currentThread.date = fullDateMatch[1], isTodayRow = fullDateMatch[1] === today) : shortDateMatch ? (currentThread.date = `${today.slice(0, 4)}-${shortDateMatch[1]}`, 
                    isTodayRow = shortDateMatch[1] === todayMonthDay) : rowText.includes("今天") && (currentThread.date = today, 
                    isTodayRow = !0), isTodayRow) return {
                        tid: currentThread.tid,
                        title: currentThread.title,
                        url: currentThread.url,
                        date: currentThread.date,
                        forumName: this.extractForumNameFromReplyRow(row),
                        replyTime: this.extractReplyTimeFromReplyRow(row)
                    };
                    if (currentThread.date && currentThread.date < today) break;
                }
                return firstThreadInPage;
            } catch (error) {
                return null;
            }
        }
        static pickThreadLinkFromReplyRow(row) {
            const links = Array.from(row.querySelectorAll("a[href]"));
            if (0 === links.length) return null;
            for (const link of links) {
                const href = link.getAttribute("href") || "", text = link.textContent?.trim() || "";
                if (/[?&]tid=\d+/.test(href) && (href.includes("read.php") || href.includes("job.php?action=topost")) && text && "⊙" !== text && text.length > 1) return link;
            }
            return links.find(link => {
                const href = link.getAttribute("href") || "", text = link.textContent?.trim() || "";
                return /[?&]tid=\d+/.test(href) && (href.includes("read.php") || href.includes("job.php?action=topost")) && !!text;
            }) || null;
        }
        static extractForumNameFromReplyRow(row) {
            try {
                const anchors = Array.from(row.querySelectorAll("a"));
                for (const a of anchors) {
                    const href = a.getAttribute("href") || "", text = a.textContent?.trim() || "";
                    if (text && href.includes("thread.php?fid=")) return text;
                }
                return "";
            } catch {
                return "";
            }
        }
        static extractReplyTimeFromReplyRow(row) {
            const rowText = row.textContent?.replace(/\s+/g, " ").trim() || "", fullDateTime = rowText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
            if (fullDateTime) return fullDateTime[1];
            const shortDateTime = rowText.match(/(\d{2}-\d{2}\s+\d{2}:\d{2})/);
            if (shortDateTime) return shortDateTime[1];
            const todayTime = rowText.match(/今天\s*(\d{2}:\d{2})/);
            return todayTime ? `今天 ${todayTime[1]}` : "";
        }
        static async executeReplyOnly() {
            const replyState = await this.getTodayReplyState();
            return "not_logged_in" === replyState ? (Toast.show("请先登录论坛后再回帖", "error", 2500), 
            !1) : replyState.replied ? (Toast.show("今天已经回帖过了", "success", 2e3), !0) : (this.prefetchedReplyThread || (this.prefetchedReplyThread = await prepareReplyCandidate()), 
            this.prefetchedReplyThread ? (Toast.show("今日未回帖，正在自动回帖...", "info", 2500), await this.doAutoReplyWithVerify(this.prefetchedReplyThread)) : (Toast.show("未获取到可回帖帖子，请稍后刷新重试", "error", 3e3), 
            !1));
        }
        static getCurrentReplyPageUrl() {
            try {
                const directLink = document.querySelector('a[href="u.php?action=post"], a[href*="u.php?action=post"]');
                if (directLink) {
                    const href = directLink.getAttribute("href") || directLink.href || "";
                    return new URL(href, `${Utils.getBaseUrl()}/`).toString();
                }
                const links = Array.from(document.querySelectorAll("a"));
                for (const link of links) {
                    const text = link.textContent?.replace(/\s+/g, "").trim() || "", href = link.getAttribute("href") || "";
                    if (href && "我的回复" === text) {
                        return new URL(href, `${Utils.getBaseUrl()}/`).toString();
                    }
                }
                const uid = this.getCurrentUserId();
                if (uid) {
                    return `${Utils.getBaseUrl()}/u.php?action=post&uid=${uid}`;
                }
                return null;
            } catch (error) {
                return null;
            }
        }
        static getCurrentUserId() {
            try {
                const prioritizedSelectors = [ 'a[href*="u.php?action=post&uid="]', 'a[href*="u.php?action=show&uid="]', 'a[href*="u.php?action=friend&uid="]', 'a[href*="u.php?uid="]', 'a[href*="uid="]' ], hrefCandidates = [];
                for (const selector of prioritizedSelectors) {
                    const links = Array.from(document.querySelectorAll(selector));
                    for (const link of links) link.href && hrefCandidates.push(link.href);
                }
                for (const href of hrefCandidates) {
                    const match = href.match(/[?&]uid=(\d+)/);
                    if (match) return match[1];
                }
                const pageHtml = document.documentElement?.outerHTML || "", htmlMatch = pageHtml.match(/u\.php\?(?:action=[^"'\s>]*&amp;|action=[^"'\s>]*&)?uid=(\d+)/i) || pageHtml.match(/[?&]uid=(\d{5,})/);
                return htmlMatch ? htmlMatch[1] : null;
            } catch (error) {
                return null;
            }
        }
        static async getTodayReplyState() {
            const repliedToday = await this.hasRepliedTodayByProfile();
            if (null === repliedToday) {
                const fallbackReplyState = this.getTodayReplyStateFromHome();
                return null !== fallbackReplyState ? (setReplyStatus(fallbackReplyState), {
                    replied: fallbackReplyState
                }) : "not_logged_in";
            }
            return {
                replied: repliedToday
            };
        }
        static getTodayReplyStateFromHome() {
            try {
                const match = (document.body?.textContent?.replace(/\s+/g, " ") || "").match(/今日[:：]\s*(\d+)/);
                if (!match) return null;
                const todayCount = parseInt(match[1], 10);
                return Number.isNaN(todayCount) ? null : todayCount > 0;
            } catch (error) {
                return null;
            }
        }
        static async hasRepliedTodayByProfile() {
            try {
                const url = this.getCurrentReplyPageUrl();
                if (!url) return null;
                const response = await fetch(url, {
                    credentials: "include",
                    cache: "no-cache"
                });
                if (!response.ok) return null;
                const html = await response.text(), doc = (new DOMParser).parseFromString(html, "text/html"), today = getTodayDate(), pageText = doc.body?.textContent?.replace(/\s+/g, " ").trim() || "", hasReplyLink = !!doc.querySelector('a[href*="read.php?tid="]'), hasReplyTable = Array.from(doc.querySelectorAll("tr")).some(row => {
                    const text = row.textContent?.replace(/\s+/g, " ").trim() || "";
                    return /\d{4}-\d{2}-\d{2}/.test(text);
                });
                if ((pageText.includes("您还没有登录") || pageText.includes("请先登录") || pageText.includes("您没有登录")) && !hasReplyLink && !hasReplyTable) return null;
                const rows = Array.from(doc.querySelectorAll("tr"));
                let firstReplyDate = "";
                for (const row of rows) {
                    const rowText = row.textContent?.replace(/\s+/g, " ").trim() || "";
                    if (!rowText) continue;
                    const match = rowText.match(/(\d{4}-\d{2}-\d{2})/g);
                    if (match) {
                        firstReplyDate = match[0];
                        break;
                    }
                }
                if (!firstReplyDate) return !1;
                return firstReplyDate === today;
            } catch (error) {
                return null;
            }
        }
        static buildCheckInFormDataFromInputs(allHiddenInputs, mood, hycode, hyrandstr) {
            const formData = new URLSearchParams;
            formData.append("action", "qiandao"), formData.append("qdxq", mood);
            for (const input of allHiddenInputs) {
                const name = input.name, value = input.value;
                name && formData.append(name, value);
            }
            return formData.has("method") || formData.append("method", "AND"), formData.has("sch_area") || formData.append("sch_area", "0"), 
            formData.has("f_fid") || formData.append("f_fid", "0"), formData.has("sch_time") || formData.append("sch_time", "all"), 
            formData.set("hycode", hycode), formData.set("hyrandstr", hyrandstr), formData;
        }
        static async submitCheckInFormData(formData, source) {
            const response = await fetch(this.CHECK_IN_URL, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formData.toString()
            }), html = await response.text();
            return this.parseCheckInResultHtml(html, source);
        }
        static parseCheckInResultHtml(html, source) {
            const hasSuccess = this.isCheckInSuccessHtml(html), signedByTac = this.isSignedTodayHtml(html), needEmail = html.includes("必须绑定邮箱") || html.includes("绑定邮箱"), needReplyError = this.isNeedReplyHtml(html) || html.includes("未回复");
            html.includes("提示信息") || html.includes("错误");
            return hasSuccess || signedByTac ? "success" : needEmail ? "fail" : needReplyError ? "need_reply" : "fail";
        }
        static isCheckInSuccessHtml(html) {
            return html.includes("签到成功") || html.includes("恭喜你签到成功") || html.includes("今天已签到") || html.includes("今日已签到");
        }
        static isCheckInSuccessPageHtml(html) {
            return html.includes("签到成功") || html.includes("恭喜你签到成功");
        }
        static isNeedReplyHtml(html) {
            return html.includes("回复任何帖子") || html.includes("回复任意帖子") || html.includes("回复一个帖子") || html.includes("先回复") || html.includes("回帖") && html.includes("无法签到") || html.includes("回复") && html.includes("才能签到");
        }
        static finishCheckInSuccess(buttonElement) {
            Toast.show("✅ 签到成功！", "success", 3e3), setStatusCache(!0, ""), this.updateButtonStatus(buttonElement, !0), 
            setTimeout(() => this.reloadCurrentPage(), 1500);
        }
        static finishCheckInAfterVerifyReload(buttonElement) {
            Toast.show("验证完成，正在确认签到状态...", "info", 2500), buttonElement && (buttonElement.textContent = "签到确认中...", 
            buttonElement.style.opacity = "0.8", buttonElement.style.pointerEvents = "none"), 
            this.confirmCheckInAfterVerify(buttonElement);
        }
        static async confirmCheckInAfterVerify(buttonElement) {
            for (let attempt = 1; attempt <= 4; attempt++) {
                attempt > 1 && await this.sleep(1500);
                const stats = await this.getCheckInStats();
                if (stats?.signedToday) return setStatusCache(!0, stats.lastSignTime), this.updateButtonStatus(buttonElement, !0), 
                Toast.show("✅ 签到成功，正在刷新页面...", "success", 2500), void setTimeout(() => this.reloadCurrentPage(), 800);
            }
            Toast.show("验证完成，状态同步较慢，正在刷新页面重试...", "info", 3e3), this.updateButtonStatus(buttonElement, !1), 
            setTimeout(() => this.reloadCurrentPage(), 800);
        }
        static reloadCurrentPage() {
            const url = new URL(window.location.href);
            url.searchParams.set("_checkin_refresh", String(Date.now())), window.location.replace(url.toString());
        }
        static updateButtonStatus(buttonElement, signed) {
            buttonElement && (signed ? (buttonElement.textContent = "今日已签 ✓", buttonElement.style.opacity = "0.6", 
            buttonElement.style.cursor = "not-allowed", buttonElement.style.pointerEvents = "none", 
            buttonElement.title = "今天已经签到过了") : (buttonElement.textContent = "自动签到", buttonElement.style.opacity = "1", 
            buttonElement.style.cursor = "pointer", buttonElement.style.pointerEvents = "", 
            buttonElement.title = "点击自动签到"));
        }
        static sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };
    _AutoCheckIn.prefetchedReplyThread = null, _AutoCheckIn.repliedThreadInCurrentSession = null;
    let AutoCheckIn = _AutoCheckIn;
    class CheckInInfoPanel {
        static async waitForElement(selector, timeout = 5e3) {
            const startTime = Date.now();
            for (;Date.now() - startTime < timeout; ) {
                const element = document.querySelector(selector);
                if (element) return element;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return null;
        }
        static async init() {
            try {
                const selectors = [ "#head #banner", "#banner", "td#banner", 'td[id="banner"]', "#head table td:last-child", '#head table td[align="right"]', "#head table tr td:last-child", "#head" ];
                let bannerTd = null;
                for (const selector of selectors) if (bannerTd = await this.waitForElement(selector, 2e3), 
                bannerTd) break;
                if (!bannerTd) {
                    document.querySelector("#head, head");
                    return;
                }
                const stats = await AutoCheckIn.getCheckInStats(), replyState = await AutoCheckIn.getReplyStateForPanel(), safeStats = stats || {
                    totalDays: 0,
                    monthDays: 0,
                    lastSignTime: "",
                    signedToday: !1
                }, candidate = await AutoCheckIn.preloadReplyCandidate(replyState), latestRepliedThread = "replied" === replyState ? await AutoCheckIn.getLatestTodayReplyThreadForPanel() : null;
                this.createInfoPanel(bannerTd, safeStats, replyState, candidate, latestRepliedThread);
            } catch (error) {}
        }
        static createInfoPanel(container, stats, replyState, candidate, latestRepliedThread) {
            const existing = container.querySelector(".checkin-panel-wrapper");
            existing && existing.remove();
            const isToday = stats.signedToday, statusIcon = isToday ? "✅" : "⏰", statusText = isToday ? "已签到" : "未签到", statusColor = isToday ? "#90EE90" : "#FFD700", replyStatusText = "replied" === replyState ? "已回帖" : "not_replied" === replyState ? "未回帖" : "待确认", replyColor = "replied" === replyState ? "#90EE90" : "#FFD700", detailThread = "replied" === replyState ? latestRepliedThread : candidate, replyTitleText = "replied" === replyState ? detailThread ? `今日已回帖：${detailThread.title}` : "今日已回帖（未解析到帖子标题）" : candidate ? `目标帖子：${candidate.title}` : "暂未获取到可回帖帖子", panel = document.createElement("div");
            panel.className = "checkin-info-panel", panel.style.cssText = '\n      display: flex;\n      flex-direction: column;\n      align-items: stretch;\n      justify-content: flex-start;\n      padding: 6px 12px;\n      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n      border-radius: 6px;\n      box-shadow: 0 2px 6px rgba(0,0,0,0.15);\n      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;\n      color: #fff;\n      font-size: 13px;\n      line-height: 1;\n      gap: 8px;\n      box-sizing: border-box;\n      width: auto;\n      max-width: 100%;\n      min-width: 0;\n    ';
            const statsDiv = document.createElement("div");
            statsDiv.style.cssText = "display: flex; gap: 10px; opacity: 0.9;", statsDiv.innerHTML = `\n      <span>累计: <b style="font-weight:700;">${stats.totalDays}</b>天</span>\n      <span>本月: <b style="font-weight:700;">${stats.monthDays}</b>天</span>\n      <span>上次: ${stats.lastSignTime ? stats.lastSignTime.substring(0, 10) : "暂无"}</span>\n    `;
            const statusDiv = document.createElement("div");
            statusDiv.style.cssText = "display: flex; gap: 10px; align-items: center;", statusDiv.innerHTML = `\n      <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} ${statusText}</span>\n      <span style="opacity: 0.5;">|</span>\n      <span style="color: ${replyColor}; font-weight: bold;" title="${replyTitleText.replace(/"/g, "&quot;")}">💬 ${replyStatusText}</span>\n    `;
            const replyDetailDiv = document.createElement("div");
            if (replyDetailDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 12px; opacity: 0.95; width: 100%; min-width: 0; overflow: hidden; white-space: nowrap; text-align: left;", 
            detailThread) {
                const prefix = "replied" === replyState ? "已回帖：" : "待回帖：", meta = "replied" === replyState ? `时间：${detailThread.replyTime || detailThread.date || "未知"} ｜ 板块：${detailThread.forumName || "坛友自售"}` : `板块：${detailThread.forumName || "坛友自售"}`, leftContent = document.createElement("span");
                leftContent.style.cssText = "display: flex; align-items: center; justify-content: flex-start; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-align: left;";
                const label = document.createElement("span");
                label.textContent = prefix, label.style.cssText = "flex: 0 0 auto; margin-right: 0; text-align: left;";
                const link = document.createElement("a");
                link.href = detailThread.url, link.target = "_blank", link.rel = "noopener noreferrer", 
                link.textContent = detailThread.title, link.title = `${prefix}${detailThread.title}${meta}`, 
                link.style.cssText = "display: block; flex: 1 1 auto; min-width: 0; margin-left: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbeafe; text-decoration: underline; text-align: left; vertical-align: bottom;";
                const metaSpan = document.createElement("span");
                metaSpan.textContent = meta, metaSpan.style.cssText = "flex: 0 0 auto; white-space: nowrap; text-align: right;", 
                leftContent.appendChild(label), leftContent.appendChild(link), replyDetailDiv.appendChild(leftContent), 
                replyDetailDiv.appendChild(metaSpan);
            } else {
                const fallbackText = "replied" === replyState ? "已回帖：未获取到帖子标题" : "待回帖：暂未获取到可回帖帖子";
                replyDetailDiv.textContent = fallbackText, replyDetailDiv.title = fallbackText;
            }
            const btnWrap = document.createElement("div");
            btnWrap.style.cssText = "flex: 0 0 auto;";
            const checkInBtn = document.createElement("button");
            checkInBtn.textContent = isToday ? "已签到" : "一键签到", checkInBtn.title = replyTitleText, 
            checkInBtn.style.cssText = `\n      padding: 6px 12px;\n      background: ${isToday ? "rgba(255,255,255,0.2)" : "#fff"};\n      color: ${isToday ? "#fff" : "#667eea"};\n      border: none;\n      border-radius: 4px;\n      font-size: 13px;\n      font-weight: bold;\n      cursor: ${isToday ? "default" : "pointer"};\n      transition: all 0.2s;\n    `, 
            isToday || (checkInBtn.onmouseover = () => {
                checkInBtn.style.opacity = "0.9";
            }, checkInBtn.onmouseout = () => {
                checkInBtn.style.opacity = "1";
            }, checkInBtn.onclick = () => {
                AutoCheckIn.execute(checkInBtn);
            }), btnWrap.appendChild(checkInBtn);
            const topRow = document.createElement("div");
            topRow.style.cssText = "display: flex; align-items: center; justify-content: flex-start; gap: 8px; white-space: nowrap; min-width: max-content;";
            const topLeft = document.createElement("div");
            topLeft.style.cssText = "display: flex; align-items: center; gap: 12px; flex: 0 0 auto; min-width: max-content;", 
            topLeft.appendChild(statsDiv), topLeft.appendChild(statusDiv), topRow.appendChild(topLeft), 
            topRow.appendChild(btnWrap), panel.appendChild(topRow), panel.appendChild(replyDetailDiv);
            const wrapper = document.createElement("div");
            wrapper.className = "checkin-panel-wrapper", wrapper.style.cssText = "display: flex; justify-content: flex-end; width: 100%; max-width: 100%; margin-top: 8px; box-sizing: border-box;", 
            wrapper.appendChild(panel), "head" === container.id ? (wrapper.style.marginRight = "12px", 
            container.appendChild(wrapper)) : container.appendChild(wrapper);
            if (requestAnimationFrame(() => {
                const wrapperWidth = wrapper.clientWidth || container.clientWidth || 0, topLeftWidth = Math.ceil(topLeft.getBoundingClientRect().width), btnWidth = Math.ceil(btnWrap.getBoundingClientRect().width), topRowWidth = topLeftWidth + btnWidth + 8 + 24;
                if (!topLeftWidth || !btnWidth) return;
                const finalWidth = wrapperWidth > 0 ? Math.min(topRowWidth, wrapperWidth) : topRowWidth;
                panel.style.width = `${finalWidth}px`;
            }), !document.head.querySelector("style[data-checkin-panel]")) {
                const style = document.createElement("style");
                style.setAttribute("data-checkin-panel", "true"), style.textContent = "\n        @media (max-width: 768px) {\n          .checkin-panel-wrapper {\n            justify-content: center !important;\n            margin-right: 0 !important;\n          }\n          .checkin-info-panel {\n            flex-direction: column !important;\n            align-items: stretch !important;\n            gap: 10px !important;\n            width: 100% !important;\n            box-sizing: border-box !important;\n          }\n          .checkin-info-panel > div:first-child {\n            flex-direction: column !important;\n            align-items: stretch !important;\n            gap: 10px !important;\n            white-space: normal !important;\n          }\n          .checkin-info-panel a {\n            display: inline-block;\n            max-width: 100%;\n            overflow: hidden;\n            text-overflow: ellipsis;\n            white-space: nowrap;\n          }\n          .checkin-info-panel > div > div {\n            justify-content: center !important;\n          }\n        }\n      ", 
                document.head.appendChild(style);
            }
        }
    }
    const _ContentPageEnhancer = class {
        static async init() {
            if (document.querySelector(`.${this.CLASS_NAME}`)) return;
            const titleEl = document.querySelector("#subject_tpc") || document.querySelector("h1");
            if (!titleEl) return;
            if (DataExtractor.isPaidContent(document)) return;
            let magnet = DataExtractor.extractMagnet(document);
            if (!magnet) {
                const pageContent = document.documentElement.outerHTML;
                magnet = await ExternalMagnetExtractor.extractFromPage(pageContent) || "";
            }
            if (!magnet) return;
            const container = document.createElement("div");
            container.className = this.CLASS_NAME;
            const label = document.createElement("div");
            label.className = "content-magnet-title", label.textContent = "磁力链接";
            const magnetRow = document.createElement("div");
            magnetRow.className = "content-magnet-text", magnetRow.textContent = magnet, magnetRow.title = "点击复制磁力链接", 
            magnetRow.addEventListener("click", event => Utils.copyToClipboard(magnet, event)), 
            container.appendChild(label), container.appendChild(magnetRow), titleEl.insertAdjacentElement("afterend", container);
        }
    };
    _ContentPageEnhancer.CLASS_NAME = "content-magnet-block";
    let ContentPageEnhancer = _ContentPageEnhancer;
    class App2048 {
        static initHideThumbMemory() {
            const checkbox = document.querySelector('input[name="hide_thumb"]');
            if (!checkbox) return;
            const savedState = CONFIG.getHideThumb();
            checkbox.checked = savedState, checkbox.addEventListener("change", () => {
                CONFIG.setHideThumb(checkbox.checked);
            });
        }
        static fixSearchLinks() {
            const searchLinks = document.querySelectorAll('a[href="/search.php"], a[href="search.php"]');
            searchLinks.forEach(link => {
                link.href = "/2048/search.php?advanced=1&keyword=&old=old#submit";
            }), searchLinks.length;
        }
        static isLoggedIn() {
            if (document.querySelector('#td_userinfomore[href*="u.php?action=show"]')) return !0;
            const loginLink = document.querySelector('a[href="login.php"]');
            if (loginLink && loginLink.textContent?.includes("登录")) return !1;
            const registerLink = document.querySelector('a[href="register.php"]');
            return registerLink && registerLink.textContent?.includes("注册"), !1;
        }
        static is2048Site() {
            const title = document.title;
            if (title.includes("2048") || title.includes("人人为我")) return !0;
            return !!document.querySelector('a[href="/2048"] img[src="/2048/logo.png"], a[href*="hack.php?H_name=qiandao"], .tr3.t_one, .f14.cc, #read_tpc');
        }
        static async displayThreadImages() {
            if (Utils.isContentPage()) return;
            const postLinks = Utils.safeQuerySelectorAll(CONFIG.selectors.threadLinks);
            postLinks.length && await PreviewProcessor.processBatch(postLinks, 5);
        }
        static isSearchPage() {
            return CONFIG.regex.searchUrl.test(window.location.href);
        }
        static hasSearchResults() {
            return null !== document.querySelector(CONFIG.selectors.searchResultTable);
        }
        static async main() {
            if (this.is2048Site()) try {
                UltraMinimalStyleManager.injectStyles(), this.fixSearchLinks(), this.initHideThumbMemory();
                const pathname = window.location.pathname, href = window.location.href;
                if (("/" === pathname || "/index.php" === pathname || "/2048" === pathname || "/2048/" === pathname || "/2048/index.php" === pathname || !pathname || "" === pathname || "/index.php" === pathname && !href.includes("?") || pathname.endsWith("/") && !href.includes("thread") && !href.includes("read")) && CheckInInfoPanel.init().catch(err => {}), 
                Utils.isContentPage()) return void ContentPageEnhancer.init();
                this.isSearchPage() ? (ModernSettingsPanel.init(), this.hasSearchResults() && (SearchFilter.init(), 
                KeywordFilter.init(), await this.displayThreadImages())) : (AdRemover.removeAds(), 
                KeywordFilter.init(), await this.displayThreadImages());
            } catch (error) {}
        }
    }
    AdRemover.removeGlobalAds(), "loading" === document.readyState ? document.addEventListener("DOMContentLoaded", () => {
        AdRemover.removeGlobalAds(), App2048.main();
    }) : (AdRemover.removeGlobalAds(), App2048.main()), window.addEventListener("load", () => {
        AdRemover.removeGlobalAds();
    });
}();
