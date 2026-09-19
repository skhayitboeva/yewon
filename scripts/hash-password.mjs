#!/usr/bin/env node
/**
 * Turns a plain password into the APP_PASSWORD_HASH value.
 *   npm run hash-password -- "my-password"
 */
import { scrypt as _scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

const password = process.argv[2];
if (!password) {
  console.error('사용법: npm run hash-password -- "비밀번호"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("비밀번호는 8자 이상으로 정하세요.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scrypt(password.normalize("NFKC"), salt, 64);

console.log("\n아래 줄을 Netlify 환경변수 APP_PASSWORD_HASH 에 그대로 넣으세요:\n");
console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}\n`);
