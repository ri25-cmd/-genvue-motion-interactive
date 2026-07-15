import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import genvueLogo from '@/public/images/genvue-logo.png'

// Minimal, centered device-selection hub. On the day, open /control on the iPad
// and /display on the laptop directly — this page just picks a role.
const VERSION = '0.1.0'

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center bg-[#F7F8FA] px-6 pt-16 font-sans text-[#1F2937]">
      {/* Single, extremely subtle radial glow behind the logo */}
      <div className="pointer-events-none absolute left-1/2 top-[8%] h-[340px] w-[560px] -translate-x-1/2 rounded-full bg-[#2F3E63]/5 blur-[220px]" />

      {/* Brand */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <Image
          src={genvueLogo}
          alt="GenVue"
          priority
          sizes="(max-width: 640px) 90vw, 528px"
          className="h-auto w-[min(90vw,528px)]"
        />
        <p className="mt-4 text-[22px] font-medium text-[#1F2937]">Motion Interactive</p>
        <p className="mt-1.5 text-sm font-medium text-[#6B7280]">Select this device</p>
      </div>

      {/* Selection cards — side by side on desktop, stacked on mobile */}
      <div className="relative z-10 mt-10 grid w-full max-w-[952px] gap-8 sm:grid-cols-2">
        <DeviceCard
          href="/control"
          title="Controller"
          device="iPad"
          description="Draw and control the interactive canvas."
          icon={<TabletIcon />}
        />
        <DeviceCard
          href="/display"
          title="Display"
          device="Laptop / Screen"
          description="Mirror the live experience fullscreen."
          icon={<MonitorIcon />}
        />
      </div>

      {/* Footer */}
      <footer className="absolute bottom-7 left-0 right-0 text-center text-xs text-[#9CA3AF]">
        <p className="font-medium text-[#6B7280]">GenVue Technologies</p>
        <p className="mt-0.5">Motion Interactive v{VERSION}</p>
      </footer>
    </main>
  )
}

function DeviceCard({
  href,
  title,
  device,
  description,
  icon,
}: {
  href: string
  title: string
  device: string
  description: string
  icon: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex h-[240px] w-full cursor-pointer flex-col justify-between rounded-[24px] border border-[#E5E7EB] bg-white p-9 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-[180ms] ease-out hover:-translate-y-1 hover:border-[#3A4A73] hover:shadow-[0_12px_36px_rgba(15,23,42,0.10)]"
    >
      <div className="flex items-start justify-between">
        <span className="text-[#2F3E63]">{icon}</span>
        <ArrowIcon className="mt-1 text-gray-300 transition-all duration-[180ms] ease-out group-hover:translate-x-1 group-hover:text-[#2F3E63]" />
      </div>
      <div>
        <h2 className="text-[32px] font-semibold leading-tight tracking-tight text-[#1F2937]">{title}</h2>
        <p className="mt-1.5 text-base font-medium text-[#6B7280]">{device}</p>
        <p className="mt-2 text-base leading-relaxed text-[#6B7280]">{description}</p>
      </div>
    </Link>
  )
}

// Lucide "tablet" outline geometry.
function TabletIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  )
}

// Lucide "monitor" outline geometry.
function MonitorIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}

// Lucide "arrow-right" outline geometry.
function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
