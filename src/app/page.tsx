import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">토너먼트 대진표 & 체크인</h1>
      <Link href="/admin" className="rounded bg-black px-3 py-2 text-white">
        관리자로 입장
      </Link>
    </main>
  )
}
