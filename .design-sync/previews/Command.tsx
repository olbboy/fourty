import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator, CommandShortcut } from "fourty";

export const Palette = () => (
  <Command style={{ maxWidth: 420, border: "1px solid var(--border)", borderRadius: 14 }}>
    <CommandInput placeholder="Search records or run a command…" />
    <CommandList>
      <CommandGroup heading="Records">
        <CommandItem>Acme Corp</CommandItem>
        <CommandItem>Northwind Trading</CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem>New deal<CommandShortcut>⇧D</CommandShortcut></CommandItem>
        <CommandItem>Toggle theme</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
