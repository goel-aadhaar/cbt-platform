import {
  BellIcon,
  ChevronDownIcon,
  HelpCircleIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "./icons";

export function AdminTopbar({ title }: { title: string }) {
  return (
    <header className="flex h-20 shrink-0 items-center gap-4 border-b border-admin-line bg-admin-bg px-8">
      <h1 className="text-xl font-bold text-admin-ink">{title}</h1>

      {/* Search */}
      <div className="relative mx-2 hidden max-w-md flex-1 items-center md:flex">
        <SearchIcon className="pointer-events-none absolute left-4 size-4 text-admin-subtle" />
        <input
          type="search"
          placeholder="Search students, exams, questions..."
          className="h-11 w-full rounded-full border border-admin-line bg-white pl-11 pr-14 text-sm text-admin-ink outline-none placeholder:text-admin-subtle focus:border-admin"
        />
        <kbd className="absolute right-3 rounded border border-admin-line bg-admin-bg px-1.5 py-0.5 text-[11px] font-semibold text-admin-subtle">
          ⌘ K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-admin-line bg-white px-4 py-2 text-sm font-semibold text-admin-ink hover:bg-white/70"
        >
          Session 2024-25
          <ChevronDownIcon className="size-4 text-admin-muted" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-admin px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusIcon className="size-4" />
          Quick Create
        </button>

        <div className="flex items-center gap-1 text-admin-muted">
          <IconButton label="Verified">
            <ShieldCheckIcon className="size-5" />
          </IconButton>
          <IconButton label="Notifications">
            <span className="relative">
              <BellIcon className="size-5" />
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-admin text-[10px] font-bold text-white">
                3
              </span>
            </span>
          </IconButton>
          <IconButton label="Help">
            <HelpCircleIcon className="size-5" />
          </IconButton>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-admin-line bg-white text-sm font-bold text-admin-ink">
            A
          </span>
          <span className="text-left leading-none">
            <span className="block text-sm font-bold text-admin-ink">
              Admin
            </span>
            <span className="block text-[11px] font-semibold tracking-wide text-admin-subtle">
              OWNER
            </span>
          </span>
          <ChevronDownIcon className="size-4 text-admin-muted" />
        </button>
      </div>
    </header>
  );
}

function IconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full hover:bg-white"
    >
      {children}
    </button>
  );
}
