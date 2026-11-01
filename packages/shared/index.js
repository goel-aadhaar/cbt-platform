"use strict";

// Plain CommonJS with hand-written types, so neither app needs a build step
// for it: Nest require()s it at runtime and Next bundles it as-is.

/** What the platform calls a student's identifier, everywhere a person reads it. */
const REGISTRATION_NUMBER_LABEL = "Registration Number";

/**
 * The student sign-in form, in on-screen order. The login page renders these
 * labels and the credentials email prints them, so a student never has to
 * work out which value goes in which box. `key` is the field's name in the
 * `POST /auth/student/login` body.
 */
const STUDENT_LOGIN_FIELDS = Object.freeze([
  Object.freeze({
    key: "instituteSlug",
    label: "Institute ID",
    placeholder: "e.g. sunrise-academy",
  }),
  Object.freeze({
    key: "rollNumber",
    label: REGISTRATION_NUMBER_LABEL,
    placeholder: "e.g. 2400183920",
  }),
  Object.freeze({
    key: "password",
    label: "Password",
    placeholder: "Enter your password",
  }),
]);

/** The staff sign-in form (`POST /auth/login`), in on-screen order. */
const STAFF_LOGIN_FIELDS = Object.freeze([
  Object.freeze({
    key: "email",
    label: "Email",
    placeholder: "you@institute.edu",
  }),
  Object.freeze({
    key: "password",
    label: "Password",
    placeholder: "Enter your password",
  }),
]);

function byKey(fields) {
  return Object.freeze(
    Object.fromEntries(fields.map((field) => [field.key, field])),
  );
}

const STUDENT_LOGIN_FIELD = byKey(STUDENT_LOGIN_FIELDS);
const STAFF_LOGIN_FIELD = byKey(STAFF_LOGIN_FIELDS);

/**
 * Word's Symbol font keeps its glyphs at positions that are ordinary letters in
 * any other font: "a" in Symbol IS alpha. Copied out of Word or a PDF they
 * arrive either as that plain letter or as a private-use character (U+F061),
 * which is how a pasted α turns into "a" or an empty box. Keyed by the byte the
 * font uses; a byte with no entry here is the same character in both.
 */
const SYMBOL_FONT = Object.freeze({
  0x22: "∀",
  0x24: "∃",
  0x27: "∋",
  0x2a: "∗",
  0x2d: "−",
  0x40: "≅",
  0x41: "Α",
  0x42: "Β",
  0x43: "Χ",
  0x44: "Δ",
  0x45: "Ε",
  0x46: "Φ",
  0x47: "Γ",
  0x48: "Η",
  0x49: "Ι",
  0x4a: "ϑ",
  0x4b: "Κ",
  0x4c: "Λ",
  0x4d: "Μ",
  0x4e: "Ν",
  0x4f: "Ο",
  0x50: "Π",
  0x51: "Θ",
  0x52: "Ρ",
  0x53: "Σ",
  0x54: "Τ",
  0x55: "Υ",
  0x56: "ς",
  0x57: "Ω",
  0x58: "Ξ",
  0x59: "Ψ",
  0x5a: "Ζ",
  0x5c: "∴",
  0x5e: "⊥",
  0x61: "α",
  0x62: "β",
  0x63: "χ",
  0x64: "δ",
  0x65: "ε",
  0x66: "φ",
  0x67: "γ",
  0x68: "η",
  0x69: "ι",
  0x6a: "ϕ",
  0x6b: "κ",
  0x6c: "λ",
  0x6d: "μ",
  0x6e: "ν",
  0x6f: "ο",
  0x70: "π",
  0x71: "θ",
  0x72: "ρ",
  0x73: "σ",
  0x74: "τ",
  0x75: "υ",
  0x76: "ϖ",
  0x77: "ω",
  0x78: "ξ",
  0x79: "ψ",
  0x7a: "ζ",
  0x7e: "∼",
  0xa2: "′",
  0xa3: "≤",
  0xa5: "∞",
  0xac: "←",
  0xad: "↑",
  0xae: "→",
  0xaf: "↓",
  0xb0: "°",
  0xb1: "±",
  0xb2: "″",
  0xb3: "≥",
  0xb4: "×",
  0xb5: "∝",
  0xb6: "∂",
  0xb7: "•",
  0xb8: "÷",
  0xb9: "≠",
  0xba: "≡",
  0xbb: "≈",
  0xbc: "…",
  0xc4: "⊗",
  0xc5: "⊕",
  0xc6: "∅",
  0xc7: "∩",
  0xc8: "∪",
  0xc9: "⊃",
  0xca: "⊇",
  0xcc: "⊂",
  0xcd: "⊆",
  0xce: "∈",
  0xcf: "∉",
  0xd0: "∠",
  0xd1: "∇",
  0xd5: "∏",
  0xd6: "√",
  0xd7: "⋅",
  0xd9: "∧",
  0xda: "∨",
  0xdb: "⇔",
  0xdc: "⇐",
  0xdd: "⇑",
  0xde: "⇒",
  0xdf: "⇓",
  0xe5: "∑",
  0xf2: "∫",
});

/** The real character for one byte of Word's Symbol font. */
function symbolFontChar(byte) {
  if (SYMBOL_FONT[byte]) return SYMBOL_FONT[byte];
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : undefined;
}

/**
 * Tidy characters that look fine in the source and go wrong after it: Symbol
 * font glyphs, invisible zero-width marks and soft hyphens (they break search
 * and matching), and non-breaking spaces. NFC rather than NFKC, because NFKC
 * would flatten H₂O to H2O and x² to x2.
 */
function normalizeSymbols(text) {
  return text
    .replace(
      /[\uF020-\uF0FF]/g,
      (c) => symbolFontChar(c.charCodeAt(0) - 0xf000) ?? c,
    )
    .replace(/[\u200B\u2060\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .normalize("NFC");
}

/**
 * Where maths sits in question text, as a RegExp source: `$$…$$`, `\(…\)`,
 * `\[…\]` and `$…$`, plus `\$` for a dollar the author wants shown as one.
 *
 * An inline `$…$` follows Pandoc's rule, so prices stay prices: the opening `$`
 * is followed by a non-space, the closing one follows a non-space other than a
 * backslash, and no digit comes straight after it. "A pen costs $5 and a book
 * costs $10" is text; `$x^2$` is still maths. Nor does it run across a line,
 * whether the break is still `\n` or already stored as `<br>`.
 *
 * The server stores and the browser renders by this one pattern: if they
 * disagreed, the sanitizer would strip formatting from text the renderer then
 * shows as text.
 */
const MATH_PATTERN = [
  String.raw`\\\$`,
  String.raw`\$\$[\s\S]+?\$\$`,
  String.raw`\\\([\s\S]+?\\\)`,
  String.raw`\\\[[\s\S]+?\\\]`,
  String.raw`\$(?!\s)(?:(?!<br)[^$\n])*?[^\s$\\]\$(?!\d)`,
].join("|");

module.exports = {
  MATH_PATTERN,
  REGISTRATION_NUMBER_LABEL,
  STUDENT_LOGIN_FIELDS,
  STUDENT_LOGIN_FIELD,
  STAFF_LOGIN_FIELDS,
  STAFF_LOGIN_FIELD,
  symbolFontChar,
  normalizeSymbols,
};
