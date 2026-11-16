import { RiPlayLine, RiStopLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { statusText, type Messages, type Status } from "@/lib/app-types"

type ServerPanelProps = {
  t: Messages
  running: boolean
  busy: boolean
  logs: string
  message: Status
  onToggle: () => void
}

export function ServerPanel({
  t,
  running,
  busy,
  logs,
  message,
  onToggle,
}: ServerPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h2><CardTitle>{t.serverControl}</CardTitle></h2>
          <CardDescription>{t.serverControlDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button onClick={onToggle} disabled={busy}>
            {running ? (
              <RiStopLine data-icon="inline-start" aria-hidden="true" />
            ) : (
              <RiPlayLine data-icon="inline-start" aria-hidden="true" />
            )}
            {running ? t.stopServer : t.startServer}
          </Button>
          <span className="text-sm text-muted-foreground" role="status">
            {statusText(message, t)}
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2><CardTitle>{t.serverLog}</CardTitle></h2>
          <CardDescription>{t.serverLogDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            className="h-80 resize-none font-mono text-xs"
            readOnly
            value={logs}
            aria-label={t.serverLog}
          />
        </CardContent>
      </Card>
    </div>
  )
}
