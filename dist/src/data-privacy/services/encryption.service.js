"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EncryptionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = __importStar(require("crypto"));
let EncryptionService = EncryptionService_1 = class EncryptionService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EncryptionService_1.name);
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.saltLength = 64;
        this.tagLength = 16;
    }
    getEncryptionKey() {
        const key = this.configService.get('ENCRYPTION_KEY');
        if (!key) {
            this.logger.warn('ENCRYPTION_KEY not set, using default key (NOT FOR PRODUCTION)');
            return crypto.scryptSync('default-key-not-for-production', 'salt', this.keyLength);
        }
        return Buffer.from(key, 'hex');
    }
    getKeyId() {
        return this.configService.get('ENCRYPTION_KEY_ID', 'default-key-id');
    }
    async encrypt(data, algorithm = 'AES-256') {
        try {
            const key = this.getEncryptionKey();
            const iv = crypto.randomBytes(this.ivLength);
            const salt = crypto.randomBytes(this.saltLength);
            const dataString = typeof data === 'string' ? data : JSON.stringify(data);
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            let encrypted = cipher.update(dataString, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            const combined = Buffer.concat([
                salt,
                iv,
                authTag,
                Buffer.from(encrypted, 'hex'),
            ]);
            return {
                encrypted: combined.toString('base64'),
                encryptionKeyId: this.getKeyId(),
                encryptedAt: new Date(),
                algorithm,
            };
        }
        catch (error) {
            const err = error;
            this.logger.error(`Encryption failed: ${err.message}`, err.stack);
            throw new Error(`Failed to encrypt data: ${err.message}`);
        }
    }
    async decrypt(encryptedData) {
        try {
            const key = this.getEncryptionKey();
            const combined = Buffer.from(encryptedData.encrypted, 'base64');
            const salt = combined.slice(0, this.saltLength);
            const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
            const authTag = combined.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
            const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, undefined, 'utf8');
            decrypted += decipher.final('utf8');
            try {
                return JSON.parse(decrypted);
            }
            catch {
                return decrypted;
            }
        }
        catch (error) {
            const err = error;
            this.logger.error(`Decryption failed: ${err.message}`, err.stack);
            throw new Error(`Failed to decrypt data: ${err.message}`);
        }
    }
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
};
exports.EncryptionService = EncryptionService;
exports.EncryptionService = EncryptionService = EncryptionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EncryptionService);
//# sourceMappingURL=encryption.service.js.map