import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import genvueLogo from '@/public/images/genvue-logo.png'

// Minimal, centered device-selection hub. On the day, open /control on the iPad
// and /display on the laptop directly — this page just picks a role.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#F7F8FA] px-6 py-16 font-sans text-[#1E293B]">
      <div className="flex flex-col items-center text-center">
        <Image
          src={genvueLogo}
          alt="GenVue"
          priority
          sizes="(max-width: 640px) 80vw, 360px"
          className="h-auto w-[min(80vw,360px)]"
        />
        <h1 className="mt-8 text-[22px] font-semibold tracking-tight text-[#1E293B]">Motion Interactive</h1>
        <p className="mt-2 text-sm text-[#64748B]">Choose how you&rsquo;d like to use this device.</p>
      </div>

      <div className="mt-10 grid w-full max-w-[760px] gap-6 sm:grid-cols-2">
        <DeviceCard href="/control" title="Controller" subtitle="iPad" icon={<TabletIcon />} />
        <DeviceCard href="/display" title="Display" subtitle="Laptop or screen" icon={<MonitorIcon />} />
      </div>
    </main>
  )
}

function DeviceCard({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string
  title: string
  subtitle: string
  icon: ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex cursor-pointer flex-col items-center rounded-2xl border border-[#E7EAF0] bg-white px-8 py-9 text-center shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-colors duration-200 hover:border-[#2F3E63]"
    >
      <span className="text-[#2F3E63]">{icon}</span>
      <h2 className="mt-5 text-lg font-semibold text-[#1E293B]">{title}</h2>
      <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p>
    </Link>
  )
}

// Lucide "tablet" outline geometry.
function TabletIcon() {
  return (
    <svg
      width="28"
      height="28"
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
      width="28"
      height="28"
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
