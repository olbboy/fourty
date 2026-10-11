"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export type ButtonVariant = "primary" | "neutral" | "danger";
export type ButtonSize = "default" | "compact";

type SharedButtonProps = {
  variant?: ButtonVariant;
  /** Alias used by the design-system decision record. */
  intent?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  loading?: boolean;
  asChild?: boolean;
  children?: ReactNode;
};

export type ButtonProps =
  | (SharedButtonProps &
      Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedButtonProps> & {
        href?: undefined;
      })
  | (SharedButtonProps &
      Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedButtonProps> & {
        href: string;
        type?: never;
        disabled?: boolean;
      });

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function variantClasses(variant: ButtonVariant): string {
  switch (variant) {
    case "danger":
      return "btn-danger ui-button-danger";
    case "neutral":
      return "btn-ghost ui-button-neutral";
    default:
      return "btn-primary ui-button-primary";
  }
}

function childClassName(child: ReactElement): string | undefined {
  const props = child.props as HTMLAttributes<HTMLElement>;
  return props.className;
}

/**
 * Small semantic button primitive. It renders a native button by default and
 * supports links through `href` or an existing element through `asChild`.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    intent,
    size = "default",
    busy = false,
    loading = false,
    asChild = false,
    children,
    className,
    disabled = false,
    type,
    ...rest
  } = props;
  const resolvedVariant = intent ?? variant;
  const isBusy = busy || loading;
  const resolvedClassName = joinClasses(
    "ui-button",
    variantClasses(resolvedVariant),
    `ui-button-${size}`,
    className,
  );

  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) return null;
    const typedChild = child as ReactElement<HTMLAttributes<HTMLElement>>;
    const childProps = typedChild.props;
    const { onClick: onClickProp, ...slotProps } = rest as HTMLAttributes<HTMLElement>;
    return cloneElement(typedChild, {
      ...slotProps,
      className: joinClasses(childClassName(child), resolvedClassName),
      "aria-busy": isBusy ? true : childProps["aria-busy"],
      "aria-disabled": disabled || isBusy ? true : childProps["aria-disabled"],
      onClick: (event) => {
        if (disabled || isBusy) {
          event.preventDefault();
          return;
        }
        childProps.onClick?.(event);
        if (!event.defaultPrevented) onClickProp?.(event);
      },
    });
  }

  if ("href" in props && props.href !== undefined) {
    const { href, target, rel, download, hrefLang, media, ping, referrerPolicy, onClick, ...anchorRest } = rest as Omit<
      AnchorHTMLAttributes<HTMLAnchorElement>,
      keyof SharedButtonProps
    >;
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        download={download}
        hrefLang={hrefLang}
        media={media}
        ping={ping}
        referrerPolicy={referrerPolicy}
        {...anchorRest}
        className={resolvedClassName}
        aria-busy={isBusy ? true : undefined}
        aria-disabled={disabled || isBusy ? true : undefined}
        onClick={(event) => {
          if (disabled || isBusy) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type ?? "button"}
      {...(rest as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedButtonProps>)}
      disabled={disabled || isBusy}
      aria-busy={isBusy ? true : undefined}
      className={resolvedClassName}
    >
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  "aria-label": string;
  variant?: ButtonVariant;
  intent?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  loading?: boolean;
};

/** Icon-only action with an explicit accessible name and a safe button type. */
export function IconButton({
    variant = "neutral",
    intent,
    size = "default",
    busy = false,
    loading = false,
    disabled = false,
    className,
    children,
    ...props
}: IconButtonProps) {
  const resolvedVariant = intent ?? variant;
  const isBusy = busy || loading;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || isBusy}
      aria-busy={isBusy ? true : undefined}
      className={joinClasses(
        "ui-button",
        "ui-icon-button",
        variantClasses(resolvedVariant),
        `ui-button-${size}`,
        className,
      )}
    >
      {children}
    </button>
  );
}
