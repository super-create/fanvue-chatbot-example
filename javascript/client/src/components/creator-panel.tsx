import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Save, Sparkles, Loader2 } from "lucide-react"
import { getCreatorPersona, saveCreatorPersona, type CreatorPersona } from "@/lib/api"
import { toast } from "sonner"

export function CreatorPanel() {
  const [persona, setPersona] = useState<CreatorPersona>({
    name: "",
    age: "",
    accent: "",
    location: "",
    timezone: "",
    physical: "",
    vibe: "",
    facts: "",
    other: "",
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPersona()
  }, [])

  const loadPersona = async () => {
    try {
      setLoading(true)
      const data = await getCreatorPersona()
      if (data) {
        setPersona(data)
      }
    } catch {
      toast.error("Failed to load persona")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await saveCreatorPersona(persona)
      toast.success("Persona saved successfully")
    } catch {
      toast.error("Failed to save persona")
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof CreatorPersona, value: string) => {
    setPersona((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="w-[320px] min-w-[320px] border-l border-[#2a2a2a] bg-[#1a1a1a] flex flex-col items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#00c853]" />
        <p className="mt-2 text-xs text-[#666]">Loading...</p>
      </div>
    )
  }

  return (
    <div className="w-[320px] min-w-[320px] border-l border-[#2a2a2a] bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-[#2a2a2a] flex items-center gap-3 shrink-0" style={{ padding: '0 10px' }}>
        <div className="h-8 w-8 rounded-full bg-[#00c853] flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-white truncate">Creator Persona</h2>
          <p className="text-xs text-[#666]">AI Identity</p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4" style={{ padding: '10px' }}>
          {/* Name & Age Row */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-[#888] uppercase font-medium">Name</label>
              <Input
                placeholder="Julie"
                className="h-9 text-sm bg-[#252525] border-[#333] text-white placeholder:text-[#555] rounded-lg"
                value={persona.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>
            <div className="w-20 space-y-1.5">
              <label className="text-xs text-[#888] uppercase font-medium">Age</label>
              <Input
                placeholder="25"
                className="h-9 text-sm bg-[#252525] border-[#333] text-white placeholder:text-[#555] rounded-lg"
                value={persona.age || ""}
                onChange={(e) => updateField("age", e.target.value)}
              />
            </div>
          </div>

          {/* Accent */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Accent / Style</label>
            <Input
              placeholder="British"
              className="h-9 text-sm bg-[#252525] border-[#333] text-white placeholder:text-[#555] rounded-lg"
              value={persona.accent || ""}
              onChange={(e) => updateField("accent", e.target.value)}
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Location</label>
            <Input
              placeholder="London"
              className="h-9 text-sm bg-[#252525] border-[#333] text-white placeholder:text-[#555] rounded-lg"
              value={persona.location || ""}
              onChange={(e) => updateField("location", e.target.value)}
            />
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Timezone</label>
            <Select
              value={persona.timezone || ""}
              onValueChange={(value) => updateField("timezone", value)}
            >
              <SelectTrigger className="h-9 text-sm bg-[#252525] border-[#333] text-white rounded-lg">
                <SelectValue placeholder="London (UK)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern (US)</SelectItem>
                <SelectItem value="America/Chicago">Central (US)</SelectItem>
                <SelectItem value="America/Denver">Mountain (US)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific (US)</SelectItem>
                <SelectItem value="Europe/London">London (UK)</SelectItem>
                <SelectItem value="Europe/Paris">Paris/Berlin</SelectItem>
                <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                <SelectItem value="Australia/Sydney">Sydney</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-[#2a2a2a] my-1" />

          {/* Physical */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Physical</label>
            <Textarea
              placeholder="Long blonde hair, athletic build..."
              className="min-h-[70px] text-sm bg-[#252525] border-[#333] resize-none text-white placeholder:text-[#555] rounded-lg"
              value={persona.physical || ""}
              onChange={(e) => updateField("physical", e.target.value)}
            />
          </div>

          {/* Vibe */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Personality</label>
            <Textarea
              placeholder="Flirty, playful, intelligent..."
              className="min-h-[70px] text-sm bg-[#252525] border-[#333] resize-none text-white placeholder:text-[#555] rounded-lg"
              value={persona.vibe || ""}
              onChange={(e) => updateField("vibe", e.target.value)}
            />
          </div>

          {/* Facts */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Facts</label>
            <Textarea
              placeholder="Love yoga, work as a nurse..."
              className="min-h-[70px] text-sm bg-[#252525] border-[#333] resize-none text-white placeholder:text-[#555] rounded-lg"
              value={persona.facts || ""}
              onChange={(e) => updateField("facts", e.target.value)}
            />
          </div>

          {/* Other */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#888] uppercase font-medium">Other Info</label>
            <Textarea
              placeholder="Any other context..."
              className="min-h-[70px] text-sm bg-[#252525] border-[#333] resize-none text-white placeholder:text-[#555] rounded-lg"
              value={persona.other || ""}
              onChange={(e) => updateField("other", e.target.value)}
            />
          </div>

          {/* Save */}
          <Button
            className="w-full h-10 text-sm bg-[#00c853] hover:bg-[#00a843] text-white rounded-lg shadow-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </ScrollArea>
    </div>
  )
}
