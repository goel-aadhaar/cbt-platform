import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Strip whitespace from both ends before a password is ever hashed or checked.
 *
 * A credential is usually delivered to its owner by being written down
 * somewhere — an email, a chat message, a handover note — and copied out of it.
 * Copying reliably picks up a trailing space, and a trailing space is
 * invisible. The sign-in that follows fails with "Invalid credentials", which
 * is true and completely unhelpful: the password on screen looks exactly right,
 * because it is, bar one character nobody can see. That cost a platform owner
 * on this deployment twenty minutes and two failed attempts before the request
 * bodies gave it away — 61 bytes from the browser against 60 from a known-good
 * client, one byte apart.
 *
 * Normalising in the one place that both hashes and verifies is what makes this
 * safe. If only sign-in trimmed, a password *set* with edge whitespace could
 * never be entered again; because both sides run the same function, the two can
 * never disagree. The cost is that a password cannot begin or end with a space
 * — no real loss, since no one chooses one deliberately and no one could type
 * it back reliably if they did.
 */
function normalize(plain: string): string {
  return plain.trim();
}

/**
 * Password hashing via argon2id (current OWASP-recommended algorithm).
 * @node-rs/argon2 ships prebuilt native binaries per platform — no compilation.
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(normalize(plain));
  }

  verify(hashed: string, plain: string): Promise<boolean> {
    return verify(hashed, normalize(plain));
  }
}
