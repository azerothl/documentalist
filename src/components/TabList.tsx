"use client";

export function TabList<T extends string>({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  items: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="tab-list flex flex-wrap gap-1 border-b border-[var(--line)] text-sm font-medium"
    >
      {items.map(([key, text], index) => (
        <button
          key={key}
          id={`${id}-${key}`}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={`${id}-panel`}
          tabIndex={value === key ? 0 : -1}
          className={`min-h-10 px-2 py-2 ${value === key ? "border-b-2 border-[var(--accent)] text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}
          onClick={() => onChange(key)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % items.length;
            else if (event.key === "ArrowLeft")
              next = (index + items.length - 1) % items.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = items.length - 1;
            else return;
            event.preventDefault();
            onChange(items[next][0]);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus();
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
