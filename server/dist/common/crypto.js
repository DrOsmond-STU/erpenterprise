"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptField = encryptField;
exports.decryptField = decryptField;
/**
 * Enkripsi kolom rahasia (K-41): AES-256-GCM, format `v1:<base64(iv | tag | ciphertext)>`.
 * Kunci = SHA-256(DATA_ENCRYPTION_KEY), atau diturunkan dari JWT_SECRET bila belum disetel.
 */
const node_crypto_1 = require("node:crypto");
const config_js_1 = require("../config.js");
let key = null;
const dataKey = () => {
    if (!key) {
        const cfg = (0, config_js_1.loadConfig)();
        key = (0, node_crypto_1.createHash)('sha256').update(cfg.DATA_ENCRYPTION_KEY ?? `erp-data-key:${cfg.JWT_SECRET}`).digest();
    }
    return key;
};
function encryptField(plain) {
    if (plain === null || plain === undefined || plain === '')
        return null;
    const iv = (0, node_crypto_1.randomBytes)(12);
    const c = (0, node_crypto_1.createCipheriv)('aes-256-gcm', dataKey(), iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
}
function decryptField(enc) {
    if (!enc)
        return null;
    if (!enc.startsWith('v1:'))
        throw new Error('Format data terenkripsi tidak dikenal');
    const raw = Buffer.from(enc.slice(3), 'base64');
    const d = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', dataKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
//# sourceMappingURL=crypto.js.map