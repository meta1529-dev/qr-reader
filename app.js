import { readBarcodesFromImageData, prepareZXingModule } from "./vendor/zxing/es/reader/index.js";

const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
const resultsEl = $("#results");
const fileEl = $("#file");

// ---------- ZXing WASM（遅延初期化：初めて読み取る時だけ復元する） ----------
let zxingReady = null;
function initZXing() {
  if (!zxingReady) {
    zxingReady = (async () => {
      const { WASM_B64 } = await import("./vendor/zxing-wasm-data.js");
      const bin = atob(WASM_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      prepareZXingModule({ overrides: { wasmBinary: bytes.buffer } });
    })();
  }
  return zxingReady;
}

function setStatus(msg, busy = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("busy", busy);
}

function classify(text) {
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      return {
        kind: "URL", url: text, host: u.host,
        insecure: u.protocol === "http:",
        hasUserInfo: Boolean(u.username || u.password),
      };
    } catch {
      return { kind: "URL（形式が不正なためリンク化しません）" };
    }
  }
  if (/^tel:/i.test(text)) return { kind: "電話番号", url: text };
  if (/^mailto:/i.test(text)) return { kind: "メール", url: text };
  if (/^(smsto|sms):/i.test(text)) return { kind: "SMS", url: text.replace(/^smsto:/i, "sms:") };
  if (/^WIFI:/i.test(text)) return { kind: "Wi-Fi 設定情報" };
  return { kind: "テキスト" };
}

function showResults(texts, sourceLabel) {
  resultsEl.innerHTML = "";
  if (!texts.length) return;
  for (const text of texts) {
    const info = classify(text);
    const card = document.createElement("div");
    card.className = "result";
    const kind = document.createElement("div");
    kind.className = "kind";
    kind.textContent = `${info.kind}（${sourceLabel}で読み取り）`;
    const body = document.createElement("div");
    body.className = "text";
    body.textContent = text;
    card.append(kind, body);
    if (info.host) {
      const host = document.createElement("div");
      host.className = "host";
      let msg = `リンク先のドメイン: ${info.host} — 心当たりのあるサイトか確認してから開いてください`;
      if (info.insecure) msg += "（http のため通信は暗号化されません）";
      if (info.hasUserInfo) msg += "（URLにユーザー情報が含まれています。通常のリンクでは珍しい形式です）";
      host.textContent = msg;
      card.append(host);
    }
    const row = document.createElement("div");
    row.className = "row";
    if (info.url) {
      const open = document.createElement("a");
      open.className = "btn primary";
      open.href = info.url;
      open.textContent = info.kind === "URL" ? "リンクを開く" : "開く";
      if (info.kind === "URL") { open.target = "_blank"; open.rel = "noopener noreferrer"; }
      row.append(open);
    }
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "コピーする";
    copy.addEventListener("click", async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {}
      if (!ok) {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.append(ta); ta.select();
        try { ok = document.execCommand("copy"); } catch { ok = false; }
        ta.remove();
      }
      copy.textContent = ok ? "コピーしました ✓" : "コピーできませんでした（長押しで選択してください）";
      copy.classList.toggle("copied", ok);
      setTimeout(() => { copy.textContent = "コピーする"; copy.classList.remove("copied"); }, 2000);
    });
    row.append(copy);
    card.append(row);
    resultsEl.append(card);
  }
}

// ---------- 画像の読み込み（1回だけ開いて縮小版を作る） ----------
class ImageOpenError extends Error {}

