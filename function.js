// 阿里云ESA-pages関数エントリファイル
// Web Crypto APIを使用してNode.js cryptoモジュールを置き換え

// 環境変数設定
const ADDRESS = process.env.ADDRESS || '';
const TOKEN = process.env.TOKEN || '';
const WORKER_ADDRESS = process.env.WORKER_ADDRESS || '';
const DISABLE_SIGN = process.env.DISABLE_SIGN === 'true';

// Base64安全エンコード（Uint8Array処理）
function safeBase64(uint8Array) {
    let binary = '';
    const bytes = new Uint8Array(uint8Array);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// HMAC-SHA256署名計算（Web Crypto API使用）
async function hmacSHA256(data, key) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(data);
    
    // 鍵のインポート
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        {
            name: 'HMAC',
            hash: 'SHA-256'
        },
        false,
        ['sign']
    );
    
    // HMAC計算
    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        messageData
    );
    
    return new Uint8Array(signature);
}

// 署名検証
async function verifySignature(path, providedSign) {
    if (DISABLE_SIGN) {
        return true;
    }

    try {
        const [signature, expireTimeStamp] = providedSign.split(':');
        const currentTime = Math.floor(Date.now() / 1000);
        
        // タイムスタンプ有効期限チェック（10分間有効）
        if (parseInt(expireTimeStamp) < currentTime) {
            console.log('署名が期限切れです');
            return false;
        }

        const to_sign = `${path}:${expireTimeStamp}`;
        const hmacResult = await hmacSHA256(to_sign, TOKEN);
        const calculated_sign = safeBase64(hmacResult);
        
        return calculated_sign === signature;
    } catch (error) {
        console.log('署名検証エラー:', error.message);
        return false;
    }
}

// メインハンドラ関数
exports.handler = async (request, response, context) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const sign = url.searchParams.get('sign');

    console.log('リクエスト受信:', { path, sign });

    // 署名検証
    if (!(await verifySignature(path, sign))) {
        response.setStatusCode(403);
        response.setHeader('Content-Type', 'text/plain');
        response.send('署名検証失敗');
        return;
    }

    try {
        // 組み込みfetch関数を使用（阿里云ESA-pages提供）
        const apiResponse = await fetch(`${ADDRESS}/api/fs/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ path })
        });

        if (!apiResponse.ok) {
            throw new Error(`APIリクエスト失敗: ${apiResponse.status}`);
        }

        const fileInfo = await apiResponse.json();
        
        if (!fileInfo || !fileInfo.data || !fileInfo.data.url) {
            response.setStatusCode(404);
            response.send('ファイルが存在しません');
            return;
        }

        // 実際のファイルURLに転送
        const fileResponse = await fetch(fileInfo.data.url, {
            headers: fileInfo.data.headers || {}
        });

        if (!fileResponse.ok) {
            response.setStatusCode(fileResponse.status);
            response.send('ファイルダウンロード失敗');
            return;
        }

        // ファイル内容を返す
        const fileData = await fileResponse.arrayBuffer();
        
        response.setStatusCode(fileResponse.status);
        response.setHeader('Content-Type', fileResponse.headers.get('Content-Type') || 'application/octet-stream');
        response.setHeader('Content-Disposition', fileResponse.headers.get('Content-Disposition') || `attachment; filename="${path.split('/').pop()}"`);
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        
        response.send(fileData);

    } catch (error) {
        console.log('プロキシ処理エラー:', error.message);
        response.setStatusCode(500);
        response.send('サーバー内部エラー');
    }
};
