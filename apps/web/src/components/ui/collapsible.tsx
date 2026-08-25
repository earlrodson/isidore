"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export function CollapsibleContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      className={cn(
        "overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className,
      )}
      {...props}
    />
  );
}
