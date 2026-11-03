import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { RiEyeLine, RiFolderOpenLine, RiImageLine, RiPlayLine, RiRefreshLine, RiSaveLine, RiShareLine, RiStopLine } from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type Config = {
  version: string
  protocol: number
  port: number
  bind_addr: string
  savemode: number
}

type SavedSkin = {
  file_name: string
  player_name: string | null
  skin_id: string | null
  size_bytes: number
  modified: number | null
}

type SkinList = { directory: string; skins: SavedSkin[] }

const initialConfig: Config = {
  version: "1.26.21",
  protocol: 975,
  port: 19132,
  bind_addr: "0.0.0.0",
  savemode: 2,
}

export function App() {
  const [config, setConfig] = useState<Config>(initialConfig)
  const [logs, setLogs] = useState("")
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("Ready")
  const [skinList, setSkinList] = useState<SkinList | null>(null)
  const [skinError, setSkinError] = useState("")
  const [skinMessage, setSkinMessage] = useState("")
  const [skinBusy, setSkinBusy] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)

  const refreshConfig = async () => {
    try {
      setConfig(await invoke<Config>("load_config"))
      setMessage("Configuration loaded")
    } catch (error) {
      setMessage(String(error))
    }
  }

  const refreshSkins = async () => {
    try {
      setSkinList(await invoke<SkinList>("list_skins"))
      setSkinError("")
    } catch (error) {
      setSkinError(String(error))
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshConfig()
      void refreshSkins()
    }, 0)
    const timer = window.setInterval(() => {
      void invoke<{ running: boolean; logs: string }>("server_state")
        .then((state) => {
          setRunning(state.running)
          setLogs(state.logs)
        })
        .catch(() => { /* Browser preview has no Tauri commands. */ })
      void refreshSkins()
    }, 3000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [])

  const update = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setBusy(true)
    try {
      await invoke("save_config", { config })
      setMessage("Configuration saved. Restart the server to apply changes.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleServer = async () => {
    setBusy(true)
    try {
      if (running) {
        await invoke("stop_server")
        setMessage("Stop requested")
      } else {
        await invoke("start_server", { config })
        setMessage("Server starting")
      }
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const showSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      const data = await invoke<string>("read_skin", { fileName: skin.file_name })
      setPreview({ name: skin.file_name, url: `data:image/png;base64,${data}` })
      setSkinMessage("")
    } catch (error) {
      setSkinMessage(String(error))
    } finally {
      setSkinBusy(false)
    }
  }

  const revealSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      await invoke("reveal_skin", { fileName: skin.file_name })
      setSkinMessage("")
    } catch (error) {
      setSkinMessage(String(error))
    } finally {
      setSkinBusy(false)
    }
  }

  const shareSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      const data = await invoke<string>("read_skin", { fileName: skin.file_name })
      const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
      const file = new File([bytes], skin.file_name, { type: "image/png" })
      if (navigator.share && (navigator.canShare?.({ files: [file] }) ?? true)) {
        try {
          await navigator.share({ files: [file], title: skin.file_name })
          setSkinMessage("Shared successfully")
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setSkinMessage("Sharing cancelled")
            return
          }
          // Fall back to a Save As dialog when the OS cannot share files.
        }
      }
      const destination = await invoke<string | null>("export_skin", { fileName: skin.file_name })
      setSkinMessage(destination ? `Saved to ${destination}` : "Sharing cancelled")
    } catch (error) {
      setSkinMessage(String(error))
    } finally {
      setSkinBusy(false)
    }
  }

  return (
    <main className="min-h-svh bg-muted/30 p-4 text-foreground sm:p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">SkinGetBE</h1>
            <Badge variant={running ? "default" : "secondary"}>
              {running ? "Running" : "Stopped"}
            </Badge>
          </div>
          <p className="text-muted-foreground">Minecraft Bedrock skin capture server</p>
        </header>

        <Tabs defaultValue="server" className="gap-5">
          <TabsList aria-label="Application sections">
            <TabsTrigger value="server">Server</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="skins">Captured skins</TabsTrigger>
          </TabsList>

          <TabsContent value="server">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Server control</CardTitle>
                  <CardDescription>Start or stop the NetherNet skin capture server.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4">
                  <Button onClick={() => void toggleServer()} disabled={busy}>
                    {running ? <RiStopLine data-icon="inline-start" /> : <RiPlayLine data-icon="inline-start" />}
                    {running ? "Stop server" : "Start server"}
                  </Button>
                  <span className="text-sm text-muted-foreground" role="status">{message}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Server log</CardTitle>
                  <CardDescription>Connection and capture events from the server.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea className="h-80 resize-none font-mono text-xs" readOnly value={logs} aria-label="Server log" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Server settings</CardTitle>
                <CardDescription>Saved to config.jsonc in the app data directory.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="version">Minecraft version</FieldLabel>
                    <Input id="version" value={config.version} onChange={(event) => update("version", event.target.value)} />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="protocol">Protocol</FieldLabel>
                      <Input id="protocol" type="number" min={0} max={65535} value={config.protocol} onChange={(event) => update("protocol", Number(event.target.value))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="port">HTTP signaling port</FieldLabel>
                      <Input id="port" type="number" min={1} max={65535} value={config.port} onChange={(event) => update("port", Number(event.target.value))} />
                      <FieldDescription>LAN discovery uses port 7551.</FieldDescription>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="bind-address">Bind address</FieldLabel>
                    <Input id="bind-address" value={config.bind_addr} onChange={(event) => update("bind_addr", event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="save-mode">Save mode (0–2)</FieldLabel>
                    <Input id="save-mode" type="number" min={0} max={2} value={config.savemode} onChange={(event) => update("savemode", Number(event.target.value))} />
                    <FieldDescription>0: disabled · 1: overwrite · 2: numbered files</FieldDescription>
                  </Field>
                </FieldGroup>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void save()} disabled={busy}>
                    <RiSaveLine data-icon="inline-start" /> Save config
                  </Button>
                  <Button variant="outline" onClick={() => void refreshConfig()}>
                    <RiRefreshLine data-icon="inline-start" /> Reload
                  </Button>
                  <span className="text-sm text-muted-foreground" role="status">{message}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skins">
            <Card>
              <CardHeader>
                <CardTitle>Captured skins</CardTitle>
                <CardDescription className="break-all">
                  {skinList ? `Saved in ${skinList.directory}` : "PNG captures saved by the server."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button variant="outline" className="self-start" onClick={() => void refreshSkins()}>
                  <RiRefreshLine data-icon="inline-start" /> Refresh list
                </Button>
                {skinError && <p className="text-sm text-destructive" role="alert">{skinError}</p>}
                {skinMessage && <p className="text-sm text-muted-foreground break-all" role="status">{skinMessage}</p>}
                {skinList?.skins.length ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Player</TableHead><TableHead>Skin ID</TableHead><TableHead>File</TableHead><TableHead>Captured</TableHead><TableHead>Size</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {skinList.skins.map((skin) => (
                        <TableRow key={skin.file_name}>
                          <TableCell>{skin.player_name ?? "—"}</TableCell>
                          <TableCell>{skin.skin_id ?? "—"}</TableCell>
                          <TableCell className="max-w-56 truncate" title={skin.file_name}>{skin.file_name}</TableCell>
                          <TableCell>{skin.modified ? new Date(skin.modified * 1000).toLocaleString() : "—"}</TableCell>
                          <TableCell>{(skin.size_bytes / 1024).toFixed(1)} KB</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void showSkin(skin)}>
                                <RiEyeLine data-icon="inline-start" /> View
                              </Button>
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void shareSkin(skin)}>
                                <RiShareLine data-icon="inline-start" /> Share
                              </Button>
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void revealSkin(skin)}>
                                <RiFolderOpenLine data-icon="inline-start" /> Show in folder
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : !skinError && (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><RiImageLine /></EmptyMedia>
                      <EmptyTitle>No captured skins yet</EmptyTitle>
                      <EmptyDescription>Start the server and connect with Minecraft to capture a skin.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{preview?.name ?? "Skin preview"}</DialogTitle>
              <DialogDescription>Captured skin image (PNG)</DialogDescription>
            </DialogHeader>
            {preview && <img src={preview.url} alt={`Skin: ${preview.name}`} className="mx-auto max-h-[65vh] max-w-full object-contain [image-rendering:pixelated]" />}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

export default App
