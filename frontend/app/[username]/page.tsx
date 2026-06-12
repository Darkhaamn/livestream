import ChannelPage from "@/components/channel-page"

type ChannelRouteProps = {
  params: Promise<{ username: string }>
}

export default async function ChannelRoute({ params }: ChannelRouteProps) {
  const { username } = await params
  return <ChannelPage username={decodeURIComponent(username)} />
}
