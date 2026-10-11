"use client";

import { forwardRef, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

const EMPTY_ITEM_VALUE = "__fourty_select_empty__";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SelectProps = Omit<
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "children" | "value" | "disabled"
> & {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: ReactNode;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
};

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function controlClasses(className?: string): string {
  const utilities = className
    ?.split(/\s+/)
    .filter((classNameToken) => classNameToken && classNameToken !== "input")
    .join(" ");
  return joinClasses("select-trigger", utilities);
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    value,
    defaultValue,
    placeholder = "Select…",
    name,
    required,
    disabled,
    open,
    defaultOpen,
    onOpenChange,
    onValueChange,
    className,
    ...triggerProps
  },
  forwardedRef,
) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const selectedValue = isControlled ? value : uncontrolledValue;
  const hasEmptyOption = options.some((option) => option.value === "");
  const internalValue = hasEmptyOption && selectedValue === "" ? EMPTY_ITEM_VALUE : selectedValue;

  function handleValueChange(nextValue: string): void {
    const nextExternalValue = nextValue === EMPTY_ITEM_VALUE ? "" : nextValue;
    if (value === undefined) setUncontrolledValue(nextExternalValue);
    onValueChange?.(nextExternalValue);
  }

  return (
    <SelectPrimitive.Root
      value={isControlled ? internalValue : undefined}
      defaultValue={isControlled ? undefined : internalValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <SelectPrimitive.Trigger
        {...triggerProps}
        ref={forwardedRef}
        disabled={disabled}
        className={controlClasses(className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select-icon" aria-hidden="true" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className="select-content"
        >
          <SelectPrimitive.Viewport className="select-viewport">
            {options.map((option) => {
              const internalOptionValue = option.value === "" ? EMPTY_ITEM_VALUE : option.value;
              return (
                <SelectPrimitive.Item
                  key={option.value || EMPTY_ITEM_VALUE}
                  value={internalOptionValue}
                  disabled={option.disabled}
                  className="select-item"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="select-item-indicator" aria-hidden="true">
                    ✓
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
      {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
    </SelectPrimitive.Root>
  );
});

Select.displayName = "Select";
