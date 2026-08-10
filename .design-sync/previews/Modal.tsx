import { Modal, Button, Field, FieldLabel, Input } from "fourty";

export const Open = () => (
  <Modal title="Edit contact" open onClose={() => {}}>
    <div style={{ display: "grid", gap: 12 }}>
      <Field>
        <FieldLabel htmlFor="m-name">Full name</FieldLabel>
        <Input id="m-name" defaultValue="Dana Whitfield" />
      </Field>
      <Field>
        <FieldLabel htmlFor="m-title">Job title</FieldLabel>
        <Input id="m-title" defaultValue="Head of Revenue" />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost">Cancel</Button>
        <Button>Save</Button>
      </div>
    </div>
  </Modal>
);
