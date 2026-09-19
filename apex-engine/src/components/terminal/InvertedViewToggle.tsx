import { FlipVertical2 } from "lucide-react";
import { useTerminal } from "@/lib/market/store";
import { cn } from "@/lib/utils";

/**
 * 倒垂开关（价格轴翻转）。
 *
 * 状态放在 zustand 里而不是组件本地 state：ChartEngine 会在 pane 重挂载 / HMR 时
 * 重建，本地状态一旦比引擎活得久，就会出现「按钮显示倒垂、画面却是正的」。
 * 放 store 还顺带拿到持久化和多 pane 同步（桌面 + 移动端两份工具栏共用一个开关）。
 *
 * 与「红涨绿跌」互相独立：那个只换颜色，这个换几何。两个都开才是币安 App 里
 * 那种「整个图倒过来、颜色也反」的效果。
 */
export function InvertedViewToggle() {
  const mirror = useTerminal((s) => s.mirrorAxis);
  const toggle = useTerminal((s) => s.toggleMirrorAxis);

  return (
    <button
      type="button"
      aria-pressed={mirror}
      title={mirror ? "倒垂中：高价在下方，点击恢复正视图" : "倒垂：上下翻转价格轴（K 线与指标一起翻，成交量保持贴底）"}
      className={cn("flex items-center gap-1 rounded-sm px-1.5 py-0.5", mirror ? "bg-elevated text-gold" : "text-muted hover:text-fg")}
      onClick={toggle}
    >
      <FlipVertical2 className="size-3.5" />
      倒垂
    </button>
  );
}
