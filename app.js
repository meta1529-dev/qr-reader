import { readBarcodes, prepareZXingModule } from "./vendor/zxing/es/reader/index.js";
import { WASM_B64 } from "./vendor/zxing-wasm-data.js";

// ZXing WASM はこのサイト内に Base64 で同梱したものを端末内で復元して使う。
// 外部CDN・外部サーバーには一切アクセスしない。
function wasmBytes() {
  const bin = atob(WASM_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
prepareZXingModule({ overrides: { wasmBinary: wasmBytes() } });

const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
const resultsEl = $("#results");
const fileEl = $("#file");

function setStatus(msg, busy = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("busy", busy);
}

function classify(text) {
  if (/^https?:\/\//i.test(text)) {
    let host = "";
    try { host = new URL(text).hostname; } catch {}
    return { kind: "URL", url: text, host };
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
      host.textContent = `リンク先のドメイン: ${info.host} — 心当たりのあるサイトか確認してから開いてください`;
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
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "コピーしました ✓";
        copy.classList.add("copied");
        setTimeout(() => { copy.textContent = "コピーする"; copy.classList.remove("copied"); }, 2000);
      } catch {
        // フォールバック: 選択して手動コピー
        const ta = document.createElement("textarea");
        ta.value = text; document.body.append(ta); ta.select();
        document.execCommand("copy"); ta.remove();
        copy.textContent = "コピーしました ✓";
      }
    });
    row.append(copy);
    card.append(row);
    resultsEl.append(card);
  }
}

// ---------- 画像の読み込み ----------
async function fileToImageDataVariants(file) {
  const bmp = await createImageBitmap(file);
  const variants = [];
  const maxSides = [2400, 1600, 1000];
  const seen = new Set();
  for (const maxSide of maxSides) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const key = `${w}x${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    variants.push(ctx.getImageData(0, 0, w, h));
  }
  bmp.close?.();
  return variants;
}

// ---------- 各エンジン ----------
async function tryBarcodeDetector(file) {
  if (!("BarcodeDetector" in window)) return [];
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const bmp = await createImageBitmap(file);
    const codes = await detector.detect(bmp);
    bmp.close?.();
    return codes.map((c) => c.rawValue).filter(Boolean);
  } catch { return []; }
}

async function tryZXing(file) {
  try {
    const results = await readBarcodes(file, {
      tryHarder: true,
      maxNumberOfSymbols: 10,
    });
    return results.map((r) => r.text).filter(Boolean);
  } catch { return []; }
}

async function tryJsQR(file) {
  if (typeof window.jsQR !== "function") return [];
  try {
    const variants = await fileToImageDataVariants(file);
    for (const img of variants) {
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) return [code.data];
    }
  } catch {}
  return [];
}

// ---------- メイン処理 ----------
let decoding = false;
async function decodeFile(file) {
  if (!file || decoding) return;
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || "")) {
    setStatus("画像ファイルを選んでください。");
    return;
  }
  decoding = true;
  resultsEl.innerHTML = "";
  setStatus("読み取り中…（画像は端末外に送信されません）", true);

  const wrap = $("#previewWrap");
  const prev = $("#preview");
  const objUrl = URL.createObjectURL(file);
  prev.src = objUrl;
  wrap.style.display = "block";

  const found = [];
  const seen = new Set();
  const add = (arr) => { for (const t of arr) if (!seen.has(t)) { seen.add(t); found.push(t); } };

  add(await tryBarcodeDetector(file));
  let engine = found.length ? "BarcodeDetector" : "";
  if (!found.length) {
    add(await tryZXing(file));
    engine = found.length ? "ZXing" : "";
  }
  if (!found.length) {
    add(await tryJsQR(file));
    engine = found.length ? "jsQR" : "";
  }

  decoding = false;
  if (found.length) {
    setStatus(`読み取れました（${found.length}件）`);
    showResults(found, engine);
  } else {
    setStatus("QRコードが見つかりませんでした。下の「うまく読めないとき」を試してみてください。");
  }
}

// ---------- 入力経路 ----------
$("#pickBtn").addEventListener("click", () => fileEl.click());
$("#drop").addEventListener("click", () => fileEl.click());
$("#drop").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileEl.click(); });
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
    setStatus("このブラウザではボタンからの貼り付けが使えません。画像をコピーしてから、このページで貼り付け（Ctrl+V／長押しでペースト）してみてください。");
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
    setStatus("クリップボードを読めませんでした。画像をコピーした状態で、このページに貼り付けしてみてください。");
  }
});

// ---------- PWA ----------
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
