import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, Input } from "fourty";

export const Default = () => (
  <div style={{ maxWidth: 340 }}>
    <Field>
      <FieldLabel htmlFor="p-company">Company</FieldLabel>
      <Input id="p-company" defaultValue="Acme Corp" />
      <FieldDescription>Linked from the contact&rsquo;s email domain.</FieldDescription>
    </Field>
  </div>
);

export const WithError = () => (
  <div style={{ maxWidth: 340 }}>
    <Field data-invalid>
      <FieldLabel htmlFor="p-email">Work email</FieldLabel>
      <Input id="p-email" defaultValue="dana@" aria-invalid />
      <FieldError>Enter a full email address.</FieldError>
    </Field>
  </div>
);

export const Group = () => (
  <FieldGroup style={{ maxWidth: 340 }}>
    <Field>
      <FieldLabel htmlFor="p-first">First name</FieldLabel>
      <Input id="p-first" defaultValue="Dana" />
    </Field>
    <Field>
      <FieldLabel htmlFor="p-title">Job title</FieldLabel>
      <Input id="p-title" defaultValue="Head of Revenue" />
    </Field>
  </FieldGroup>
);
