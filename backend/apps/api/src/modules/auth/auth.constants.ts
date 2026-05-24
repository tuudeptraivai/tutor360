export const VERIFY_TOKEN_REPOSITORY = Symbol('VERIFY_TOKEN_REPOSITORY');

export const VERIFY_TOKEN_BYTES = 32;
// base64url(32 bytes) ≈ 43 ký tự; min 32 đủ để chặn typo mà vẫn nhận token hợp lệ.
export const VERIFY_TOKEN_MIN_LENGTH = 32;
