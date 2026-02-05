import {
  Bot,
  Settings,
  Image,
  BarChart3,
  LogOut,
  MessageSquare
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ModalType } from "@/App"

const navItems = [
  { icon: MessageSquare, label: "Chats", id: "chats" as const },
  { icon: Bot, label: "AI Mode", id: "ai-mode" as const },
  { icon: Settings, label: "Configure AI", id: "configure" as const },
  { icon: Image, label: "Media Control", id: "media" as const },
  { icon: BarChart3, label: "Analytics", id: "analytics" as const },
]

interface AppSidebarProps {
  onOpenModal: (modal: ModalType) => void
}

export function AppSidebar({ onOpenModal }: AppSidebarProps) {
  const handleItemClick = (id: string) => {
    onOpenModal(id as ModalType)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="w-[52px] min-w-[52px] h-full bg-[#161616] border-r border-[#333] flex flex-col">
        {/* Logo/Avatar */}
        <div className="h-11 flex items-center justify-center border-b border-[#333]">
          <div className="h-7 w-7 rounded-full bg-[#00c853] flex items-center justify-center cursor-pointer hover:opacity-90">
            <span className="text-white text-xs font-bold">U</span>
          </div>
        </div>

        {/* Nav Items */}
        <div className="flex-1 py-2 flex flex-col items-center gap-1">
          {navItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleItemClick(item.id)}
                  className="h-9 w-9 flex items-center justify-center rounded-md text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#2a2a2a] border-[#444] text-white text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Logout */}
        <div className="py-2 flex justify-center border-t border-[#333]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { window.location.href = '/logout' }}
                className="h-9 w-9 flex items-center justify-center rounded-md text-[#888] hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#2a2a2a] border-[#444] text-white text-xs">
              Logout
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
