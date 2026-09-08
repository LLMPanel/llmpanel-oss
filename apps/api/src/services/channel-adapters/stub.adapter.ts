import type { IChannelAdapter, IncomingMessage } from "./types"

export class StubAdapter implements IChannelAdapter {
  constructor(public platform: string) {}

  async connect(
    _config: Record<string, string>,
    _onMessage: (msg: IncomingMessage) => Promise<void>
  ): Promise<void> {
    throw new Error(`${this.platform} adapter is not yet implemented`)
  }

  async sendMessage(_target: string, _text: string): Promise<void> {
    throw new Error(`${this.platform} adapter is not yet implemented`)
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  isConnected(): boolean {
    return false
  }
}
