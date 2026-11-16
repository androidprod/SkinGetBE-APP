import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { ServerPanel } from "@/components/server-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { SkinsPanel } from "@/components/skins-panel"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  initialConfig,
  type Config,
  type SavedSkin,
  type ServerState,
  type SkinList,
  type Status,
} from "@/lib/app-types"
import {
  readLanguage,
  saveLanguage,
  translations,
  type Language,
} from "@/lib/i18n"

const languageOptions = [
  { label: "日本語", value: "ja" },
  { label: "English", value: "en" },
]

function sameConfig(left: Config, right: Config) {
  return (
    left.version === right.version &&
    left.protocol === right.protocol &&
    left.port === right.port &&
    left.bind_addr === right.bind_addr &&
    left.savemode === right.savemode
  )
}

export function App() {
  const isAndroid = /Android/i.test(navigator.userAgent)
  const [language, setLanguage] = useState<Language>(readLanguage)
  const t = translations[language]
  const [config, setConfig] = useState<Config>(initialConfig)
  const [savedConfig, setSavedConfig] = useState<Config>(initialConfig)
  const [confirmAction, setConfirmAction] = useState<"reload" | "close" | null>(
    null
  )
  const editRevision = useRef(0)
  const loadRevision = useRef(0)
  const dirty = !sameConfig(config, savedConfig)
  const dirtyRef = useRef(dirty)
  useLayoutEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const [logs, setLogs] = useState("")
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Status>({ key: "ready" })
  const [skinList, setSkinList] = useState<SkinList | null>(null)
  const [skinError, setSkinError] = useState("")
  const [skinMessage, setSkinMessage] = useState<Status | null>(null)
  const [skinBusy, setSkinBusy] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(
    null
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || (isTauri() && !isAndroid)) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)

    let unlisten: (() => void) | undefined
    let disposed = false
    if (isTauri() && !isAndroid) {
      void getCurrentWindow()
        .onCloseRequested((event) => {
          if (dirtyRef.current) {
            event.preventDefault()
            setConfirmAction("close")
          }
        })
        .then((remove) => {
          if (disposed) remove()
          else unlisten = remove
        })
        .catch((error) => setMessage({ error: String(error) }))
    }
    return () => {
      disposed = true
      unlisten?.()
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [isAndroid])

  const refreshConfig = async () => {
    const revision = editRevision.current
    const request = ++loadRevision.current
    try {
      const loaded = await invoke<Config>("load_config")
      if (revision !== editRevision.current || request !== loadRevision.current)
        return
      setConfig(loaded)
      setSavedConfig(loaded)
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
      void invoke<ServerState>("server_state")
        .then((state) => {
          setRunning(state.running)
          setLogs(state.logs)
        })
        .catch(() => {
          /* Browser preview has no Tauri commands. */
        })
      void refreshSkins()
    }, 3000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [])

  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    editRevision.current += 1
    setConfig((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    setBusy(true)
    try {
      await invoke("save_config", { config })
      setSavedConfig(config)
      setMessage({ key: "configSaved" })
    } catch (error) {
      setMessage({ error: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const requestReload = () => {
    if (dirty) setConfirmAction("reload")
    else void refreshConfig()
  }

  const confirmDiscard = () => {
    if (confirmAction === "reload") {
      setConfirmAction(null)
      void refreshConfig()
    } else if (confirmAction === "close") {
      setConfirmAction(null)
      void getCurrentWindow()
        .destroy()
        .catch((error) => setMessage({ error: String(error) }))
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
      const data = await invoke<string>("read_skin", {
        fileName: skin.file_name,
      })
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
      const saved = await invoke<boolean>("reveal_skin", {
        fileName: skin.file_name,
      })
      setSkinMessage(
        isAndroid ? { key: saved ? "savedSkin" : "saveCancelled" } : null
      )
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
      const data = await invoke<string>("read_skin", {
        fileName: skin.file_name,
      })
      const bytes = Uint8Array.from(atob(data), (character) =>
        character.charCodeAt(0)
      )
      const file = new File([bytes], skin.file_name, { type: "image/png" })
      if (
        navigator.share &&
        (navigator.canShare?.({ files: [file] }) ?? true)
      ) {
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
      const destination = await invoke<string | null>("export_skin", {
        fileName: skin.file_name,
      })
      setSkinMessage(
        destination
          ? { key: "savedTo", path: destination }
          : { key: "shareCancelled" }
      )
    } catch (error) {
      setSkinMessage({ error: String(error) })
    } finally {
      setSkinBusy(false)
    }
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        {t.skipToContent}
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-svh bg-muted/30 p-4 text-foreground sm:p-6 md:p-10"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1
                  className="text-3xl font-semibold tracking-tight text-balance"
                  translate="no"
                >
                  SkinGetBE
                </h1>
                <Badge variant={running ? "default" : "secondary"}>
                  {running ? t.running : t.stopped}
                </Badge>
              </div>
              <p className="text-muted-foreground">{t.subtitle}</p>
            </div>
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel htmlFor="language">{t.language}</FieldLabel>
              <Select
                name="language"
                items={languageOptions}
                value={language}
                onValueChange={(next) => {
                  if (next !== "ja" && next !== "en") return
                  setLanguage(next)
                  saveLanguage(next)
                }}
              >
                <SelectTrigger id="language" className="min-w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {languageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </header>

          <Tabs defaultValue="server" className="gap-5">
            <TabsList
              aria-label={t.sections}
              className="max-w-full justify-start overflow-x-auto"
            >
              <TabsTrigger value="server">{t.server}</TabsTrigger>
              <TabsTrigger value="settings">{t.settings}</TabsTrigger>
              <TabsTrigger value="skins">{t.skins}</TabsTrigger>
            </TabsList>

            <TabsContent value="server">
              <ServerPanel
                t={t}
                running={running}
                busy={busy}
                logs={logs}
                message={message}
                onToggle={() => void toggleServer()}
              />
            </TabsContent>

            <TabsContent value="settings">
              <SettingsPanel
                t={t}
                config={config}
                busy={busy}
                message={message}
                onChange={update}
                onSave={() => void save()}
                onReload={requestReload}
              />
            </TabsContent>

            <TabsContent value="skins">
              <SkinsPanel
                t={t}
                language={language}
                isAndroid={isAndroid}
                skinList={skinList}
                error={skinError}
                message={skinMessage}
                busy={skinBusy}
                preview={preview}
                onRefresh={() => void refreshSkins()}
                onView={(skin) => void showSkin(skin)}
                onShare={(skin) => void shareSkin(skin)}
                onReveal={(skin) => void revealSkin(skin)}
                onClosePreview={() => setPreview(null)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "close"
                ? t.unsavedCloseTitle
                : t.unsavedReloadTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "close"
                ? t.unsavedCloseDescription
                : t.unsavedReloadDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              {confirmAction === "close"
                ? t.discardAndClose
                : t.discardAndReload}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default App
