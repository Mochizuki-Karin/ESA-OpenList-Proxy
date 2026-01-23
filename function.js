// 阿里云ESA-pages函数入口文件
const crypto = require('crypto');

// 环境变量设置
const ADDRESS = process.env.ADDRESS || '';
const TOKEN = process.env.TOKEN || '';
const WORKER_ADDRESS = process.env.WORKER_ADDRESS || '';
const DISABLE_SIGN = process.env.DISABLE_SIGN === 'true';

// Base64安全编码
function safeBase64(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// HMAC-SHA256签名计算
function hmacSHA256(data, key) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest();
}

// 签名验证
function verifySignature(path, providedSign) {
    if (DISABLE_SIGN) {
        return true;
    }

    try {
        const [signature, expireTimeStamp] = providedSign.split(':');
        const currentTime = Math.floor(Date.now() / 1000);
        
        // 时间戳过期检查（10分钟有效）
        if (parseInt(expireTimeStamp) < currentTime) {
            console.log('签名已过期');
            return false;
        }

        const to_sign = `${path}:${expireTimeStamp}`;
        const calculated_sign = safeBase64(hmacSHA256(to_sign, TOKEN));
        
        return calculated_sign === signature;
    } catch (error) {
        console.log('签名验证错误:', error.message);
        return false;
    }
}

// 主处理函数
exports.handler = async (request, response, context) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const sign = url.searchParams.get('sign');

    console.log('请求接收:', { path, sign });

    // 签名验证
    if (!verifySignature(path, sign)) {
        response.setStatusCode(403);
        response.setHeader('Content-Type', 'text/plain');
        response.send('签名验证失败');
        return;
    }

    try {
        // 使用内置fetch函数（阿里云ESA-pages提供）
        const apiResponse = await fetch(`${ADDRESS}/api/fs/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ path })
        });

        if (!apiResponse.ok) {
            throw new Error(`API请求失败: ${apiResponse.status}`);
        }

        const fileInfo = await apiResponse.json();
        
        if (!fileInfo || !fileInfo.data || !fileInfo.data.url) {
            response.setStatusCode(404);
            response.send('文件不存在');
            return;
        }

        // 转发到实际文件URL
        const fileResponse = await fetch(fileInfo.data.url, {
            headers: fileInfo.data.headers || {}
        });

        if (!fileResponse.ok) {
            response.setStatusCode(fileResponse.status);
            response.send('文件下载失败');
            return;
        }

        // 返回文件内容
        const fileData = await fileResponse.arrayBuffer();
        
        response.setStatusCode(fileResponse.status);
        response.setHeader('Content-Type', fileResponse.headers.get('Content-Type') || 'application/octet-stream');
        response.setHeader('Content-Disposition', fileResponse.headers.get('Content-Disposition') || `attachment; filename="${path.split('/').pop()}"`);
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        
        response.send(fileData);

    } catch (error) {
        console.log('代理处理错误:', error.message);
        response.setStatusCode(500);
        response.send('服务器内部错误');
    }
};
