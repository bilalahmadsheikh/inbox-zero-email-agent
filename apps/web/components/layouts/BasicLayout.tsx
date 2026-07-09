import { cn } from "@/utils";
import { Header } from "@/components/new-landing/sections/Header";
import { Footer } from "@/components/new-landing/sections/Footer";

const LAYOUT_CLASSNAME = "max-w-6xl mx-auto px-6 lg:px-8 xl:px-0";

export function BasicLayout(props: { children: React.ReactNode }) {
  return (
    <div className="landing-theme min-h-screen overflow-hidden bg-[var(--landing-bg)] text-[var(--landing-text)] transition-colors duration-500">
      <Header className="px-4 sm:px-6" />
      <main className={cn("isolate", LAYOUT_CLASSNAME)}>{props.children}</main>
      <Footer className={LAYOUT_CLASSNAME} />
    </div>
  );
}
