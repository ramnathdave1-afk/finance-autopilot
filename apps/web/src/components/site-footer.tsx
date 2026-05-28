import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="container py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-small text-fg-muted">
        <div>© {new Date().getFullYear()} Pilot. Personal finance, on autopilot.</div>
        <nav className="flex gap-5">
          <Link href="/roadmap" className="hover:text-fg">Roadmap</Link>
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
