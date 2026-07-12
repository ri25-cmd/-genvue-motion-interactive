import Link from 'next/link'

// Simple entry point. On the day, open /control on the iPad and /display on
// the laptop directly — this page is just a convenient hub for setup.
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-neutral-100 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          GenVue<span className="text-neutral-400"> Motion Interactive</span>
        </h1>
        <p className="mt-2 text-neutral-500">Open the interface for this device.</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/control"
          className="rounded-full bg-neutral-900 px-8 py-3 text-center font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Controller (iPad)
        </Link>
        <Link
          href="/display"
          className="rounded-full border border-neutral-300 bg-white px-8 py-3 text-center font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Display (Laptop)
        </Link>
      </div>
    </div>
  )
}
