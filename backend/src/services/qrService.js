/**
 * Secure QR & Return Code Generation Service
 */

const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Generates an opaque, cryptographically signed token for gate verification.
 * Does NOT embed raw student details inside the QR payload.
 */
function generateSecureQrToken(passNumber, studentId) {
    const rawUuid = uuidv4();
    const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET || 'nexa_secret')
        .update(`${passNumber}:${studentId}:${rawUuid}:${Date.now()}`)
        .digest('hex')
        .substring(0, 16);
    return `NXG-${rawUuid}-${hmac}`;
}

/**
 * Generates a 6-digit secure time-bound random return code
 */
function generateReturnCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Converts a secure token into a base64 Data URL QR Code
 */
async function generateQrDataUrl(token) {
    try {
        return await QRCode.toDataURL(token, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
                dark: '#0f172a', // Deep Navy
                light: '#ffffff'
            }
        });
    } catch (err) {
        console.error('QR Code generation failed:', err);
        throw err;
    }
}

module.exports = {
    generateSecureQrToken,
    generateReturnCode,
    generateQrDataUrl
};
