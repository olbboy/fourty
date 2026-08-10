import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Field, FieldLabel, Input } from "fourty";

export const NewDeal = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New deal</DialogTitle>
        <DialogDescription>Deals start in the first stage of the pipeline.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="d-name">Name</FieldLabel>
        <Input id="d-name" defaultValue="Acme Corp — Platform renewal" />
      </Field>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button>Create deal</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
