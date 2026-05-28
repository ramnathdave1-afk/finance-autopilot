import { TopNav } from "@/components/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <div className="container py-8 max-w-2xl">{children}</div>
    </>
  );
}
