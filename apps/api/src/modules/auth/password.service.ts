import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing via argon2id (current OWASP-recommended algorithm).
 * @node-rs/argon2 ships prebuilt native binaries per platform — no compilation.
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  verify(hashed: string, plain: string): Promise<boolean> {
    return verify(hashed, plain);
  }
}
