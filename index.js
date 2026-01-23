import crypto from 'crypto';
import fetch from 'node-fetch';

// 環境変数設定（ESA-pagesで設定）
const ADDRESS = process.env.ADDRESS || ''; // OpenListサーバーアドレス
const TOKEN = process.env.TOKEN || ''; // 管理者トークン
const WORKER_ADDRESS = process.env.WORKER_ADDRESS || ''; // プロキシサーバーアドレス
const DISABLE_SIGN = process.env.DISABLE_SIGN === 'true'; // 署名検証を無効化するか

// Base64安全エンコード（+/を-_に置換、=を除去）
function safeBase64(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// HMAC-SHA256署名計算
function hmacSHA256(data, key) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest();
}

// 署名検証
function verifySignature(path, providedSign) {
    if (DISABLE_SIGN) {
        return true;
    }

    try {
        const [signature, expireTimeStamp] = providedSign.split(':');
        const currentTime = Math.floor(Date.now() / 1000);
        
        // タイムスタンプが期限切れかチェック（10分有効と仮定）
        if (parseInt(expireTimeStamp) < currentTime) {
            console.log('署名が期限切れです');
            return false;
        }

        const to_sign = `${path}:${expireTimeStamp}`;
        const calculated_sign = safeBase64(hmacSHA256(to_sign, TOKEN));
        
        return calculated_sign === signature;
    } catch (error) {
        console.log('署名検証エラー:', error.message);
        return false;
    }
}

// ファイルダウンロードリンク取得
async function getFileDownloadLink(path) {
    try {
        const response = await fetch(`${ADDRESS}/api/fs/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ path })
        });

        if (!response.ok) {
            throw new Error(`APIリクエスト失敗: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.log('ダウンロードリンク取得エラー:', error.message);
        throw error;
    }
}

// プロキシ処理関数
async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const sign = url.searchParams.get('sign');

    console.log('リクエスト受信:', { path, sign });

    // 署名検証
    if (!verifySignature(path, sign)) {
        return new Response('署名検証失敗', { status: 403 });
    }

    try {
        // ファイルダウンロード情報取得
        const fileInfo = await getFileDownloadLink(path);
        
        if (!fileInfo || !fileInfo.data || !fileInfo.data.url) {
            return new Response('ファイルが存在しません', { status: 404 });
        }

        // 実際のファイルURLにリクエスト転送
        const fileResponse = await fetch(fileInfo.data.url, {
            headers: fileInfo.data.headers || {}
        });

        if (!fileResponse.ok) {
            return new Response('ファイルダウンロード失敗', { status: fileResponse.status });
        }

        // ファイル内容を返す
        return new Response(fileResponse.body, {
            status: fileResponse.status,
            headers: {
                'Content-Type': fileResponse.headers.get('Content-Type') || 'application/octet-stream',
                'Content-Disposition': fileResponse.headers.get('Content-Disposition') || `attachment; filename="${path.split('/').pop()}"`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            }
        });

    } catch (error) {
        console.log('プロキシ処理エラー:', error.message);
        return new Response('サーバー内部エラー', { status: 500 });
    }
}

// ESA-pagesエントリ関数
export default async (request, context) => {
    // OPTIONSプリフライトリクエスト処理
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    // GETリクエストのみ許可
    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    return handleRequest(request);
};
