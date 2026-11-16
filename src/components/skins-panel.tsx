import { useState } from "react"
import {
  RiEyeLine,
  RiFolderOpenLine,
  RiImageLine,
  RiRefreshLine,
  RiShareLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  statusText,
  type Messages,
  type SavedSkin,
  type SkinList,
  type Status,
} from "@/lib/app-types"
import type { Language } from "@/lib/i18n"

type SkinsPanelProps = {
  t: Messages
  language: Language
  isAndroid: boolean
  skinList: SkinList | null
  error: string
  message: Status | null
  busy: boolean
  preview: { name: string; url: string } | null
  onRefresh: () => void
  onView: (skin: SavedSkin) => void
  onShare: (skin: SavedSkin) => void
  onReveal: (skin: SavedSkin) => void
  onClosePreview: () => void
}

export function SkinsPanel({
  t,
  language,
  isAndroid,
  skinList,
  error,
  message,
  busy,
  preview,
  onRefresh,
  onView,
  onShare,
  onReveal,
  onClosePreview,
}: SkinsPanelProps) {
  const [page, setPage] = useState(0)
  const pageSize = 50
  const count = skinList?.skins.length ?? 0
  const pageCount = Math.max(1, Math.ceil(count / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleSkins =
    skinList?.skins.slice(
      currentPage * pageSize,
      (currentPage + 1) * pageSize
    ) ?? []
  const dateFormat = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const sizeFormat = new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  return (
    <>
      <Card>
        <CardHeader>
          <h2><CardTitle>{t.skins}</CardTitle></h2>
          <CardDescription className="break-all">
            {skinList
              ? t.savedIn.replace("{path}", skinList.directory)
              : t.skinsDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button variant="outline" className="self-start" onClick={onRefresh}>
            <RiRefreshLine data-icon="inline-start" aria-hidden="true" />{" "}
            {t.refreshList}
          </Button>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p
              className="text-sm break-all text-muted-foreground"
              role="status"
            >
              {statusText(message, t)}
            </p>
          )}
          {skinList?.skins.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.player}</TableHead>
                  <TableHead>{t.skinId}</TableHead>
                  <TableHead>{t.file}</TableHead>
                  <TableHead>{t.captured}</TableHead>
                  <TableHead>{t.size}</TableHead>
                  <TableHead>{t.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSkins.map((skin) => (
                  <TableRow key={skin.file_name}>
                    <TableCell className="max-w-40 break-words">
                      {skin.player_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-40 break-all">
                      {skin.skin_id ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-56 truncate"
                      title={skin.file_name}
                    >
                      {skin.file_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {skin.modified
                        ? dateFormat.format(new Date(skin.modified * 1000))
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {sizeFormat.format(skin.size_bytes / 1024)} KB
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onView(skin)}
                        >
                          <RiEyeLine
                            data-icon="inline-start"
                            aria-hidden="true"
                          />{" "}
                          {t.view}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onShare(skin)}
                        >
                          <RiShareLine
                            data-icon="inline-start"
                            aria-hidden="true"
                          />{" "}
                          {t.share}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onReveal(skin)}
                        >
                          <RiFolderOpenLine
                            data-icon="inline-start"
                            aria-hidden="true"
                          />{" "}
                          {isAndroid ? t.saveToFolder : t.showInFolder}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            !error && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RiImageLine aria-hidden="true" />
                  </EmptyMedia>
                    <h3><EmptyTitle>{t.noSkins}</EmptyTitle></h3>
                  <EmptyDescription>{t.noSkinsDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          )}
          {pageCount > 1 && (
            <nav
              aria-label={t.skinPages}
              className="flex flex-wrap items-center justify-end gap-2"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {t.previousPage}
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t.pageCount
                  .replace("{current}", String(currentPage + 1))
                  .replace("{total}", String(pageCount))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                {t.nextPage}
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) onClosePreview()
        }}
      >
        <DialogContent
          className="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg"
          closeLabel={t.close}
        >
          <DialogHeader>
            <DialogTitle>{preview?.name ?? t.skinPreview}</DialogTitle>
            <DialogDescription>{t.skinDescription}</DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
              alt={t.skinAlt.replace("{name}", preview.name)}
              width={256}
              height={256}
              className="mx-auto max-h-[65vh] max-w-full object-contain [image-rendering:pixelated]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
