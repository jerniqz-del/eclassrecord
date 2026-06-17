/**
 * E-Class Record — Security and Cryptography Module
 *
 * Implements client-side Web Crypto PBKDF2 hashing and AES-256-GCM
 * data encryption for secure user profiles and passcode backups.
 */

/**
 * Converts a Uint8Array buffer to a hex string.
 */
function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string back to a Uint8Array buffer.
 */
function hexToBuf(hexString) {
  const numPairs = hexString.length / 2;
  const uint8 = new Uint8Array(numPairs);
  for (let i = 0; i < numPairs; i++) {
    uint8[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return uint8;
}

/**
 * Generates a random 8-byte hexadecimal salt.
 */
function generateSalt() {
  const arr = window.crypto.getRandomValues(new Uint8Array(8));
  return bufToHex(arr);
}

/**
 * Performs a SHA-256 hash on input text.
 */
async function sha256(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  return bufToHex(hashBuffer);
}

/**
 * Hashes a 6-digit PIN with a profile salt.
 */
async function hashPin(pin, salt) {
  return await sha256(pin + salt);
}

/**
 * Verifies if the entered PIN matches the stored hash.
 */
async function verifyPin(pin, salt, storedHash) {
  const candidateHash = await hashPin(pin, salt);
  return candidateHash === storedHash;
}

/**
 * Derives an AES-GCM key from a passcode using PBKDF2.
 */
async function deriveKey(pin, saltUint8) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltUint8,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a text payload using AES-256-GCM based on a passcode PIN.
 * @returns {object} Secure backup descriptor object containing hex-encoded components.
 */
async function encryptPayload(plainText, pin) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  
  const enc = new TextEncoder();
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(plainText)
  );
  
  return {
    secureBackup: true,
    salt: bufToHex(salt),
    iv: bufToHex(iv),
    ciphertext: bufToHex(ciphertextBuffer)
  };
}

/**
 * Decrypts an AES-256-GCM payload using a passcode PIN.
 * @returns {string} Plain text decrypted database JSON string.
 */
async function decryptPayload(encryptedObj, pin) {
  const salt = hexToBuf(encryptedObj.salt);
  const iv = hexToBuf(encryptedObj.iv);
  const ciphertext = hexToBuf(encryptedObj.ciphertext);
  
  const key = await deriveKey(pin, salt);
  
  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (e) {
    throw new Error("Incorrect PIN or corrupted backup file.");
  }
}
