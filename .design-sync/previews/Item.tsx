import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemGroup, Button, Badge } from "fourty";

export const Default = () => (
  <Item style={{ maxWidth: 460 }}>
    <ItemContent>
      <ItemTitle>Acme Corp — Platform renewal</ItemTitle>
      <ItemDescription>Negotiation · $48,000 · closes 12 Mar</ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button size="sm" variant="ghost">Open</Button>
    </ItemActions>
  </Item>
);

export const Group = () => (
  <ItemGroup style={{ maxWidth: 460 }}>
    <Item>
      <ItemContent>
        <ItemTitle>Northwind Trading</ItemTitle>
        <ItemDescription>Proposal · $22,500</ItemDescription>
      </ItemContent>
      <ItemActions><Badge variant="secondary">65%</Badge></ItemActions>
    </Item>
    <Item>
      <ItemContent>
        <ItemTitle>Globex Industries</ItemTitle>
        <ItemDescription>Demo · $9,800</ItemDescription>
      </ItemContent>
      <ItemActions><Badge variant="secondary">45%</Badge></ItemActions>
    </Item>
  </ItemGroup>
);
