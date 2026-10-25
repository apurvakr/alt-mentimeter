"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Logo } from "@/components/ui";
import { formatCode } from "@/lib/slides";

/** Participants land here: one job, entering the code on the screen. */
export default function JoinPage() {
  const router = useRouter();
  const [digits, setDigits] = useState("");

  function join(e: FormEvent) {
    e.preventDefault();
    if (digits.length === 6) router.push(`/vote/${digits}`);
  }

  return (
    <main className="flex min-h-dvh flex-col bg-night text-white">
      <header className="px-6 py-5">
        <Logo onNight />
      </header>

      <section className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 pb-16">
        <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">Enter the code on the screen</h1>
        <p className="mt-4 text-lg text-haze">Your presenter is showing a 6-digit number. Type it below to join.</p>

        <form onSubmit={join} className="mt-10">
          <label htmlFor="code" className="sr-only">
            Code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="000 000"
            value={formatCode(digits)}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-3xl bg-night-raised px-4 py-5 text-center font-display text-5xl font-extrabold tracking-[0.18em] text-marigold tabular-nums ring-2 ring-night-line placeholder:text-night-line focus:outline-none focus:ring-marigold sm:text-6xl"
          />
          <Button
            type="submit"
            disabled={digits.length !== 6}
            className="mt-4 w-full py-4 text-lg disabled:bg-night-raised disabled:text-haze"
          >
            Join
          </Button>
        </form>
      </section>

      <footer className="px-6 py-6 text-center text-sm text-haze">
        Running a session?{" "}
        <Link href="/host" className="font-bold text-white underline underline-offset-4 hover:text-marigold">
          Open the host dashboard
        </Link>
      </footer>
    </main>
  );
}
