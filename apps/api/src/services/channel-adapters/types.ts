export interface IncomingMessage {
  platformUserId: string
  platformUsername: string
  text: string
  channelId?: string
  replyToMessageId?: string
}

export interface IChannelAdapter {
  platform: string
  connect(
    config: Record<string, string>,
    onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void>
  sendMessage(target: string, text: string): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
}