async function loadDrawable(file) {
  // まず createImageBitmap、ダメなら <img> 経由（ブラウザ標準の画像デコーダを使う）
  try {
    return await createImageBitmap(file);
  } catch {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ImageOpenError("image open failed");
  } finally {
    // img が読み込んだ後は解放してよい
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function drawableSize(d) {
  return { w: d.naturalWidth || d.width, h: d.naturalHeight || d.height };
}

function makeVariants(drawable) {
  const { w, h } = drawableSize(drawable);
  const variants = [];
  const seen = new Set();
  for (const maxSide of [2400, 1600, 1000]) {
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const vw = Math.max(1, Math.round(w * scale));
    const vh = Math.max(1, Math.round(h * scale));
    const key = `${vw}x${vh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const canvas = document.createElement("canvas");
    canvas.width = vw; canvas.height = vh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(drawable, 0, 0, vw, vh);
    variants.push(ctx.getImageData(0, 0, vw, vh));
  }
  return variants;
}

// ---------- 各エンジン（すべて縮小済み ImageData / 描画済み画像で処理） ----------
async function tryBarcodeDetector(drawable) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(drawable);
    return codes.map((c) => c.rawValue).filter(Boolean);
  } catch { return []; }
}

async function tryZXing(variants) {
  try {
    await initZXing();
    for (const img of variants) {
      const results = await readBarcodesFromImageData(img, {
        tryHarder: true,
        formats: ["QRCode", "MicroQRCode", "RMQRCode"],
        maxNumberOfSymbols: 10,
      });
      const texts = results.map((r) => r.text).filter(Boolean);
      if (texts.length) return texts;
    }
  } catch {}
  return [];
}

function tryJsQR(variants) {
  if (typeof window.jsQR !== "function") return [];
  try {
    for (const img of variants) {
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) return [code.data];
    }
  } catch {}
  return [];
}

// ---------- メイン処理 ----------
let decoding = false;
let lastObjectUrl = null;
async function decodeFile(file) {
  if (!file) return;
  if (decoding) { setStatus("前の画像を読み取り中です…", true); return; }
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || "")) {
    setStatus("画像ファイルを選んでください。");
    return;
  }
  decoding = true;
  resultsEl.innerHTML = "";
  setStatus("読み取り中…（画像は端末外に送信されません）", true);
  try {
    // プレビュー
    const wrap = $("#previewWrap");
    const prev = $("#preview");
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(file);
    prev.src = lastObjectUrl;
    wrap.style.display = "block";

    let drawable;
    try {
      drawable = await loadDrawable(file);
    } catch (e) {
      if (e instanceof ImageOpenError) {
        setStatus("この画像を開けませんでした。対応していない形式（HEIC等）の可能性があります。スクリーンショットや JPEG/PNG で試してください。");
        return;
      }
      throw e;
    }
    const variants = makeVariants(drawable);

    const found = [];
    const seen = new Set();
    const engines = [];
    const add = (arr, label) => {
      let added = false;
      for (const t of arr) if (!seen.has(t)) { seen.add(t); found.push(t); added = true; }
      if (added && !engines.includes(label)) engines.push(label);
    };

    add(await tryZXing(variants), "ZXing");
    add(await tryBarcodeDetector(drawable), "BarcodeDetector");
    if (!found.length) add(tryJsQR(variants), "jsQR");
    drawable.close?.();

    if (found.length) {
      setStatus(`読み取れました（${found.length}件）`);
      showResults(found, engines.join("＋"));
    } else {
      setStatus("QRコードが見つかりませんでした。下の「うまく読めないとき」を試してみてください。");
    }
  } catch {
    setStatus("読み取り中にエラーが起きました。別の画像で試してください。");
  } finally {
    decoding = false;
  }
}

// ---------- 入力経路 ----------
$("#pickBtn").addEventListener("click", () => fileEl.click());
$("#drop").addEventListener("click", () => fileEl.click());
$("#drop").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileEl.click(); }
});
fileEl.addEventListener("change", () => { if (fileEl.files?.[0]) decodeFile(fileEl.files[0]); fileEl.value = ""; });

window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) { e.preventDefault(); decodeFile(file); return; }
    }
  }
});

const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) decodeFile(file);
});

$("#pasteBtn").addEventListener("click", async () => {
  if (!navigator.clipboard?.read) {
    setStatus("このブラウザではボタンからの貼り付けが使えません。画像を写真に保存して「画像を選ぶ・撮る」から開くか、パソコンでは画像をコピーして Ctrl+V で貼ってください。");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith("image/"));
      if (imgType) {
        const blob = await item.getType(imgType);
        decodeFile(new File([blob], "clipboard.png", { type: imgType }));
        return;
      }
    }
    setStatus("クリップボードに画像がありませんでした。先に画像をコピーしてください。");
  } catch {
    setStatus("クリップボードを読めませんでした。iPhoneでは、ボタンを押した後に出る「ペースト」の吹き出しをタップしてください。それでもダメなら、画像を写真に保存して「画像を選ぶ・撮る」から開いてください。");
  }
});

// ---------- PWA ----------
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.ready
      .then(() => { const el = $("#offlineReady"); if (el) el.style.display = "block"; })
      .catch(() => {});
  });
}
