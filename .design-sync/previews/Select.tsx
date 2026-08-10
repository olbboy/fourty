import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "fourty";

// The trigger renders the selected VALUE, so the value carries the label the
// user should read — a lowercase slug here would show up verbatim in the field.
export const Open = () => (
  <div style={{ maxWidth: 260 }}>
    <Select open defaultValue="Negotiation">
      <SelectTrigger><SelectValue placeholder="Select a stage" /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Open</SelectLabel>
          <SelectItem value="Proposal">Proposal</SelectItem>
          <SelectItem value="Negotiation">Negotiation</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export const Closed = () => (
  <div style={{ maxWidth: 260 }}>
    <Select defaultValue="Negotiation">
      <SelectTrigger><SelectValue placeholder="Select a stage" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="Proposal">Proposal</SelectItem>
        <SelectItem value="Negotiation">Negotiation</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
