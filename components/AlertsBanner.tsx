"use client";

import Link from "next/link";
import { useAlertMatches } from "@/lib/alerts";
import { useLocation } from "./LocationProvider";
import { stationHref } from "./StationRow";
import { Icon } from "./Icon";

export function AlertsBanner() {
  const { loc } = useLocation();
  const matches = useAlertMatches(loc);
  if (!matches.length) return null;
  return (
    <div className="stack-8" aria-live="polite">
      {matches.slice(0, 2).map((m) => (
        <Link key={m.key} href={stationHref(m.station)} className="alert-banner">
          <span className="alert-icon" aria-hidden="true">
            <Icon name="bell" size={18} />
          </span>
          <span className="col-2 min0">
            <span className="b14">{m.title}</span>
            <span className="xs ellipsis">{m.body}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
