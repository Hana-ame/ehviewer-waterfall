/* E-Hentai 瀑布流查看器 - 核心逻辑
 * 数据链路：
 *   - 页面 HTML：ehwv.moonchan.xyz/s/<hash>/<gid>-<page>  (api-pack 代理，CORS 开放)
 *   - 图片：hath.network 直连（不被墙，浏览器直接 <img> 加载）
 * 解析目标（api-pack 已注入 /exhentai/ex.js 但这里自实现）：
 *   - #img  -> <img id="img" src="hath.network...">
 *   - #next -> <a id="next" href="/s/<hash2>/<gid>-<page+1>">
 */
(function () {
  "use strict";

  // api-pack 后端（与 hana-ame.github.io 的 /s/* 组件默认值一致；可用 ?host= 覆盖）
  const DEFAULT_HOST = "https://ehwv.moonchan.xyz";

  const $ = (s) => document.querySelector(s);
  const stage = $("#stage");
  const waterfallEl = $("#waterfall");
  const statusEl = $("#status");
  const inputEl = $("#load-input");
  const btnAuto = $("#btn-auto");
  const btnCopy = $("#btn-copy");
  const btnReload = $("#btn-reload");

  // 运行态
  let baseHost = DEFAULT_HOST;     // api-pack 后端地址
  let autoMode = false;            // 自动连续加载
  let loading = false;             // 是否正在加载
  let currentUrl = null;           // 当前 /s/ 页（含 host）
  let currentImgSrc = null;        // 当前图片直链
  let loadToken = 0;               // 取消令牌（防竞态）

  // 解析 ?host= 参数（沿用 /s/* 组件语义：有 host 则用它）
  const qs = new URLSearchParams(location.search);
  const hostParam = qs.get("host");
  if (hostParam) {
    baseHost = hostParam.startsWith("http") ? hostParam : location.origin;
  }

  // ---------- 状态 ----------
  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  // ---------- URL 工具 ----------
  // 把任意输入（相对 /s/ 路径、完整 URL、/g/ 链接）规整为 {kind, path}
  function parseInput(raw) {
    if (!raw) return null;
    let s = raw.trim();
    // 去协议和 host，留路径
    if (s.startsWith("http://") || s.startsWith("https://")) {
      try {
        const u = new URL(s);
        s = u.pathname + u.search;
      } catch (e) { return null; }
    }
    // /g/<gid>/<token>/ 或 /s/<hash>/<gid>-<page>
    let m = s.match(/^\/g\/(\d+)\/([0-9a-fA-F]+)\/?/);
    if (m) return { kind: "gallery", gid: m[1], token: m[2], path: `/g/${m[1]}/${m[2]}/` };
    m = s.match(/^\/s\/([0-9a-fA-F]+)\/(\d+)-(\d+)\/?/);
    if (m) return { kind: "page", hash: m[1], gid: m[2], page: m[3], path: `/s/${m[1]}/${m[2]}-${m[3]}` };
    // 直接 gid/token
    m = s.match(/^(\d+)\/([0-9a-fA-F]+)$/);
    if (m) return { kind: "gallery", gid: m[1], token: m[2], path: `/g/${m[1]}/${m[2]}/` };
    return null;
  }

  // 从画廊页解析第一个 /s/ 链接（瀑布流入口）
  async function getFirstPage(gid, token) {
    const url = baseHost + `/g/${gid}/${token}/`;
    setStatus("正在解析画廊页…");
    const resp = await fetch(url, { headers: { "Accept-Language": "zh" } });
    if (!resp.ok) throw new Error(`画廊页请求失败: HTTP ${resp.status}`);
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, "text/html");
    // 页面里的第一个 /s/ 链接（api-pack 已把 exhentai.org 前缀去掉）
    const a = doc.querySelector('a[href^="/s/"]');
    if (!a) throw new Error("画廊页未找到 /s/ 图片链接");
    return { hash: null, path: a.getAttribute("href") };
  }

  // ---------- 单页加载 ----------
  // 加载一个 /s/ 页，解析出图片直链和下一页路径
  async function loadPage(path) {
    const url = path.startsWith("http") ? path : baseHost + path;
    setStatus("加载 " + url);
    const resp = await fetch(url, { headers: { "Accept-Language": "zh" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, "text/html");
    const img = doc.getElementById("img");
    if (!img || !img.src) throw new Error("页面未找到 #img");
    const nextEl = doc.getElementById("next");
    let nextPath = null;
    if (nextEl && nextEl.getAttribute("href")) {
      nextPath = nextEl.getAttribute("href"); // 相对 /s/... 或绝对
      if (nextPath.startsWith("/")) nextPath = nextPath; // api-pack 相对
    }
    return { imgSrc: img.src, nextPath, doc };
  }

  // ---------- 瀑布流渲染 ----------
  async function runWaterfall(startPath) {
    const tok = ++loadToken;
    loading = true;
    btnAuto.classList.add("active");
    waterfallEl.innerHTML = "";
    currentUrl = null;

    let path = startPath;
    let seen = new Set();
    let idx = 0;
    let consecutiveFail = 0;

    try {
      while (path && !seen.has(path)) {
        if (tok !== loadToken) break; // 被新请求取消
        seen.add(path);
        try {
          const { imgSrc, nextPath } = await loadPage(path);
          if (tok !== loadToken) break;
          currentUrl = baseHost + path;
          currentImgSrc = imgSrc;

          const img = document.createElement("img");
          img.className = "wimg";
          img.src = imgSrc;
          img.alt = `第 ${idx + 1} 张`;
          img.loading = "lazy";
          waterfallEl.appendChild(img);

          const info = document.createElement("div");
          info.className = "winfo";
          info.textContent = `#${idx + 1} · ${path}`;
          waterfallEl.appendChild(info);

          idx++;
          consecutiveFail = 0;
          setStatus(`已加载 ${idx} 张 · ${imgSrc.slice(0, 60)}…`);

          // 自动模式：继续下一页；否则停止（点击自动继续）
          path = nextPath;
          if (!autoMode) {
            // 非自动：停在第一页，等用户点「自动」
            setStatus(`已加载第 1 张。点「自动」连续加载，或继续手动。`);
            break;
          }
        } catch (e) {
          consecutiveFail++;
          const err = document.createElement("div");
          err.className = "werror";
          err.textContent = `第 ${idx + 1} 页加载失败: ${e.message}`;
          waterfallEl.appendChild(err);
          if (consecutiveFail >= 3) {
            setStatus("连续失败，已停止");
            break;
          }
          // 失败也尝试下一页（防单页抽风）
          path = path; // 保持，避免死循环由 seen 拦截
          break;
        }
      }
      setStatus(`完成：共 ${idx} 张` + (path ? "（下一页 " + path + "）" : ""));
    } finally {
      loading = false;
      if (tok === loadToken) btnAuto.classList.remove("active");
    }
  }

  // ---------- 入口 ----------
  async function start(raw) {
    const p = parseInput(raw);
    if (!p) { setStatus("无法识别的链接: " + raw); return; }
    try {
      if (p.kind === "gallery") {
        const first = await getFirstPage(p.gid, p.token);
        await runWaterfall(first.path);
      } else if (p.kind === "page") {
        await runWaterfall(p.path);
      }
    } catch (e) {
      waterfallEl.innerHTML = `<div class="werror">加载失败: ${e.message}</div>`;
      setStatus("错误: " + e.message);
    }
  }

  // ---------- 事件 ----------
  $("#load-form").addEventListener("submit", (e) => {
    e.preventDefault();
    start(inputEl.value || location.href);
  });
  btnAuto.addEventListener("click", () => {
    autoMode = !autoMode;
    btnAuto.classList.toggle("active", autoMode);
    if (autoMode && currentUrl) {
      // 从当前继续
      const p = parseInput(currentUrl);
      if (p && p.kind === "page") runWaterfall(p.path);
    }
    setStatus(autoMode ? "自动模式开" : "自动模式关");
  });
  btnCopy.addEventListener("click", () => {
    if (!currentImgSrc) { setStatus("还没有图片可复制"); return; }
    navigator.clipboard.writeText(currentImgSrc).then(
      () => setStatus("已复制图片外链"),
      () => setStatus("复制失败")
    );
  });
  btnReload.addEventListener("click", () => {
    location.reload();
  });

  // 初始化：如果 URL 本身是 /s/ 或 /g/，直接加载
  const init = parseInput(location.pathname);
  if (init) {
    inputEl.value = location.pathname;
    start(location.pathname);
  } else {
    setStatus("就绪。粘贴画廊链接或打开 /s/ 路径开始。");
  }
})();
