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
    placeholder: "e.g. 2601000042",
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

module.exports = {
  REGISTRATION_NUMBER_LABEL,
  STUDENT_LOGIN_FIELDS,
  STUDENT_LOGIN_FIELD,
  STAFF_LOGIN_FIELDS,
  STAFF_LOGIN_FIELD,
};
