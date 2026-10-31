# LedgerLoop

LedgerLoop tracks money a business is owed: the invoices it issues, the payments it receives, how those payments line up with bank statement lines, and who needs chasing.

## Language

### Tenancy

**Organization**:
A business using LedgerLoop. Every financial record belongs to exactly one Organization.
_Avoid_: Tenant, company, account

**Member**:
A User's membership in one Organization, carrying exactly one Role.
_Avoid_: Seat, employee

**Role**:
The permission level of a Member: Owner, Admin, Accountant, Manager, Staff or Viewer.
_Avoid_: Permission group

**Invitation**:
An expiring offer for an email address to become a Member of an Organization with a given Role.

### Receivables

**Customer**:
A party the Organization bills. Customers are archived, never deleted.
_Avoid_: Client, buyer, debtor

**Invoice**:
A request for payment from a Customer, made of Line Items. Moves through Draft, Issued, Partially Paid, Paid, Overdue and Void.
_Avoid_: Bill

**Line Item**:
One priced row on an Invoice: quantity times unit price, plus tax, less discount.

**Outstanding**:
The part of an Invoice's total not yet covered by Allocations.
_Avoid_: Balance due, remaining

**Payment**:
Money received from a Customer, recorded with a method and reference. A posted Payment is never deleted.
_Avoid_: Receipt, transaction

**Allocation**:
The portion of a Payment applied to one Invoice. One Payment can have Allocations to several Invoices.
_Avoid_: Application, settlement

**Unallocated**:
The part of a Payment not yet covered by its Allocations.

**Reversal**:
A record that cancels a posted Allocation or Payment while keeping the original for audit.
_Avoid_: Deletion, undo, refund

**Minor Unit**:
The smallest unit of a currency (paise for INR). All amounts are whole numbers of minor units.

### Reconciliation

**Bank Transaction**:
One line imported from a bank statement: date, description, amount and reference.
_Avoid_: Statement row, entry

**Import Job**:
One uploaded bank statement file being turned into Bank Transactions.

**Reconciliation Run**:
One pass of the matching engine over unreconciled Bank Transactions.

**Match**:
A proposed or confirmed link between a Bank Transaction and a Payment or Invoices, with a confidence score and the reasons behind it.
_Avoid_: Pairing, link

**Exception**:
A Bank Transaction that could not be confidently matched and needs a person to decide.
_Avoid_: Issue, error

**Discrepancy**:
A Match where the amounts disagree.

### Collections

**Communication**:
One email sent, or scheduled to be sent, to a Customer about their Invoices: an invoice delivery, a Reminder or a manual message. Failed Communications can be retried.
_Avoid_: Message, notification (for customer email)

**Notification**:
An in-app alert for a Member, such as an import finishing or an Exception being assigned to them.
_Avoid_: Alert, Communication

**Reminder**:
A message to a Customer about an Invoice that is coming due or overdue.
_Avoid_: Dunning letter, notice

**Aging Bucket**:
A band of days past the due date (not due, 1–30, 31–60, 61–90, 90+) used to group Outstanding amounts.
