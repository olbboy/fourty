import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, Button } from "fourty";

export const RecordDrawer = () => (
  <Sheet open>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Acme Corp</SheetTitle>
        <SheetDescription>128 people · Customer since 2024</SheetDescription>
      </SheetHeader>
      <div style={{ padding: 16, fontSize: 14, display: "grid", gap: 8 }}>
        <div>Open pipeline · $48,000</div>
        <div>Owner · Dana Whitfield</div>
        <Button size="sm" variant="outline">View company</Button>
      </div>
    </SheetContent>
  </Sheet>
);
