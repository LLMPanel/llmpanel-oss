"use client"

import { use, useMemo, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import {
  Bot,
  Download,
  Eraser,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  TriangleAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container"
import { Loader } from "@/components/ui/loader"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollButton } from "@/components/ui/scroll-button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChatComposer } from "@/components/chat/chat-composer"
import { ChatMessageItem } from "@/components/chat/chat-message"
import { ChatRightPanel } from "@/components/chat/chat-right-panel"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { useChat } from "@/hooks/use-chat"
import { useDeployments } from "@/hooks/use-deployments"
import {
  downloadFile,
  estimateConversationTokens,
  sessionToMarkdown,
} from "@/lib/chat"

function EmptyChat({
  hasDeployments,
  onSuggestion,
}: {
  hasDeployments: boolean
  onSuggestion: (text: string) => void
}) {
  const suggestions = [
    "Explain how transformers work in simple terms",
    "Write a Python function to debounce calls",
    "Summarize the pros and cons of RAG",
  ]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="flex h-full flex-1 flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Chat with your model</h2>
        <p className="mt-1.5 max-w-sm text-[14px] leading-[1.45] text-muted-foreground">
          {hasDeployments
            ? "Pick a running deployment, tune the settings on the right, and start the conversation."
            : "Deploy and start a model first, then come back to chat with it here."}
        </p>
      </div>
      {hasDeployments && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full bg-muted px-3.5 py-2 text-[13px] text-foreground transition-[transform,background-color] duration-100 hover:bg-accent active:scale-[0.97]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: routeDeploymentId } = use(params)
  const { deployments, isLoading: deploymentsLoading } = useDeployments()
  const chat = useChat(deployments, routeDeploymentId)

  const [panelOpen, setPanelOpen] = useState(true)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)

  const {
    sessions,
    currentSession,
    currentSessionId,
    messages,
    settings,
    selectedDeployment,
    selectedDeploymentId,
    isStreaming,
    liveStats,
    input,
    setInput,
    updateSettings,
    sendMessage,
    regenerate,
    editAndResend,
    stop,
    selectSession,
    newSession,
    deleteSession,
    clearSessions,
  } = chat

  const contextTokens = useMemo(
    () => estimateConversationTokens(messages, settings.systemPrompt),
    [messages, settings.systemPrompt],
  )

  // index of the final assistant message (for the regenerate affordance)
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i
    }
    return -1
  }, [messages])

  // Locked to the route deployment: "running" means this specific deployment.
  const isRunning = selectedDeployment?.status === "running"
  const composerDisabled = !selectedDeploymentId || !isRunning

  const modelLabel =
    selectedDeployment?.model?.name ??
    selectedDeployment?.huggingfaceId ??
    "this deployment"

  const placeholder = !isRunning
    ? "Deployment isn’t running — start it first…"
    : `Message ${modelLabel}…`

  const rightPanel = (
    <ChatRightPanel
      settings={settings}
      onSettingsChange={updateSettings}
      isStreaming={isStreaming}
      deploymentId={selectedDeploymentId || null}
      isRunning={selectedDeployment?.status === "running"}
      modelFamily={selectedDeployment?.model?.family}
      contextTokens={contextTokens}
    />
  )

  return (
    <TooltipProvider>
      <MotionConfig reducedMotion="user">
      <div className="flex h-full overflow-hidden">
        {/* Sessions */}
        <ChatSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={selectSession}
          onDelete={deleteSession}
          onNew={newSession}
          onClearAll={clearSessions}
        />

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="relative z-10 flex items-center gap-3 bg-background/80 px-4 py-2.5 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-background">
            {deploymentsLoading ? (
              <Loader variant="circular" size="sm" />
            ) : (
              <span className="flex min-w-0 items-center gap-2 truncate text-[15px] font-semibold tracking-[-0.01em]">
                <span className="truncate">{modelLabel}</span>
                {selectedDeployment?.quantization && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                    {selectedDeployment.quantization}
                  </span>
                )}
              </span>
            )}

            {isRunning && (
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                Live
              </span>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-5 h-5 bg-gradient-to-b from-background/80 to-transparent" />

            <div className="ml-auto flex items-center gap-1">
              {currentSession && messages.length > 0 && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full active:scale-90"
                        onClick={() =>
                          downloadFile(
                            `${currentSession.title.slice(0, 40) || "chat"}.md`,
                            sessionToMarkdown(currentSession),
                            "text/markdown",
                          )
                        }
                      >
                        <Download className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export as Markdown</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-full active:scale-90"
                        disabled={isStreaming}
                        onClick={() => {
                          if (confirm("Delete this conversation?"))
                            deleteSession(currentSession.id)
                        }}
                      >
                        <Eraser className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete conversation</TooltipContent>
                  </Tooltip>
                </>
              )}
              {/* Desktop panel toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden size-8 rounded-full active:scale-90 lg:inline-flex"
                    onClick={() => setPanelOpen((v) => !v)}
                  >
                    {panelOpen ? (
                      <PanelRightClose className="size-4" />
                    ) : (
                      <PanelRightOpen className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {panelOpen ? "Hide panel" : "Show panel"}
                </TooltipContent>
              </Tooltip>
              {/* Mobile panel toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full active:scale-90 lg:hidden"
                onClick={() => setMobilePanelOpen(true)}
              >
                <PanelRightOpen className="size-4" />
              </Button>
            </div>
          </div>

          {/* No-endpoint warning */}
          {selectedDeployment?.status === "running" &&
            !selectedDeployment?.endpoint && (
              <div className="mx-4 mt-2 flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-[12px] leading-[1.45] text-warning">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This deployment is marked <strong>running</strong> but hasn’t
                  exposed an inference endpoint yet, so messages can’t be
                  delivered. It may still be starting up — otherwise try
                  redeploying the model.
                </span>
              </div>
            )}

          {/* Messages */}
          <div className="relative flex-1 overflow-hidden">
            {messages.length === 0 ? (
              <EmptyChat hasDeployments={isRunning} onSuggestion={setInput} />
            ) : (
              <ChatContainerRoot className="h-full">
                <ChatContainerContent className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-8 pt-6">
                  {messages.map((msg, i) => (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      isStreaming={isStreaming}
                      canRegenerate={i === lastAssistantIdx}
                      onRegenerate={regenerate}
                      onEdit={editAndResend}
                    />
                  ))}
                  <ChatContainerScrollAnchor />
                </ChatContainerContent>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <ScrollButton className="border-0 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.12)] active:scale-90" />
                </div>
              </ChatContainerRoot>
            )}
          </div>

          {/* Composer */}
          <ChatComposer
            input={input}
            onInputChange={setInput}
            onSubmit={sendMessage}
            onStop={stop}
            isStreaming={isStreaming}
            disabled={composerDisabled}
            placeholder={placeholder}
            live={liveStats}
          />
        </div>

        {/* Right panel — desktop */}
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.aside
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="hidden shrink-0 overflow-hidden bg-muted/30 shadow-[-1px_0_0_rgba(0,0,0,0.06)] lg:flex dark:shadow-[-1px_0_0_rgba(255,255,255,0.06)]"
            >
              <div className="w-80 shrink-0">{rightPanel}</div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Right panel — mobile */}
        <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
          <SheetContent side="right" className="w-[340px] gap-0 p-0 sm:max-w-none">
            <SheetHeader className="pb-0">
              <SheetTitle className="flex items-center gap-2 text-[17px] tracking-[-0.01em]">
                <Bot className="size-4" /> Model controls
              </SheetTitle>
            </SheetHeader>
            {rightPanel}
          </SheetContent>
        </Sheet>
      </div>
      </MotionConfig>
    </TooltipProvider>
  )
}
