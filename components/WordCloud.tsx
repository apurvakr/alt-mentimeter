"use client";

import cloud from "d3-cloud";
import { useEffect, useRef, useState } from "react";

interface Placed extends cloud.Word {
  text: string;
  size: number;
}

const COLORS = ["#4f46e5", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#7c3aed"];
const FONT = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif';

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Seeded PRNG so the same words land in the same places on every update. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function WordCloud({ words }: { words: { text: string; count: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [placed, setPlaced] = useState<Placed[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const key = words.map((w) => `${w.text}:${w.count}`).join("|");

  useEffect(() => {
    if (!size.w || !size.h || !words.length) {
      setPlaced([]);
      return;
    }
    const max = Math.max(...words.map((w) => w.count));
    const biggest = Math.min(110, Math.min(size.w, size.h) / 4);
    const fontSize = (count: number) => 18 + (Math.sqrt(count) / Math.sqrt(max)) * (biggest - 18);

    const layout = cloud<Placed>()
      .size([size.w, size.h])
      .words(words.map((w) => ({ text: w.text, size: fontSize(w.count) })))
      .padding(4)
      .rotate((d) => (hash(d.text) % 5 === 0 ? 90 : 0))
      .font(FONT)
      .fontWeight(700)
      .fontSize((d) => d.size)
      .random(seeded(7))
      .on("end", (out) => setPlaced(out));
    layout.start();
    return () => {
      layout.stop();
    };
    // `key` captures every change to `words`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size.w, size.h]);

  return (
    <div ref={ref} className="h-full w-full">
      {words.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xl text-slate-400">Waiting for answers…</div>
      ) : (
        <svg width={size.w} height={size.h} role="img" aria-label={`Word cloud: ${words.map((w) => w.text).join(", ")}`}>
          <g transform={`translate(${size.w / 2},${size.h / 2})`}>
            {placed.map((w) => (
              <text
                key={w.text}
                textAnchor="middle"
                transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
                style={{ fontSize: w.size, fontFamily: FONT, fontWeight: 700, transition: "transform 400ms ease" }}
                fill={COLORS[hash(w.text) % COLORS.length]}
              >
                {w.text}
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
