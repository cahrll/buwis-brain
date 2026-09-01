import Link from "next/link";

const NAV_BASE =
  "flex flex-1 items-center justify-center rounded-strip border-3 border-signboard-ink px-2.5 py-2 font-condensed text-base font-semibold uppercase tracking-label no-underline shadow-strip-hang road:flex-none road:px-5";

export function Chrome({ active }: { active: "ask" | "corpus" }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-[900px] flex-col items-stretch gap-4 road:flex-row">
        <div className="flex flex-1 flex-wrap items-baseline gap-4 rounded-board border-3 border-signboard-ink bg-enamel-yellow px-4 py-3 shadow-topboard-hang inset-shadow-enamel-cream road:px-[22px] road:py-3.5">
          <h1 className="font-slab text-[1.3rem] leading-none tracking-brand text-route-blue text-shadow-brand road:text-[1.6rem]">
            BUWIS-BRAIN
          </h1>
          <p className="font-condensed text-[0.72rem] leading-[1.3] font-semibold uppercase tracking-strap-tight text-yellow-shade road:tracking-strap">
            Answers you can hold on to
          </p>
        </div>
        <nav className="flex gap-2.5" aria-label="Screens">
          <Link
            href="/"
            aria-current={active === "ask" ? "page" : undefined}
            className={`${NAV_BASE} ${
              active === "ask"
                ? "bg-enamel-yellow text-signboard-ink inset-shadow-enamel-cream-thin"
                : "bg-enamel-white text-route-blue hover:bg-butter-wash"
            }`}
          >
            Ask
          </Link>
          <Link
            href="/upload"
            aria-current={active === "corpus" ? "page" : undefined}
            className={`${NAV_BASE} ${
              active === "corpus"
                ? "bg-enamel-yellow text-signboard-ink inset-shadow-enamel-cream-thin"
                : "bg-enamel-white text-route-blue hover:bg-butter-wash"
            }`}
          >
            Corpus
          </Link>
        </nav>
      </header>
      <p className="mx-auto mt-3.5 w-full max-w-[560px] rounded-control border-3 border-route-blue bg-enamel-white px-4 py-[7px] text-center font-condensed text-[0.95rem] leading-[1.3] font-bold uppercase tracking-route text-route-blue shadow-route-hang">
        BIR &middot; SSS &middot; PhilHealth &middot; Pag-IBIG
      </p>
    </>
  );
}

export function Reminder() {
  return (
    <p className="mx-auto mt-[26px] max-w-[900px] text-center text-[0.84rem] leading-[1.6] font-medium italic text-dusk-text">
      <b className="font-bold not-italic text-enamel-yellow">A reminder:</b> this is general
      guidance from official issuances, not tax advice. Confirm with the BIR or a licensed
      accountant before acting.
    </p>
  );
}

export function Plate({ n }: { n: number }) {
  return (
    <span className="mx-px inline-block h-[19px] min-w-[19px] rounded-full bg-route-blue text-center align-super text-[0.66rem] leading-[19px] font-bold text-white">
      {n}
    </span>
  );
}

export function BigPlate({ n }: { n: number }) {
  return (
    <span className="inline-block h-[30px] w-[30px] shrink-0 rounded-full bg-route-blue text-center text-[0.95rem] leading-[30px] font-bold text-white">
      {n}
    </span>
  );
}

export function Badge({ children, invert }: { children: React.ReactNode; invert?: boolean }) {
  return (
    <span
      className={`rounded-badge border-2 border-signboard-ink px-[9px] py-1 text-[0.72rem] leading-none font-bold whitespace-nowrap ${
        invert ? "bg-enamel-white text-signboard-ink" : "bg-enamel-yellow text-signboard-ink"
      }`}
    >
      {children}
    </span>
  );
}

export function RefusalSign() {
  return (
    <svg
      width="58"
      height="58"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="row-span-3 hidden road:block"
    >
      <circle cx="32" cy="32" r="27" fill="#fdfdf8" stroke="#1d1f24" strokeWidth="3" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#c8232a" strokeWidth="6" />
      <path d="M17 47 47 17" stroke="#c8232a" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
