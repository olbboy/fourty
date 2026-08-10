import { Kbd, KbdGroup } from "fourty";

export const Single = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
    <span>Open the palette</span>
    <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
  </div>
);

export const Shortcuts = () => (
  <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
      <span>New deal</span><KbdGroup><Kbd>⇧</Kbd><Kbd>D</Kbd></KbdGroup>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
      <span>Search records</span><KbdGroup><Kbd>/</Kbd></KbdGroup>
    </div>
  </div>
);
