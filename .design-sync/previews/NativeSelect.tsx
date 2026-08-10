import { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from "fourty";

export const Default = () => (
  <div style={{ maxWidth: 260 }}>
    <NativeSelect defaultValue="negotiation">
      <NativeSelectOption value="lead">Lead</NativeSelectOption>
      <NativeSelectOption value="qualified">Qualified</NativeSelectOption>
      <NativeSelectOption value="demo">Demo</NativeSelectOption>
      <NativeSelectOption value="negotiation">Negotiation</NativeSelectOption>
    </NativeSelect>
  </div>
);

export const Grouped = () => (
  <div style={{ maxWidth: 260 }}>
    <NativeSelect defaultValue="won">
      <NativeSelectOptGroup label="Open">
        <NativeSelectOption value="proposal">Proposal</NativeSelectOption>
        <NativeSelectOption value="negotiation">Negotiation</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="Closed">
        <NativeSelectOption value="won">Won</NativeSelectOption>
        <NativeSelectOption value="lost">Lost</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  </div>
);
