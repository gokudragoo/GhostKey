import type { ComponentType, SVGProps } from "react";
import IconAlertTriangle from "@tabler/icons-react/dist/esm/icons/IconAlertTriangle.mjs";
import IconArrowUpRight from "@tabler/icons-react/dist/esm/icons/IconArrowUpRight.mjs";
import IconBolt from "@tabler/icons-react/dist/esm/icons/IconBolt.mjs";
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs";
import IconCopy from "@tabler/icons-react/dist/esm/icons/IconCopy.mjs";
import IconFileText from "@tabler/icons-react/dist/esm/icons/IconFileText.mjs";
import IconGauge from "@tabler/icons-react/dist/esm/icons/IconGauge.mjs";
import IconLock from "@tabler/icons-react/dist/esm/icons/IconLock.mjs";
import IconLogout from "@tabler/icons-react/dist/esm/icons/IconLogout.mjs";
import IconPlus from "@tabler/icons-react/dist/esm/icons/IconPlus.mjs";
import IconShieldCheck from "@tabler/icons-react/dist/esm/icons/IconShieldCheck.mjs";
import IconTerminal2 from "@tabler/icons-react/dist/esm/icons/IconTerminal2.mjs";
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs";
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs";

type Props = { size?: number; weight?: string; className?: string };
type IconComponent = ComponentType<
  Omit<SVGProps<SVGSVGElement>, "stroke"> & { size?: number; stroke?: number }
>;
const icon = (Component: IconComponent) =>
  function GhostKeyIcon({ size = 18, className = "" }: Props) {
    return (
      <Component
        size={size}
        stroke={1.8}
        className={className}
        aria-hidden="true"
      />
    );
  };

export const ArrowUpRight = icon(IconArrowUpRight);
export const Check = icon(IconCheck);
export const Copy = icon(IconCopy);
export const FileText = icon(IconFileText);
export const Gauge = icon(IconGauge);
export const Lightning = icon(IconBolt);
export const LockKey = icon(IconLock);
export const Plus = icon(IconPlus);
export const ShieldCheck = icon(IconShieldCheck);
export const SignOut = icon(IconLogout);
export const TerminalWindow = icon(IconTerminal2);
export const Trash = icon(IconTrash);
export const Warning = icon(IconAlertTriangle);
export const X = icon(IconX);
