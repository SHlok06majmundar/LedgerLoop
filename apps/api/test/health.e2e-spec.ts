import { createTestApp, type TestApp } from './test-app';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('reports the database as up inside the response envelope', async () => {
    const res = await t.http().get('/health').expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'ok', database: 'up' } });
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await t.http().get('/api/v1/does-not-exist').expect(404);

    expect(res.body).toEqual({
      success: false,
      message: 'Cannot GET /api/v1/does-not-exist',
      errorCode: 'NOT_FOUND',
      details: null,
    });
  });
});
