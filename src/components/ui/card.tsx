import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `size="flush"` is a card that owns no spacing — a hairline box, and the caller
 * decides what happens inside it — including its display and direction. It is
 * what this product reaches for: a panel here is usually a heading and a list,
 * padded once, not a header/content composition. `default` and `sm` keep the
 * stock rhythm for anything that wants `CardHeader` / `CardContent`.
 */
function Card({
  className,
  size = "default",
  render,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm" | "flush"
  /**
   * Render the card as another element — a `<form>`, a `<label>` around a file
   * input, a list item. Same prop name and behaviour as `Button`'s, which comes
   * from Base UI. Without it a card can only ever be a `<div>`, which is why
   * every panel in this product used to be hand-built instead.
   */
  render?: React.ReactElement<{ className?: string }>
}) {
  const element = (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        // Separation in this product is a 1px line, never a shadow — the same
        // hairline `.card` has always drawn. Stock shadcn ships `shadow-xs` and
        // a `ring-1`; both are dropped so the component and the CSS class are
        // the same object seen twice, rather than two different cards.
        "group/card overflow-hidden rounded-xl border border-line bg-card text-sm text-card-foreground *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        // `flush` owns no LAYOUT, not merely no spacing. The stock card is a
        // `flex flex-col`, and a caller that wants a row cannot take that back:
        // `flex-row` is the only class in `flex-direction`'s group, so passing
        // `flex flex-wrap items-center` leaves `flex-col` standing and the row
        // silently stacks. A flush card is a bordered box; what happens inside
        // it belongs to the caller, exactly as it did when this was a CSS class.
        size !== "flush" &&
          "flex flex-col gap-(--card-spacing) py-(--card-spacing) [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)]",
        className
      )}
      {...props}
    />
  )

  if (!render) return element
  return React.cloneElement(render, {
    ...element.props,
    className: cn(element.props.className, render.props.className),
  })
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

/**
 * `render` matters more here than on `Card`. A card title is a heading, and a
 * bare `<div>` puts nothing in the accessibility tree — a panel built from the
 * stock component announces as an unnamed group. Pass the level the page needs:
 * `<CardTitle render={<h2 />}>`.
 */
function CardTitle({
  className,
  render,
  ...props
}: React.ComponentProps<"div"> & { render?: React.ReactElement<{ className?: string }> }) {
  const element = (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )

  if (!render) return element
  return React.cloneElement(render, {
    ...element.props,
    className: cn(element.props.className, render.props.className),
  })
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex flex-col gap-3 px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
