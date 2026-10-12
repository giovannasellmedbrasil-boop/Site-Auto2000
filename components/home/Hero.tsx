import Image from "next/image";
import Link from "next/link";
import { Star, Wallet } from "lucide-react";
import { LogoWatermark } from "@/components/ui/LogoWatermark";

const PRICE_RANGES = [
  { label: "Até R$ 25 mil", href: "/?priceMax=25000" },
  { label: "De R$ 25 mil a R$ 50 mil", href: "/?priceMin=25000&priceMax=50000" },
  { label: "De R$ 50 mil a R$ 75 mil", href: "/?priceMin=50000&priceMax=75000" },
  { label: "A partir de R$ 75 mil", href: "/?priceMin=75000" },
];

const GOOGLE_REVIEWS_URL =
  "https://www.google.com/search?sca_esv=97ecd86c81018411&cs=0&output=search&kgmid=/g/11c54g7zmk&q=Auto+2000+Ve%C3%ADculos&shem=dlvs1,epsd1,ltae,rimspwouoe&shndl=30&source=sh/x/loc/uni/m1/1&kgs=2b5ad3114cfcec60&utm_source=dlvs1,epsd1,ltae,rimspwouoe,sh/x/loc/uni/m1/1#lrd=0x94ce5d672c2ed5a1:0x1b750281f91d1451,1,,,,";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(255,176,0,0.35), transparent 45%), radial-gradient(circle at 85% 0%, rgba(255,176,0,0.22), transparent 40%)",
        }}
      />

      <LogoWatermark />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-4 pb-16 pt-20 text-center sm:items-start sm:px-6 sm:pb-20 sm:pt-28 sm:text-left lg:px-8">
        <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight text-accent-400 sm:max-w-xl sm:text-5xl animate-fade-in-up">
            Novos caminhos começam com a escolha certa.
          </h1>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
            <div className="relative h-60 w-full shrink-0 overflow-hidden rounded-card border border-white/8 shadow-[var(--shadow-card)] animate-fade-in-up sm:w-72">
              <Image
                src="/loja-fachada-2.png"
                alt="Fachada da loja Auto2000"
                fill
                className="object-cover"
                sizes="(min-width: 640px) 18rem, 100vw"
              />
            </div>

            <a
              href={GOOGLE_REVIEWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-full shrink-0 flex-col gap-3 rounded-card border border-white/8 bg-ink-100 p-6 text-left shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-500/40 hover:shadow-[var(--shadow-card-hover)] animate-fade-in-up sm:w-72 sm:h-60"
            >
              <div className="flex items-center gap-1 text-accent-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4.5 w-4.5" fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <h3 className="text-sm font-semibold text-accent-400">Avaliações dos nossos clientes no Google</h3>
              <p className="text-sm leading-relaxed text-white">
                4,8/5 em 129 avaliações de clientes atendidos.
              </p>
            </a>
          </div>
        </div>

        <p className="max-w-xl text-balance text-lg text-white animate-fade-in-up">
          Encontre, simule e negocie seu veículo de forma simples, rápida e segura.
        </p>

        <div className="grid w-full grid-cols-2 gap-3 animate-fade-in-up sm:grid-cols-4">
          {PRICE_RANGES.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="group flex flex-col items-start gap-4 rounded-card border border-white/8 bg-ink-100 p-5 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-500/40 hover:shadow-[var(--shadow-card-hover)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-50 text-ink-700 transition-colors group-hover:bg-accent-100 group-hover:text-accent-700">
                <Wallet className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span className="text-sm font-semibold text-ink-900">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
