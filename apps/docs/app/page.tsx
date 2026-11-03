import { AgentSection } from "@/components/landing-page/agent-section"
import { HeroSection } from "@/components/landing-page/hero-section"
import { InstallSection } from "@/components/landing-page/install-section"
import { PitfallSection } from "@/components/landing-page/pitfall-section"
import { PlaygroundSection } from "@/components/landing-page/playground-section"
import { RecipesSection } from "@/components/landing-page/recipes-section"
import { RuntimesSection } from "@/components/landing-page/runtimes-section"
import { SiteFooter } from "@/components/landing-page/site-footer"
import { SiteHeader } from "@/components/landing-page/site-header"
import { StoreSection } from "@/components/landing-page/store-section"

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <PitfallSection />
        <PlaygroundSection />
        <InstallSection />
        <RecipesSection />
        <StoreSection />
        <RuntimesSection />
        <AgentSection />
      </main>
      <SiteFooter />
    </div>
  )
}
