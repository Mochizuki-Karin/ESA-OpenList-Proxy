# OpenList Proxy Server for ESA-pages

これは阿里雲ESA-pages向けに設計されたOpenListプロキシサーバーで、サーバートラフィック制限の問題を解決します。

## 機能特徴

- ✅ 署名検証（HMAC-SHA256）
- ✅ ファイルプロキシダウンロード
- ✅ CORSサポート
- ✅ 環境変数設定
- ✅ エラーハンドリング

## 環境変数設定

ESA-pagesで以下の環境変数を設定する必要があります：

| 変数名 | 説明 | 例 |
|--------|------|--------|
| `ADDRESS` | OpenListサーバーアドレス | `https://your-openlist-server.com` |
| `TOKEN` | 管理者トークン（OpenList管理ページから取得） | `your_admin_token_here` |
| `WORKER_ADDRESS` | プロキシサーバーアドレス（オプション） | `https://your-worker.esa-pages.com` |
| `DISABLE_SIGN` | 署名検証を無効化するか（true/false） | `false` |

## デプロイ手順

1. 本プロジェクトのコードをESA-pagesにアップロード
2. ESA-pagesコンソールで環境変数を設定
3. アプリケーションをデプロイ

## 使用方法

OpenListクライアントでプロキシURLをESA-pagesアドレスに設定：

```
https://your-esa-pages-domain.com/{path}?sign={signature}
```

署名生成例（JavaScript）：
```javascript
const crypto = require('crypto');

function safeBase64(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateSignature(path, token) {
    const expireTimeStamp = Math.floor(Date.now() / 1000) + 600; // 10分有効
    const to_sign = `${path}:${expireTimeStamp}`;
    const hmac = crypto.createHmac('sha256', token);
    hmac.update(to_sign);
    const _sign = safeBase64(hmac.digest());
    return `${_sign}:${expireTimeStamp}`;
}

// 使用例
const path = '/path/to/file.txt';
const token = 'your_admin_token';
const sign = generateSignature(path, token);
const proxyUrl = `https://your-esa-pages-domain.com${path}?sign=${sign}`;
```

## 注意事項

1. TOKENを安全に保管し、漏洩しないようにしてください
2. 署名の有効期限は10分です。必要に応じて調整できます
3. CORS問題が発生した場合、ESA-pagesのクロスオリジン設定を確認してください
4. 本番環境ではセキュリティのためにDISABLE_SIGN=falseを維持することを推奨します

## トラブルシューティング

- **403エラー**: 署名検証失敗、TOKENと署名アルゴリズムを確認
- **404エラー**: ファイルが存在しないかパスが間違っています
- **500エラー**: サーバー内部エラー、ログを確認
