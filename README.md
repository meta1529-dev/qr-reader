# QRリーダー（画像から）

写真・スクリーンショット・クリップボードに貼り付けた画像から QR コードを読み取り、リンクや文字列を表示する静的サイトです。

## プライバシー

- 画像は **端末の外に送信されません**。デコードはすべてブラウザ内（端末上）で完結します。
- 外部 CDN へもアクセスしません。デコード用ライブラリと WASM はこのリポジトリ内に同梱し、CSP（Content-Security-Policy）でも外部通信を禁止しています。このページ自体のファイルを GitHub Pages から読み込む以外の通信はしません。
- 同梱ライブラリのライセンスとバージョン・ハッシュは `vendor/THIRD-PARTY.md` に記載しています。
- 読み取り結果は保存されません（ページを閉じれば消えます）。

## 使い方

- パソコン: 画像をコピーして Ctrl+V で貼り付け／画像ファイルをドラッグ&ドロップ／ファイル選択
- スマホ: 「画像を選ぶ・撮る」から写真を選択
- 結果が URL の場合は、ドメインを確認してから「リンクを開く」

## iPhone でアプリのように使う

Safari で開く → 共有ボタン →「ホーム画面に追加」。追加したあと、ホーム画面のアイコンから一度オンラインで開くと、以後オフラインでも動きます（PWA）。

## 技術構成

- ZXing-C++ の WebAssembly 版 [zxing-wasm](https://github.com/Sec-ant/zxing-wasm)（MIT / Apache-2.0）— メインエンジン。WASM 本体は Base64 文字列として `vendor/zxing-wasm-data.js` に同梱し、端末内で復元して使う（同梱にあたり、ライブラリ側のデフォルトCDN参照先も除去済み）
- [jsQR](https://github.com/cozmo/jsQR)（Apache-2.0）— フォールバック
- 対応ブラウザでは標準 API の BarcodeDetector も併用
- 参考: ファイル読み取りを端末内で完結させる方式は [html5-qrcode](https://github.com/mebjas/html5-qrcode) / ScanApp 系と同じ考え方

すべて静的ファイルのみで、GitHub Pages でホストしています。
