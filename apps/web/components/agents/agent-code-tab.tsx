"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeBlock, CodeBlockCode } from "@/components/ui/code-block"
import { CopyButton } from "@/components/agents/agent-shared"
import type { DeploymentAgent } from "@/hooks/use-deployment-agents"

const KEY_PLACEHOLDER = "gpup_sk_your_agent_key"

function Snippet({ code, language }: { code: string; language: string }) {
  return (
    <CodeBlock className="relative">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton text={code} />
      </div>
      <CodeBlockCode code={code} language={language} />
    </CodeBlock>
  )
}

export function AgentCodeTab({
  agent,
  baseUrl,
}: {
  agent: DeploymentAgent
  baseUrl: string
}) {
  const [tab, setTab] = useState("curl")

  const { endpoint, sdkBaseUrl } = useMemo(() => {
    const full = `${baseUrl}${agent.endpointPath}`
    const sdk = `${baseUrl}${agent.endpointPath.replace(/\/chat\/completions$/, "")}`
    return { endpoint: full, sdkBaseUrl: sdk }
  }, [baseUrl, agent.endpointPath])

  const curl = `curl ${endpoint} \\
  -H "Authorization: Bearer ${KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${agent.name}",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'`

  const curlStream = `curl ${endpoint} \\
  -H "Authorization: Bearer ${KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${agent.name}",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'`

  const python = `from openai import OpenAI

client = OpenAI(
    base_url="${sdkBaseUrl}",
    api_key="${KEY_PLACEHOLDER}",
)

completion = client.chat.completions.create(
    model="agent",  # routed by the agent, any value works
    messages=[
        {"role": "user", "content": "Hello!"},
    ],
)

print(completion.choices[0].message.content)`

  const js = `import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "${sdkBaseUrl}",
  apiKey: "${KEY_PLACEHOLDER}",
})

const completion = await client.chat.completions.create({
  model: "agent", // routed by the agent, any value works
  messages: [{ role: "user", content: "Hello!" }],
})

console.log(completion.choices[0].message.content)`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Call this agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          Point any OpenAI-compatible client at the agent endpoint and authenticate with a{" "}
          <code className="font-mono text-xs">gpup_sk_…</code> key from the API Keys tab. The{" "}
          <code className="font-mono text-xs">model</code> field is optional — the server routes by agent.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="curl">curl</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
          </TabsList>

          <TabsContent value="curl" className="space-y-4">
            <Snippet code={curl} language="bash" />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Streaming</p>
              <Snippet code={curlStream} language="bash" />
            </div>
          </TabsContent>

          <TabsContent value="python">
            <Snippet code={python} language="python" />
          </TabsContent>

          <TabsContent value="javascript">
            <Snippet code={js} language="javascript" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
