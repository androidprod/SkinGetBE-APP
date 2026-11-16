import { RiRefreshLine, RiSaveLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  statusText,
  type Config,
  type Messages,
  type Status,
} from "@/lib/app-types"

type SettingsPanelProps = {
  t: Messages
  config: Config
  busy: boolean
  message: Status
  onChange: <K extends keyof Config>(key: K, value: Config[K]) => void
  onSave: () => void
  onReload: () => void
}

export function SettingsPanel({
  t,
  config,
  busy,
  message,
  onChange,
  onSave,
  onReload,
}: SettingsPanelProps) {
  const saveModeOptions = [
    { label: t.saveModeDisabled, value: "0" },
    { label: t.saveModeOverwrite, value: "1" },
    { label: t.saveModeNumbered, value: "2" },
  ]

  return (
    <Card>
      <CardHeader>
        <h2><CardTitle>{t.serverSettings}</CardTitle></h2>
        <CardDescription>{t.serverSettingsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="version">{t.minecraftVersion}</FieldLabel>
            <Input
              id="version"
              name="version"
              autoComplete="off"
              spellCheck={false}
              value={config.version}
              onChange={(event) => onChange("version", event.target.value)}
            />
          </Field>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="protocol">{t.protocol}</FieldLabel>
              <Input
                id="protocol"
                name="protocol"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                max={65535}
                value={config.protocol}
                onChange={(event) =>
                  onChange("protocol", Number(event.target.value))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="port">{t.signalingPort}</FieldLabel>
              <Input
                id="port"
                name="port"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={65535}
                value={config.port}
                onChange={(event) =>
                  onChange("port", Number(event.target.value))
                }
              />
              <FieldDescription>{t.lanDiscovery}</FieldDescription>
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor="bind-address">{t.bindAddress}</FieldLabel>
            <Input
              id="bind-address"
              name="bind-address"
              autoComplete="off"
              spellCheck={false}
              value={config.bind_addr}
              onChange={(event) => onChange("bind_addr", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="save-mode">{t.saveMode}</FieldLabel>
            <Select
              name="savemode"
              items={saveModeOptions}
              value={String(config.savemode)}
              onValueChange={(value) => {
                if (value !== null) onChange("savemode", Number(value))
              }}
            >
              <SelectTrigger id="save-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {saveModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={busy}>
            <RiSaveLine data-icon="inline-start" aria-hidden="true" />{" "}
            {t.saveConfig}
          </Button>
          <Button variant="outline" onClick={onReload}>
            <RiRefreshLine data-icon="inline-start" aria-hidden="true" />{" "}
            {t.reload}
          </Button>
          <span className="text-sm text-muted-foreground" role="status">
            {statusText(message, t)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
