import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "fourty";

export const Records = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Company</TableHead>
        <TableHead>Stage</TableHead>
        <TableHead>Value</TableHead>
        <TableHead>Close</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Acme Corp</TableCell>
        <TableCell><Badge variant="secondary">Negotiation</Badge></TableCell>
        <TableCell>$48,000</TableCell>
        <TableCell>12 Mar</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Northwind Trading</TableCell>
        <TableCell><Badge variant="secondary">Proposal</Badge></TableCell>
        <TableCell>$22,500</TableCell>
        <TableCell>28 Mar</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Globex Industries</TableCell>
        <TableCell><Badge variant="secondary">Demo</Badge></TableCell>
        <TableCell>$9,800</TableCell>
        <TableCell>04 Apr</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
