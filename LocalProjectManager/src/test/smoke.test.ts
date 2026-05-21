// @vitest-environment jsdom
describe('Smoke Test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to DOM APIs', () => {
    const div = document.createElement('div');
    expect(div).toBeDefined();
  });
});
