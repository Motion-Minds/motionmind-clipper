"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";

export interface SidebarJob {
  id: string;
  title: string;
  status: string;
  clips: number;
}

export function Sidebar({ jobs }: { jobs: SidebarJob[] }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" className="lockup">
        <BrandMark className="lockup-mark" size={40} />
        <span>
          <span className="lockup-title">
            Motion<b>Mind</b>
          </span>
          <br />
          <span className="lockup-sub">Clipper · stream highlights</span>
        </span>
      </Link>

      <Link href="/" className="btn primary side-cta">
        + Import video
      </Link>

      <nav className="side-nav">
        <div className="side-group recent">
          <span className="side-label">Videos</span>
          {jobs.length === 0 && <span className="side-empty">Nothing imported yet</span>}
          {jobs.map((j) => (
            <Link key={j.id} href={`/j/${j.id}`} className={`side-link ${pathname === `/j/${j.id}` ? "active" : ""}`} title={j.title}>
              <i className={`dot ${j.status}`} />
              <span className="side-text">{j.title}</span>
              {j.clips > 0 && <span className="side-count">{j.clips}</span>}
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  );
}
