"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cryptoStorage = exports.CryptoStorage = void 0;
const electron_1 = require("electron");
const logger_1 = require("./logger");
/**
 * 使用 Electron safeStorage 对敏感字符串做本机加密。
 * - 生产环境：走 OS keychain（Win: DPAPI / macOS: Keychain / Linux: kwallet/libsecret），密文绑定当前用户账户，换机/换用户都解不出。
 * - 不可用时回退到 base64（仅掩盖，不是加密）。
 *
 * 存储格式："enc:" + base64(密文) / "raw:" + base64(明文)
 */
const PREFIX_ENC = 'enc:';
const PREFIX_RAW = 'raw:';
class CryptoStorage {
    available = false;
    warned = false;
    constructor() {
        try {
            this.available = electron_1.safeStorage.isEncryptionAvailable();
            if (!this.available) {
                logger_1.logger.warn('[CryptoStorage] safeStorage 不可用，回退到 base64 编码（非加密）');
            }
        }
        catch {
            this.available = false;
        }
    }
    encrypt(plain) {
        if (plain == null)
            return '';
        if (!this.available) {
            if (!this.warned) {
                logger_1.logger.warn('[CryptoStorage] 使用 base64 回退存储');
                this.warned = true;
            }
            return PREFIX_RAW + Buffer.from(plain, 'utf8').toString('base64');
        }
        try {
            const buf = electron_1.safeStorage.encryptString(plain);
            return PREFIX_ENC + buf.toString('base64');
        }
        catch (err) {
            logger_1.logger.error('[CryptoStorage] encrypt failed: ' + err);
            return PREFIX_RAW + Buffer.from(plain, 'utf8').toString('base64');
        }
    }
    decrypt(stored) {
        if (!stored)
            return '';
        if (stored.startsWith(PREFIX_ENC)) {
            const b64 = stored.slice(PREFIX_ENC.length);
            try {
                return electron_1.safeStorage.decryptString(Buffer.from(b64, 'base64'));
            }
            catch (err) {
                logger_1.logger.error('[CryptoStorage] decrypt failed: ' + err);
                return '';
            }
        }
        if (stored.startsWith(PREFIX_RAW)) {
            try {
                return Buffer.from(stored.slice(PREFIX_RAW.length), 'base64').toString('utf8');
            }
            catch {
                return '';
            }
        }
        // 兼容旧数据（未加密明文）
        return stored;
    }
}
exports.CryptoStorage = CryptoStorage;
exports.cryptoStorage = new CryptoStorage();
//# sourceMappingURL=crypto-storage.js.map