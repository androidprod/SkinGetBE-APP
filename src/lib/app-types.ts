import { translations, type Language, type TranslationKey } from "@/lib/i18n"

export type Config = {
  version: string
  protocol: number
  port: number
  bind_addr: string
  savemode: number
}

export type SavedSkin = {
  file_name: string
  player_name: string | null
  skin_id: string | null
  size_bytes: number
  modified: number | null
}

export type SkinList = { directory: string; skins: SavedSkin[] }
export type ServerState = { running: boolean; logs: string }
export type Status = { key: TranslationKey; path?: string } | { error: string }
export type Messages = (typeof translations)[Language]

export const initialConfig: Config = {
  version: "1.26.21",
  protocol: 975,
  port: 19132,
  bind_addr: "0.0.0.0",
  savemode: 2,
}

export function statusText(status: Status, t: Messages): string {
  return "error" in status
    ? status.error
    : t[status.key].replace("{path}", status.path ?? "")
}
