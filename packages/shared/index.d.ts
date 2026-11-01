export declare const REGISTRATION_NUMBER_LABEL: "Registration Number";

export interface LoginField<K extends string = string> {
  /** The field's name in the login request body. */
  readonly key: K;
  /** Exactly what the login page shows, and what the credentials email prints. */
  readonly label: string;
  readonly placeholder: string;
}

export type StudentLoginKey = "instituteSlug" | "rollNumber" | "password";
export type StaffLoginKey = "email" | "password";

export declare const STUDENT_LOGIN_FIELDS: readonly [
  LoginField<"instituteSlug">,
  LoginField<"rollNumber">,
  LoginField<"password">,
];
export declare const STUDENT_LOGIN_FIELD: {
  readonly [K in StudentLoginKey]: LoginField<K>;
};

export declare const STAFF_LOGIN_FIELDS: readonly [
  LoginField<"email">,
  LoginField<"password">,
];
export declare const STAFF_LOGIN_FIELD: {
  readonly [K in StaffLoginKey]: LoginField<K>;
};

/** The real character for one byte of Word's Symbol font, if it has one. */
export declare function symbolFontChar(byte: number): string | undefined;

/** Repair Symbol-font glyphs and drop invisible characters; NFC-normalised. */
export declare function normalizeSymbols(text: string): string;
