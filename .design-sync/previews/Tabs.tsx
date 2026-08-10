import { Tabs, TabsList, TabsTrigger, TabsContent } from "fourty";

export const RecordTabs = () => (
  <Tabs defaultValue="activity" style={{ maxWidth: 420 }}>
    <TabsList>
      <TabsTrigger value="activity">Activity</TabsTrigger>
      <TabsTrigger value="notes">Notes</TabsTrigger>
      <TabsTrigger value="files">Files</TabsTrigger>
    </TabsList>
    <TabsContent value="activity" style={{ paddingTop: 12, fontSize: 14 }}>
      Dana Whitfield moved this deal to Negotiation · 2 days ago
    </TabsContent>
    <TabsContent value="notes" style={{ paddingTop: 12, fontSize: 14 }}>
      Procurement wants annual billing.
    </TabsContent>
  </Tabs>
);
