"use client";

import { useEffect, useReducer, useRef } from "react";

interface ExampleLoad {
  market: string;
  flag: string;
  fromArea: string;
  fromCity: string;
  toArea: string;
  toCity: string;
  vehicle: string;
  load: string;
  collect: string;
  priceLabel: string;
  price: string;
}

const EXAMPLES: ExampleLoad[] = [
  {
    market: "United Kingdom",
    flag: "🇬🇧",
    fromArea: "Trafford Park",
    fromCity: "Manchester",
    toArea: "Digbeth",
    toCity: "Birmingham",
    vehicle: "Luton van",
    load: "4 pallets, 800 kg",
    collect: "Tue, 08:00",
    priceLabel: "Fixed price",
    price: "£240",
  },
  {
    market: "India",
    flag: "🇮🇳",
    fromArea: "Koyambedu",
    fromCity: "Chennai",
    toArea: "Madhapur",
    toCity: "Hyderabad",
    vehicle: "Tempo",
    load: "12 boxes, 320 kg",
    collect: "Wed, 09:00",
    priceLabel: "Negotiable",
    price: "₹8,500",
  },
  {
    market: "United Kingdom",
    flag: "🇬🇧",
    fromArea: "Slough Trading Estate",
    fromCity: "Slough",
    toArea: "Tilbury Docks",
    toCity: "Essex",
    vehicle: "Curtainsider",
    load: "18 pallets, 6,200 kg",
    collect: "Mon, 06:00",
    priceLabel: "Fixed price",
    price: "£890",
  },
];

export default function LandingExampleCards() {
  const [index, advance] = useReducer(
    (current: number, next: number | "next") =>
      next === "next" ? (current + 1) % EXAMPLES.length : next,
    0,
  );
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced.current) return;
    const id = setInterval(() => advance("next"), 4000);
    return () => clearInterval(id);
  }, []);

  const ex = EXAMPLES[index];

  return (
    <figure className="load-ticket" aria-label="Example of a load listing">
      <figcaption className="load-ticket-tag">
        Example load · {ex.flag} {ex.market}
      </figcaption>
      <div className="load-ticket-route">
        <span className="load-ticket-stop">
          <span className="load-ticket-dot" aria-hidden="true" />
          <span>
            <strong>{ex.fromArea}</strong>
            <small>{ex.fromCity}</small>
          </span>
        </span>
        <span className="load-ticket-line" aria-hidden="true" />
        <span className="load-ticket-stop">
          <span className="load-ticket-dot load-ticket-dot-end" aria-hidden="true" />
          <span>
            <strong>{ex.toArea}</strong>
            <small>{ex.toCity}</small>
          </span>
        </span>
      </div>
      <dl className="load-ticket-facts">
        <div><dt>Vehicle</dt><dd>{ex.vehicle}</dd></div>
        <div><dt>Load</dt><dd>{ex.load}</dd></div>
        <div><dt>Collect</dt><dd>{ex.collect}</dd></div>
      </dl>
      <div className="load-ticket-foot">
        <span>{ex.priceLabel}</span>
        <strong>{ex.price}</strong>
      </div>
      <div className="load-ticket-dots" role="tablist" aria-label="Example loads">
        {EXAMPLES.map((e, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === index}
            aria-label={`${e.flag} ${e.market} example`}
            className={"load-ticket-dot-nav" + (i === index ? " load-ticket-dot-nav-active" : "")}
            style={{ minWidth: 24, minHeight: 24 }}
            onClick={() => advance(i)}
          />
        ))}
      </div>
    </figure>
  );
}
