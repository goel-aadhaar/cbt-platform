import Image from "next/image";
import { Marcellus } from "next/font/google";

const marcellus = Marcellus({ weight: "400", subsets: ["latin"] });

const BADGES = [
  {
    icon: "/login/badge-nta-style-cbt.png",
    w: 29,
    h: 26,
    lines: ["NTA-Style", "CBT"],
  },
  {
    icon: "/login/badge-exam-day-ready.png",
    w: 25,
    h: 29,
    lines: ["Exam-Day", "Ready"],
  },
  {
    icon: "/login/badge-secure-attempts.png",
    w: 23,
    h: 27,
    lines: ["Secure", "Attempts"],
  },
  {
    icon: "/login/badge-detailed-analysis.png",
    w: 26,
    h: 26,
    lines: ["Detailed", "Analysis"],
  },
] as const;

/**
 * The sign-in page's brand panel.
 *
 * At lg and up it is the right half of a screen that never scrolls: the
 * illustration's box is sized from whatever height the heading and badges
 * leave (a size container, `cqh`), so a short window shrinks the picture
 * instead of pushing the badges off-screen. Below lg it is an ordinary
 * full-width section under the form, and the page scrolls.
 */
export function LoginBanner() {
  return (
    <section className="relative flex flex-col overflow-hidden bg-[#17536d] px-6 py-10 text-white sm:px-12 sm:py-12 lg:min-h-0 lg:flex-1 lg:px-12 lg:pb-[60px] lg:pt-[72px] xl:px-[60px] [@media(max-height:720px)]:lg:pb-8 [@media(max-height:720px)]:lg:pt-10">
      <div className="text-center lg:text-left">
        <h2 className={`${marcellus.className} leading-none`}>
          <span className="block text-[32px] sm:text-[42px] lg:text-[clamp(32px,3.75vw,48px)]">
            India&rsquo;s Trusted
          </span>
          <span className="block text-[24px] sm:text-[32px] lg:text-[clamp(26px,2.9vw,37px)]">
            Examination Infrastructure
          </span>
        </h2>
        <p className="mx-auto mt-3 max-w-[480px] text-base leading-6 text-white/95 sm:text-lg lg:mx-0 lg:mt-2 lg:text-[clamp(15px,1.5vw,19px)] lg:leading-[1.2]">
          Secure, reliable, and purpose-built for high-stakes digital
          assessments.
        </p>
      </div>

      <div className="my-8 flex justify-center lg:my-6 lg:min-h-0 lg:flex-1 lg:items-center lg:justify-start lg:[container-type:size]">
        <div className="relative aspect-[417/277] w-full max-w-[360px] sm:max-w-[420px] lg:w-[min(417px,100cqw,calc(100cqh*417/277))] lg:max-w-none">
          <Image
            src="/login/circle.png"
            alt=""
            width={255}
            height={255}
            loading="eager"
            unoptimized
            className="absolute left-[14.39%] top-0 h-auto w-[61.15%]"
          />
          <span className="absolute left-[19.42%] top-[22.38%] aspect-square w-[2.88%] rounded-full border border-white/80" />
          <span className="absolute left-[21.58%] top-[32.13%] aspect-square w-[5.04%] rounded-full border border-white/80" />
          <Image
            src="/login/student.png"
            alt="A student taking an online examination"
            width={417}
            height={277}
            priority
            className="absolute inset-0 h-full w-full"
          />
          {/* The two PNGs already carry their white ring. Their names are the
              other way round from what they show: float-list.png is the
              document, float-doc.png the starred list. */}
          <Image
            src="/login/float-list.png"
            alt=""
            width={43}
            height={42}
            loading="eager"
            unoptimized
            className="absolute left-[75.3%] top-[3.97%] h-auto w-[10.07%]"
          />
          <Image
            src="/login/float-doc.png"
            alt=""
            width={45}
            height={45}
            loading="eager"
            unoptimized
            className="absolute left-[79.14%] top-[22.38%] h-auto w-[10.55%]"
          />
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
        {BADGES.map((badge) => (
          <li
            key={badge.icon}
            className="flex items-center gap-2.5 rounded-[2px] border border-white/90 px-3 py-2 lg:gap-1.5 lg:px-2 lg:py-1.5 xl:gap-2.5 xl:px-2.5"
          >
            <Image
              src={badge.icon}
              alt=""
              width={badge.w}
              height={badge.h}
              unoptimized
              className="h-[26px] w-auto shrink-0 lg:h-5 xl:h-[26px]"
            />
            <span className="text-[13px] font-medium uppercase leading-4 lg:text-[10.5px] lg:leading-[13px] xl:text-[13px] xl:leading-4 2xl:text-sm 2xl:leading-[17px]">
              {badge.lines[0]}
              <br />
              {badge.lines[1]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
