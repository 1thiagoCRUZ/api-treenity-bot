import crypto from 'crypto';
import { requireEnv } from '../config/env.js';

const algorithm = 'aes-256-cbc';
// A chave precisa ter 32 caracteres (256 bits)
// Garantimos que ela tem 32 bytes usando um hash caso a string fornecida seja menor/maior
const keyString = requireEnv('ENCRYPTION_KEY');
const key = crypto.createHash('sha256').update(String(keyString)).digest('base64').substring(0, 32);

export function encrypt(text) {
    if (!text) return text;
    // Cria um vetor de inicialização aleatório de 16 bytes
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Retorna o IV e o texto criptografado em hex, separados por um ':'
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    
    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedData = Buffer.from(textParts.join(':'), 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString();
    } catch (error) {
        console.error('Erro ao descriptografar mensagem:', error.message);
        return '[Mensagem não pôde ser descriptografada]';
    }
}
