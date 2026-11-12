# 同梱ライブラリとライセンス

このサイトは以下のオープンソースライブラリを同梱しています（外部CDNからは読み込みません）。

## zxing-wasm 3.1.6（reader）

- 出典: https://github.com/Sec-ant/zxing-wasm
- ライセンス: MIT — [licenses/zxing-wasm-MIT.txt](./licenses/zxing-wasm-MIT.txt)
- 中身の ZXing-C++ ライブラリは Apache License 2.0 — [licenses/ZXing-Cpp-Apache-2.0.txt](./licenses/ZXing-Cpp-Apache-2.0.txt)
- 同梱 WASM: `zxing_reader.wasm`（946,860 bytes）を Base64 化して `zxing-wasm-data.js` に収録
  - SHA-256: `5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e`
  - ライブラリ本体が持つ `ZXING_WASM_SHA256` 定数と一致することを確認済み（2026-11-13）
- 変更点: デフォルトの WASM 取得先（jsDelivr CDN）を指していた `share.js` 内の locateFile を、自前ホスト前提に書き換え済み。本サイトでは WASM を wasmBinary として直接渡すため、そもそも外部取得は行われません。

## jsQR 1.4.0

- 出典: https://github.com/cozmo/jsQR
- ライセンス: Apache License 2.0 — [licenses/jsQR-Apache-2.0.txt](./licenses/jsQR-Apache-2.0.txt)
- `vendor/jsQR.js` は公式 dist をそのまま同梱。
