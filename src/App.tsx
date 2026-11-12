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
import { readLanguage, saveLanguage, translations, type Language, type TranslationKey } from "@/lib/i18n"

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

type Status = { key: TranslationKey; path?: string } | { error: string }

function statusText(status: Status, t: typeof translations.ja | typeof translations.en): string {
  return "error" in status ? status.error : t[status.key].replace("{path}", status.path ?? "")
}

export function App() {
  const isAndroid = /Android/i.test(navigator.userAgent)
  const [language, setLanguage] = useState<Language>(readLanguage)
  const t = translations[language]
  const [config, setConfig] = useState<Config>(initialConfig)
  const [logs, setLogs] = useState("")
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Status>({ key: "ready" })
  const [skinList, setSkinList] = useState<SkinList | null>(null)
  const [skinError, setSkinError] = useState("")
  const [skinMessage, setSkinMessage] = useState<Status | null>(null)
  const [skinBusy, setSkinBusy] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const refreshConfig = async () => {
    try {
      setConfig(await invoke<Config>("load_config"))
      setMessage({ key: "configLoaded" })
    } catch (error) {
      setMessage({ error: String(error) })
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
      setMessage({ key: "configSaved" })
    } catch (error) {
      setMessage({ error: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const toggleServer = async () => {
    setBusy(true)
    try {
      if (running) {
        await invoke("stop_server")
        setMessage({ key: "stopRequested" })
      } else {
        await invoke("start_server", { config, language })
        setMessage({ key: "serverStarting" })
      }
    } catch (error) {
      setMessage({ error: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const showSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      const data = await invoke<string>("read_skin", { fileName: skin.file_name })
      setPreview({ name: skin.file_name, url: `data:image/png;base64,${data}` })
      setSkinMessage(null)
    } catch (error) {
      setSkinMessage({ error: String(error) })
    } finally {
      setSkinBusy(false)
    }
  }

  const revealSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      const saved = await invoke<boolean>("reveal_skin", { fileName: skin.file_name })
      setSkinMessage(isAndroid ? { key: saved ? "savedSkin" : "shareCancelled" } : null)
    } catch (error) {
      setSkinMessage({ error: String(error) })
    } finally {
      setSkinBusy(false)
    }
  }

  const shareSkin = async (skin: SavedSkin) => {
    setSkinBusy(true)
    try {
      if (isAndroid) {
        await invoke("share_skin", { fileName: skin.file_name })
        setSkinMessage(null)
        return
      }
      const data = await invoke<string>("read_skin", { fileName: skin.file_name })
      const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
      const file = new File([bytes], skin.file_name, { type: "image/png" })
      if (navigator.share && (navigator.canShare?.({ files: [file] }) ?? true)) {
        try {
          await navigator.share({ files: [file], title: skin.file_name })
          setSkinMessage({ key: "shared" })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setSkinMessage({ key: "shareCancelled" })
            return
          }
          // Fall back to a Save As dialog when the OS cannot share files.
        }
      }
      const destination = await invoke<string | null>("export_skin", { fileName: skin.file_name })
      setSkinMessage(destination ? { key: "savedTo", path: destination } : { key: "shareCancelled" })
    } catch (error) {
      setSkinMessage({ error: String(error) })
    } finally {
      setSkinBusy(false)
    }
  }

  return (
    <main className="min-h-svh bg-muted/30 p-4 text-foreground sm:p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">SkinGetBE</h1>
              <Badge variant={running ? "default" : "secondary"}>
                {running ? t.running : t.stopped}
              </Badge>
            </div>
            <p className="text-muted-foreground">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="language" className="text-muted-foreground">{t.language}</label>
            <select
              id="language"
              value={language}
              onChange={(event) => {
                const next = event.target.value as Language
                setLanguage(next)
                saveLanguage(next)
              }}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
        </header>

        <Tabs defaultValue="server" className="gap-5">
          <TabsList aria-label={t.sections}>
            <TabsTrigger value="server">{t.server}</TabsTrigger>
            <TabsTrigger value="settings">{t.settings}</TabsTrigger>
            <TabsTrigger value="skins">{t.skins}</TabsTrigger>
          </TabsList>

          <TabsContent value="server">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t.serverControl}</CardTitle>
                  <CardDescription>{t.serverControlDescription}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4">
                  <Button onClick={() => void toggleServer()} disabled={busy}>
                    {running ? <RiStopLine data-icon="inline-start" /> : <RiPlayLine data-icon="inline-start" />}
                    {running ? t.stopServer : t.startServer}
                  </Button>
                  <span className="text-sm text-muted-foreground" role="status">{statusText(message, t)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t.serverLog}</CardTitle>
                  <CardDescription>{t.serverLogDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea className="h-80 resize-none font-mono text-xs" readOnly value={logs} aria-label={t.serverLog} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>{t.serverSettings}</CardTitle>
                <CardDescription>{t.serverSettingsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="version">{t.minecraftVersion}</FieldLabel>
                    <Input id="version" value={config.version} onChange={(event) => update("version", event.target.value)} />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="protocol">{t.protocol}</FieldLabel>
                      <Input id="protocol" type="number" min={0} max={65535} value={config.protocol} onChange={(event) => update("protocol", Number(event.target.value))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="port">{t.signalingPort}</FieldLabel>
                      <Input id="port" type="number" min={1} max={65535} value={config.port} onChange={(event) => update("port", Number(event.target.value))} />
                      <FieldDescription>{t.lanDiscovery}</FieldDescription>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="bind-address">{t.bindAddress}</FieldLabel>
                    <Input id="bind-address" value={config.bind_addr} onChange={(event) => update("bind_addr", event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="save-mode">{t.saveMode}</FieldLabel>
                    <Input id="save-mode" type="number" min={0} max={2} value={config.savemode} onChange={(event) => update("savemode", Number(event.target.value))} />
                    <FieldDescription>{t.saveModeDescription}</FieldDescription>
                  </Field>
                </FieldGroup>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void save()} disabled={busy}>
                    <RiSaveLine data-icon="inline-start" /> {t.saveConfig}
                  </Button>
                  <Button variant="outline" onClick={() => void refreshConfig()}>
                    <RiRefreshLine data-icon="inline-start" /> {t.reload}
                  </Button>
                  <span className="text-sm text-muted-foreground" role="status">{statusText(message, t)}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skins">
            <Card>
              <CardHeader>
                <CardTitle>{t.skins}</CardTitle>
                <CardDescription className="break-all">
                  {skinList ? t.savedIn.replace("{path}", skinList.directory) : t.skinsDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button variant="outline" className="self-start" onClick={() => void refreshSkins()}>
                  <RiRefreshLine data-icon="inline-start" /> {t.refreshList}
                </Button>
                {skinError && <p className="text-sm text-destructive" role="alert">{skinError}</p>}
                {skinMessage && <p className="text-sm text-muted-foreground break-all" role="status">{statusText(skinMessage, t)}</p>}
                {skinList?.skins.length ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t.player}</TableHead><TableHead>{t.skinId}</TableHead><TableHead>{t.file}</TableHead><TableHead>{t.captured}</TableHead><TableHead>{t.size}</TableHead><TableHead>{t.actions}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {skinList.skins.map((skin) => (
                        <TableRow key={skin.file_name}>
                          <TableCell>{skin.player_name ?? "—"}</TableCell>
                          <TableCell>{skin.skin_id ?? "—"}</TableCell>
                          <TableCell className="max-w-56 truncate" title={skin.file_name}>{skin.file_name}</TableCell>
                          <TableCell>{skin.modified ? new Date(skin.modified * 1000).toLocaleString(language) : "—"}</TableCell>
                          <TableCell>{(skin.size_bytes / 1024).toFixed(1)} KB</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void showSkin(skin)}>
                                <RiEyeLine data-icon="inline-start" /> {t.view}
                              </Button>
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void shareSkin(skin)}>
                                <RiShareLine data-icon="inline-start" /> {t.share}
                              </Button>
                              <Button variant="outline" size="sm" disabled={skinBusy} onClick={() => void revealSkin(skin)}>
                                <RiFolderOpenLine data-icon="inline-start" /> {isAndroid ? t.saveToFolder : t.showInFolder}
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
                      <EmptyTitle>{t.noSkins}</EmptyTitle>
                      <EmptyDescription>{t.noSkinsDescription}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
          <DialogContent className="sm:max-w-lg" closeLabel={t.close}>
            <DialogHeader>
              <DialogTitle>{preview?.name ?? t.skinPreview}</DialogTitle>
              <DialogDescription>{t.skinDescription}</DialogDescription>
            </DialogHeader>
            {preview && <img src={preview.url} alt={t.skinAlt.replace("{name}", preview.name)} className="mx-auto max-h-[65vh] max-w-full object-contain [image-rendering:pixelated]" />}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

export default App
