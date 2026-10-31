import { JobQueue } from '../src/jobs/job-queue.service';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

export const HDFC_STATEMENT = [
  'HDFC BANK Ltd.',
  'Account No : 50100012345678',
  '',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '05/11/26,NEFT CR-ABC TRADERS PVT LTD-INV-2026-0001,UTR0001,05/11/26,,"25,000.00","1,25,000.00"',
  '06/11/26,UPI/SHARMA WHOLESALE/PAYMENT,UPI998877,06/11/26,,"12,500.50","1,37,500.50"',
  '07/11/26,BANK CHARGES,,07/11/26,118.00,,"1,37,382.50"',
  '31/02/26,BROKEN ROW,,31/02/26,,10.00,',
].join('\n');

describe('Bank statement imports', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let queue: JobQueue;

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
  });
  afterAll(() => t.close());

  const upload = (content: string, filename = 'statement.csv', headers = ctx.headers) =>
    t
      .http()
      .post('/api/v1/bank-imports')
      .set(headers)
      .attach('file', Buffer.from(content), { filename, contentType: 'text/csv' });

  async function importStatement(content = HDFC_STATEMENT) {
    const created = await upload(content).expect(201);
    const id = created.body.data.id as string;
    await t
      .http()
      .post(`/api/v1/bank-imports/${id}/confirm`)
      .set(ctx.headers)
      .send({ mapping: created.body.data.suggestedMapping, dateFormat: 'DD/MM/YYYY' })
      .expect(200);
    await queue.drain();
    return id;
  }

  it('reads the header past the bank preamble and suggests a mapping', async () => {
    const res = await upload(HDFC_STATEMENT).expect(201);

    expect(res.body.data).toMatchObject({
      status: 'AWAITING_MAPPING',
      fileName: 'statement.csv',
      headerRow: 4,
      headers: expect.arrayContaining(['Narration', 'Deposit Amt.']),
      suggestedMapping: {
        date: 'Date',
        description: 'Narration',
        reference: 'Chq./Ref.No.',
        debit: 'Withdrawal Amt.',
        credit: 'Deposit Amt.',
      },
    });
    expect(res.body.data.preview).toHaveLength(4);
  });

  it('imports rows in the background and reports failed rows', async () => {
    const id = await importStatement();

    const job = await t.http().get(`/api/v1/bank-imports/${id}`).set(ctx.headers).expect(200);
    expect(job.body.data).toMatchObject({
      status: 'COMPLETED',
      totalRows: 4,
      processedRows: 4,
      importedRows: 3,
      duplicateRows: 0,
      failedRows: 1,
    });

    const errors = await t
      .http()
      .get(`/api/v1/bank-imports/${id}/errors`)
      .set(ctx.headers)
      .expect(200);
    expect(errors.body.data).toEqual([
      { row: 8, message: 'Invalid date "31/02/26" (expected DD/MM/YYYY)', raw: expect.any(Object) },
    ]);

    const txns = await t
      .http()
      .get(`/api/v1/bank-transactions?importJobId=${id}&sort=transactionDate&order=asc`)
      .set(ctx.headers)
      .expect(200);
    expect(
      txns.body.data.map((x: { amountMinor: number; direction: string }) => [
        x.amountMinor,
        x.direction,
      ]),
    ).toEqual([
      [2_500_000, 'CREDIT'],
      [1_250_050, 'CREDIT'],
      [11_800, 'DEBIT'],
    ]);
    expect(txns.body.data[2].status).toBe('IGNORED');
  });

  it('skips lines already imported from an earlier statement', async () => {
    await importStatement();
    const second = await importStatement();

    const job = await t.http().get(`/api/v1/bank-imports/${second}`).set(ctx.headers).expect(200);

    expect(job.body.data).toMatchObject({ importedRows: 0, duplicateRows: 3 });
  });

  it('offers a downloadable error report', async () => {
    const id = await importStatement();

    const res = await t
      .http()
      .get(`/api/v1/bank-imports/${id}/errors?format=csv`)
      .set(ctx.headers)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('row,error');
    expect(res.text).toContain('Invalid date');
  });

  it('rejects files that are not CSV statements', async () => {
    const res = await upload('%PDF-1.7 binary', 'statement.pdf').expect(422);

    expect(res.body.errorCode).toBe('INVALID_STATEMENT_FILE');
  });

  it('keeps imports private to their organization', async () => {
    const id = await importStatement();
    const other = await setupOrg(t, 'rival@example.com', 'Rival');

    await t.http().get(`/api/v1/bank-imports/${id}`).set(other.headers).expect(404);
    const txns = await t.http().get('/api/v1/bank-transactions').set(other.headers).expect(200);
    expect(txns.body.data).toHaveLength(0);
  });
});
