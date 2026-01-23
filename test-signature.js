const crypto = require('crypto');

// 署名アルゴリズムテスト
function safeBase64(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function hmacSHA256(data, key) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest();
}

function generateSignature(path, token, expireTimeStamp) {
    const to_sign = `${path}:${expireTimeStamp}`;
    const _sign = safeBase64(hmacSHA256(to_sign, token));
    return `${_sign}:${expireTimeStamp}`;
}

function verifySignature(path, providedSign, token) {
    try {
        const [signature, expireTimeStamp] = providedSign.split(':');
        const currentTime = Math.floor(Date.now() / 1000);
        
        console.log('現在時刻:', currentTime);
        console.log('有効期限:', expireTimeStamp);
        
        if (parseInt(expireTimeStamp) < currentTime) {
            console.log('署名が期限切れです');
            return false;
        }

        const to_sign = `${path}:${expireTimeStamp}`;
        const calculated_sign = safeBase64(hmacSHA256(to_sign, token));
        
        console.log('計算された署名:', calculated_sign);
        console.log('提供された署名:', signature);
        
        return calculated_sign === signature;
    } catch (error) {
        console.log('署名検証エラー:', error.message);
        return false;
    }
}

// テストケース
const testPath = '/test/file.txt';
const testToken = 'test_token_123';
const expireTime = Math.floor(Date.now() / 1000) + 600; // 10分後に期限切れ

console.log('=== 署名生成テスト ===');
const signature = generateSignature(testPath, testToken, expireTime);
console.log('パス:', testPath);
console.log('トークン:', testToken);
console.log('生成された署名:', signature);

console.log('\n=== 署名検証テスト ===');
const isValid = verifySignature(testPath, signature, testToken);
console.log('署名検証結果:', isValid ? '✅ 成功' : '❌ 失敗');

console.log('\n=== 誤った署名テスト ===');
const wrongSignature = signature.replace('a', 'b'); // 署名を変更して誤りにする
const isWrongValid = verifySignature(testPath, wrongSignature, testToken);
console.log('誤った署名検証結果:', isWrongValid ? '✅ 成功' : '❌ 失敗');
