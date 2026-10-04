import { SUPPORT_CONTACT, telHref } from "@/lib/support-contact";

import { HeadsetIcon, LayersIcon, MailIcon } from "./login-icons";

const icon = "size-3.5 shrink-0 text-subtle";
const row = "flex items-center gap-2.5";
const text = "text-xs leading-4 text-muted";
const value = "font-bold text-ink hover:text-brand hover:underline";

/** Support contact and attribution under the sign-in form. */
export function LoginFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-2 border-t border-line pt-4 [@media(max-height:760px)]:gap-1.5 [@media(max-height:760px)]:pt-3 ${className}`}
    >
      <div className={row}>
        <HeadsetIcon className={icon} />
        <span className={text}>
          Technical Support:{" "}
          <a href={telHref(SUPPORT_CONTACT.phone)} className={value}>
            {SUPPORT_CONTACT.phone}
          </a>
          <span className="mx-1.5" aria-hidden="true">
            |
          </span>
          ({SUPPORT_CONTACT.hours})
        </span>
      </div>
      {SUPPORT_CONTACT.email && (
        <div className={row}>
          <MailIcon className={icon} />
          <span className={text}>
            Email:{" "}
            <a
              href={`mailto:${SUPPORT_CONTACT.email}`}
              className={`break-all ${value}`}
            >
              {SUPPORT_CONTACT.email}
            </a>
          </span>
        </div>
      )}
      <div className={row}>
        <LayersIcon className={icon} />
        <span className={text}>Powered by CodonMind CBT Engine</span>
      </div>
    </div>
  );
}
