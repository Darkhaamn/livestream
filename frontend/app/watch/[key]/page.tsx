import StreamWatch from "@/components/stream-watch"

type WatchPageProps = {
  params: Promise<{ key: string }>
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { key } = await params
  return <StreamWatch streamKey={decodeURIComponent(key)} />
}
