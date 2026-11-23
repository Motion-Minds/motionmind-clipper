import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { jobTitle, listJobs } from "@/core/jobs.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotionMind Clipper",
  description: "Highlights from a stream VOD or a YouTube/TikTok link, cut into vertical clips with raw subtitles.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jobs = listJobs()
    .slice(0, 30)
    .map((j) => ({ id: j.id, title: jobTitle(j), status: j.status, clips: j.clips.length }));
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar jobs={jobs} />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
