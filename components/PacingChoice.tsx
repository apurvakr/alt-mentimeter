import type { Pacing } from "@/lib/types";

const OPTIONS: { value: Pacing; title: string; body: string }[] = [
  {
    value: "self",
    title: "Self-paced survey",
    body: "When you publish, everyone gets all the questions and answers in their own time.",
  },
  {
    value: "presenter",
    title: "Presenter-paced",
    body: "You reveal one question at a time from the presenter screen. Phones follow along.",
  },
];

export function PacingChoice({
  value,
  onChange,
  name = "pacing",
  stacked = false,
}: {
  value: Pacing;
  onChange: (p: Pacing) => void;
  name?: string;
  /** One option per row, for narrow columns. */
  stacked?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">How do people answer?</legend>
      <div className={`grid gap-3 ${stacked ? "" : "sm:grid-cols-2"}`}>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer gap-3 rounded-2xl bg-white p-4 transition-shadow ${
              value === o.value ? "ring-2 ring-night" : "ring-1 ring-line hover:ring-night/40"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-1 size-4 shrink-0 accent-night"
            />
            <span>
              <span className="block font-bold">{o.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{o.body}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
