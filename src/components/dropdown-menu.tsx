"use client";

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const DropdownMenu = DropdownMenuPrimitive.Root;

export const DropdownMenuTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(function DropdownMenuTrigger({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Trigger ref={ref} {...props} className={joinClasses(className)} />;
});

DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent(
  { className, sideOffset = 4, collisionPadding = 8, align = "end", ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        {...props}
        className={joinClasses("dropdown-content", className)}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item ref={ref} {...props} className={joinClasses("dropdown-item", className)} />
  );
});

DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label ref={ref} {...props} className={joinClasses("dropdown-label", className)} />
  );
});

DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator ref={ref} {...props} className={joinClasses("dropdown-separator", className)} />
  );
});

DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
